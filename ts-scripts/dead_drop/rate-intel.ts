import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import {
    getEnvConfig,
    handleError,
    hydrateWorldConfig,
    initializeContext,
    requireEnv,
} from "../utils/helper";
import { resolveDeadDropIdsFromEnv } from "./extension-ids";
import { MODULE } from "./modules";

/**
 * Rate purchased intel as positive or negative.
 *
 * Usage: Set environment variables:
 *   LISTING_INDEX      - Index of the purchased listing
 *   RATING_POSITIVE    - "true" for positive, "false" for negative
 *   PLAYER_PRIVATE_KEY - Buyer's private key
 */
async function main() {
    console.log("============= Rate Dead Drop Intel ==============\n");

    try {
        const env = getEnvConfig();
        const playerKey = process.env.PLAYER_PRIVATE_KEY || env.adminExportedKey;
        const ctx = initializeContext(env.network, playerKey);
        const { client, keypair } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, configId, intelRegistryId } = resolveDeadDropIdsFromEnv();

        const listingIndex = BigInt(requireEnv("LISTING_INDEX"));
        const positive = (process.env.RATING_POSITIVE || "true") === "true";

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.INTEL_MARKET}::rate_intel`,
            arguments: [
                tx.object(intelRegistryId),
                tx.object(configId),
                tx.pure.u64(listingIndex),
                tx.pure.bool(positive),
                tx.object("0x6"), // Clock
            ],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        console.log(`Intel rated ${positive ? "POSITIVE" : "NEGATIVE"}!`);
        console.log("  Listing index:", listingIndex.toString());
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
