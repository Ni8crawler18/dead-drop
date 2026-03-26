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
import { deriveObjectId } from "../utils/derive-object-id";
import { getCharacterOwnerCap } from "../helpers/character";

/**
 * Post a bounty requesting specific intel.
 *
 * Usage: Set environment variables:
 *   BOUNTY_DESCRIPTION    - What intel you're looking for
 *   BOUNTY_CATEGORY       - Category tag
 *   REWARD_TYPE_ID        - Item type_id for reward
 *   REWARD_QUANTITY       - Item quantity for reward
 *   EXPIRY_HOURS          - Hours until expiry (0 = no expiry)
 *   CHARACTER_ITEM_ID     - Poster's character item ID
 *   STORAGE_UNIT_ITEM_ID  - Storage unit to escrow reward from
 */
async function main() {
    console.log("============= Post Dead Drop Bounty ==============\n");

    try {
        const env = getEnvConfig();
        const ctx = initializeContext(env.network, env.adminExportedKey);
        const { client, keypair, config, address } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, bountyBoardId } = resolveDeadDropIdsFromEnv();

        const description = process.env.BOUNTY_DESCRIPTION || "Looking for resource cache coordinates in sector 7";
        const category = process.env.BOUNTY_CATEGORY || "coordinates";
        const rewardTypeId = BigInt(process.env.REWARD_TYPE_ID || "1");
        const rewardQuantity = Number(process.env.REWARD_QUANTITY || "20");
        const expiryHours = Number(process.env.EXPIRY_HOURS || "0");
        const characterItemId = BigInt(requireEnv("CHARACTER_ITEM_ID"));
        const storageUnitItemId = BigInt(requireEnv("STORAGE_UNIT_ITEM_ID"));

        const characterId = deriveObjectId(config.objectRegistry, characterItemId, config.packageId);
        const storageUnitId = deriveObjectId(config.objectRegistry, storageUnitItemId, config.packageId);
        const expiresAtMs = expiryHours > 0 ? Date.now() + expiryHours * 60 * 60 * 1000 : 0;

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

        // Post bounty (escrows reward items)
        tx.moveCall({
            target: `${builderPackageId}::${MODULE.BOUNTY_BOARD}::post_bounty`,
            typeArguments: [`${config.packageId}::storage_unit::StorageUnit`],
            arguments: [
                tx.object(bountyBoardId),
                tx.object(storageUnitId),
                tx.object(characterId),
                ownerCap,
                tx.pure.vector("u8", Array.from(new TextEncoder().encode(description))),
                tx.pure.vector("u8", Array.from(new TextEncoder().encode(category))),
                tx.pure.u64(rewardTypeId),
                tx.pure.u32(rewardQuantity),
                tx.pure.u64(expiresAtMs),
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

        const event = extractEvent<{
            bounty_index: string;
            poster: string;
        }>(result, "::bounty_board::BountyPosted");

        console.log("\nBounty posted!");
        if (event) {
            console.log("  Bounty index:", event.bounty_index);
        }
        console.log("  Description:", description);
        console.log("  Category:", category);
        console.log("  Reward:", rewardQuantity, "x type", rewardTypeId.toString());
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
