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
 * Reject a bounty claim and reopen the bounty.
 *
 * Usage: Set environment variables:
 *   BOUNTY_INDEX - Index of the bounty with pending claim
 */
async function main() {
    console.log("============= Reject Bounty Claim ==============\n");

    try {
        const env = getEnvConfig();
        const ctx = initializeContext(env.network, env.adminExportedKey);
        const { client, keypair } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, bountyBoardId } = resolveDeadDropIdsFromEnv();

        const bountyIndex = BigInt(requireEnv("BOUNTY_INDEX"));

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.BOUNTY_BOARD}::reject_claim`,
            arguments: [
                tx.object(bountyBoardId),
                tx.pure.u64(bountyIndex),
            ],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        console.log("Claim rejected! Bounty reopened.");
        console.log("  Bounty index:", bountyIndex.toString());
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
