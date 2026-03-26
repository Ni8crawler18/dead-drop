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
 * Cancel an active intel listing.
 *
 * Usage: Set environment variables:
 *   LISTING_INDEX - Index of the listing to cancel
 */
async function main() {
    console.log("============= Cancel Dead Drop Listing ==============\n");

    try {
        const env = getEnvConfig();
        const ctx = initializeContext(env.network, env.adminExportedKey);
        const { client, keypair } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, intelRegistryId } = resolveDeadDropIdsFromEnv();
        const listingIndex = BigInt(requireEnv("LISTING_INDEX"));

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.INTEL_MARKET}::cancel_listing`,
            arguments: [
                tx.object(intelRegistryId),
                tx.pure.u64(listingIndex),
            ],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        console.log("Listing cancelled!");
        console.log("  Listing index:", listingIndex.toString());
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
