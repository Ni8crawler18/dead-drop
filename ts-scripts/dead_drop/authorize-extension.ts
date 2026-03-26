import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import {
    getEnvConfig,
    handleError,
    hydrateWorldConfig,
    initializeContext,
    requireEnv,
} from "../utils/helper";
import { MODULES } from "../utils/config";
import { resolveDeadDropIdsFromEnv } from "./extension-ids";
import { MODULE } from "./modules";
import { deriveObjectId } from "../utils/derive-object-id";
import { getOwnerCap as getStorageUnitOwnerCap } from "../helpers/storage-unit-extension";

/**
 * Authorize the DeadDropAuth extension on a storage unit.
 * Must be run by the storage unit owner (Player A).
 */
async function main() {
    console.log("============= Authorize Dead Drop Extension ==============\n");

    try {
        const env = getEnvConfig();
        const playerKey = requireEnv("PLAYER_A_PRIVATE_KEY");
        const ctx = initializeContext(env.network, playerKey);
        await hydrateWorldConfig(ctx);
        const { client, keypair, config, address } = ctx;

        const { builderPackageId } = resolveDeadDropIdsFromEnv();

        const characterItemId = BigInt(process.env.CHARACTER_ITEM_ID || "811880");
        const storageUnitItemId = BigInt(process.env.STORAGE_UNIT_ITEM_ID || "888800006");

        const characterId = deriveObjectId(config.objectRegistry, characterItemId, config.packageId);
        const storageUnitId = deriveObjectId(config.objectRegistry, storageUnitItemId, config.packageId);

        console.log("Character ID:", characterId);
        console.log("Storage Unit ID:", storageUnitId);

        const storageUnitOwnerCapId = await getStorageUnitOwnerCap(
            storageUnitId,
            client,
            config,
            address,
        );
        if (!storageUnitOwnerCapId) {
            throw new Error("OwnerCap not found for storage unit");
        }
        console.log("OwnerCap ID:", storageUnitOwnerCapId);

        const authType = `${builderPackageId}::${MODULE.CONFIG}::DeadDropAuth`;
        console.log("Auth type:", authType);

        const tx = new Transaction();

        const [ownerCap, returnReceipt] = tx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::borrow_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.STORAGE_UNIT}::StorageUnit`],
            arguments: [tx.object(characterId), tx.object(storageUnitOwnerCapId)],
        });

        tx.moveCall({
            target: `${config.packageId}::${MODULES.STORAGE_UNIT}::authorize_extension`,
            typeArguments: [authType],
            arguments: [tx.object(storageUnitId), ownerCap],
        });

        tx.moveCall({
            target: `${config.packageId}::${MODULES.CHARACTER}::return_owner_cap`,
            typeArguments: [`${config.packageId}::${MODULES.STORAGE_UNIT}::StorageUnit`],
            arguments: [tx.object(characterId), ownerCap, returnReceipt],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        console.log("\nDeadDropAuth authorized on storage unit!");
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
