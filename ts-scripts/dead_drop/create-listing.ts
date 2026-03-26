import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import {
    getEnvConfig,
    handleError,
    hydrateWorldConfig,
    initializeContext,
    extractEvent,
} from "../utils/helper";
import { resolveDeadDropIdsFromEnv } from "./extension-ids";
import { MODULE } from "./modules";
import { encryptIntel, toHex } from "./crypto";

/**
 * Create an intel listing on the Dead Drop market.
 *
 * Usage: Set environment variables:
 *   INTEL_TEXT     - The intel content to encrypt and sell
 *   INTEL_TITLE    - Human-readable title
 *   INTEL_CATEGORY - Category tag (e.g. "coordinates", "fleet", "trade")
 *   PRICE_TYPE_ID  - Item type_id for payment
 *   PRICE_QUANTITY - Item quantity for payment
 *   EXPIRY_HOURS   - Hours until expiry (0 = no expiry)
 */
async function main() {
    console.log("============= Create Dead Drop Listing ==============\n");

    try {
        const env = getEnvConfig();
        const ctx = initializeContext(env.network, env.adminExportedKey);
        const { client, keypair } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, intelRegistryId } = resolveDeadDropIdsFromEnv();

        // Read intel parameters from env
        const intelText = process.env.INTEL_TEXT || "Secret coordinates: sector 7G, grid 42-19";
        const title = process.env.INTEL_TITLE || "Hidden Resource Cache Location";
        const category = process.env.INTEL_CATEGORY || "coordinates";
        const priceTypeId = BigInt(process.env.PRICE_TYPE_ID || "1");
        const priceQuantity = Number(process.env.PRICE_QUANTITY || "10");
        const expiryHours = Number(process.env.EXPIRY_HOURS || "0");

        // Encrypt the intel content
        console.log("Encrypting intel...");
        const { ciphertext, key } = await encryptIntel(intelText);
        console.log("  Ciphertext length:", ciphertext.length, "bytes");
        console.log("  Key (SAVE THIS):", toHex(key));

        const expiresAtMs = expiryHours > 0 ? Date.now() + expiryHours * 60 * 60 * 1000 : 0;

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.INTEL_MARKET}::create_listing`,
            arguments: [
                tx.object(intelRegistryId),
                tx.pure.vector("u8", Array.from(ciphertext)),
                tx.pure.vector("u8", Array.from(key)),
                tx.pure.vector("u8", Array.from(new TextEncoder().encode(category))),
                tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
                tx.pure.u64(priceTypeId),
                tx.pure.u32(priceQuantity),
                tx.pure.u64(expiresAtMs),
                tx.object("0x6"), // Clock
            ],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        const event = extractEvent<{
            listing_index: string;
            provider: string;
            title: number[];
        }>(result, "::intel_market::ListingCreated");

        console.log("\nListing created!");
        if (event) {
            console.log("  Listing index:", event.listing_index);
            console.log("  Provider:", event.provider);
        }
        console.log("  Title:", title);
        console.log("  Category:", category);
        console.log("  Price:", priceQuantity, "x type", priceTypeId.toString());
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
