import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import {
    getEnvConfig,
    handleError,
    hydrateWorldConfig,
    initializeContext,
    extractEvent,
    requireEnv,
} from "../utils/helper";
import { resolveDeadDropIdsFromEnv } from "./extension-ids";
import { MODULE } from "./modules";
import { decryptIntel, fromHex } from "./crypto";
import { deriveObjectId } from "../utils/derive-object-id";
import { getCharacterOwnerCap } from "../helpers/character";

/**
 * Purchase intel from a Dead Drop listing.
 *
 * Usage: Set environment variables:
 *   LISTING_INDEX       - Index of the listing to purchase
 *   PLAYER_PRIVATE_KEY  - Buyer's private key (or ADMIN_PRIVATE_KEY)
 *   CHARACTER_ITEM_ID   - Buyer's character item ID
 *   STORAGE_UNIT_ITEM_ID - Storage unit to pay from
 *   ENCRYPTED_CIPHERTEXT - (optional) hex ciphertext to decrypt after purchase
 */
async function main() {
    console.log("============= Purchase Dead Drop Intel ==============\n");

    try {
        const env = getEnvConfig();
        const playerKey = process.env.PLAYER_PRIVATE_KEY || env.adminExportedKey;
        const ctx = initializeContext(env.network, playerKey);
        const { client, keypair, config, address } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, configId, intelRegistryId } = resolveDeadDropIdsFromEnv();

        const listingIndex = BigInt(requireEnv("LISTING_INDEX"));
        const characterItemId = BigInt(requireEnv("CHARACTER_ITEM_ID"));
        const storageUnitItemId = BigInt(requireEnv("STORAGE_UNIT_ITEM_ID"));

        const characterId = deriveObjectId(config.objectRegistry, characterItemId, config.packageId);
        const storageUnitId = deriveObjectId(config.objectRegistry, storageUnitItemId, config.packageId);

        // Get owner cap for the storage unit
        const ownerCapId = await getCharacterOwnerCap(characterId, client, config, address);
        if (!ownerCapId) {
            throw new Error("OwnerCap not found for character");
        }

        const tx = new Transaction();

        // Borrow owner cap
        const [ownerCap, returnReceipt] = tx.moveCall({
            target: `${config.packageId}::character::borrow_owner_cap`,
            typeArguments: [`${config.packageId}::storage_unit::StorageUnit`],
            arguments: [tx.object(characterId), tx.object(ownerCapId)],
        });

        // Purchase intel
        tx.moveCall({
            target: `${builderPackageId}::${MODULE.INTEL_MARKET}::purchase_intel`,
            typeArguments: [`${config.packageId}::storage_unit::StorageUnit`],
            arguments: [
                tx.object(intelRegistryId),
                tx.object(configId),
                tx.object(storageUnitId),
                tx.object(characterId),
                ownerCap,
                tx.pure.u64(listingIndex),
                tx.object("0x6"), // Clock
            ],
        });

        // Return owner cap
        tx.moveCall({
            target: `${config.packageId}::character::return_owner_cap`,
            typeArguments: [`${config.packageId}::storage_unit::StorageUnit`],
            arguments: [tx.object(characterId), ownerCap, returnReceipt],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        // Extract the decryption key from the event
        const event = extractEvent<{
            listing_index: string;
            buyer: string;
            provider: string;
            decryption_key: number[];
        }>(result, "::intel_market::IntelPurchased");

        console.log("\nIntel purchased!");
        if (event) {
            console.log("  Listing index:", event.listing_index);
            console.log("  Provider:", event.provider);

            const keyBytes = new Uint8Array(event.decryption_key);
            console.log("  Decryption key:", fromHex.length, "bytes");

            // If ciphertext is provided, decrypt immediately
            const ciphertextHex = process.env.ENCRYPTED_CIPHERTEXT;
            if (ciphertextHex) {
                const ciphertext = fromHex(ciphertextHex);
                const plaintext = await decryptIntel(ciphertext, keyBytes);
                console.log("\n  === DECRYPTED INTEL ===");
                console.log(" ", plaintext);
                console.log("  ======================");
            } else {
                console.log("\n  To decrypt, use the key with the ciphertext from the listing.");
            }
        }
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
