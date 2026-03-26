import "dotenv/config";
import { Transaction } from "@mysten/sui/transactions";
import { getEnvConfig, handleError, hydrateWorldConfig, initializeContext } from "../utils/helper";
import { resolveDeadDropIds } from "./extension-ids";
import { MODULE } from "./modules";

const RATING_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_LISTINGS_PER_PROVIDER = 0; // unlimited

async function main() {
    console.log("============= Configure Dead Drop Market ==============\n");

    try {
        const env = getEnvConfig();
        const ctx = initializeContext(env.network, env.adminExportedKey);
        const { client, keypair, address } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, adminCapId, configId } =
            await resolveDeadDropIds(client, address);

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.INTEL_MARKET}::set_market_config`,
            arguments: [
                tx.object(configId),
                tx.object(adminCapId),
                tx.pure.u64(RATING_WINDOW_MS),
                tx.pure.u64(MAX_LISTINGS_PER_PROVIDER),
            ],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showObjectChanges: true },
        });

        console.log("Dead Drop market configured!");
        console.log("  Rating window:", RATING_WINDOW_MS, "ms");
        console.log("  Max listings per provider:", MAX_LISTINGS_PER_PROVIDER || "unlimited");
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
