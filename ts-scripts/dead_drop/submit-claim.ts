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
import { encryptIntel, toHex } from "./crypto";

/**
 * Submit a claim for a bounty with encrypted intel.
 *
 * Usage: Set environment variables:
 *   BOUNTY_INDEX        - Index of the bounty to claim
 *   CLAIM_INTEL_TEXT    - Intel content to encrypt and submit
 *   PLAYER_PRIVATE_KEY  - Claimant's private key
 */
async function main() {
    console.log("============= Submit Bounty Claim ==============\n");

    try {
        const env = getEnvConfig();
        const playerKey = process.env.PLAYER_PRIVATE_KEY || env.adminExportedKey;
        const ctx = initializeContext(env.network, playerKey);
        const { client, keypair } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, bountyBoardId } = resolveDeadDropIdsFromEnv();

        const bountyIndex = BigInt(requireEnv("BOUNTY_INDEX"));
        const intelText = process.env.CLAIM_INTEL_TEXT || "Resource cache at coordinates: X=1234, Y=5678, Z=9012";

        // Encrypt the intel
        console.log("Encrypting intel...");
        const { ciphertext, key } = await encryptIntel(intelText);
        console.log("  Ciphertext:", toHex(ciphertext));
        console.log("  Key:", toHex(key));

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.BOUNTY_BOARD}::submit_claim`,
            arguments: [
                tx.object(bountyBoardId),
                tx.pure.u64(bountyIndex),
                tx.pure.vector("u8", Array.from(ciphertext)),
                tx.pure.vector("u8", Array.from(key)),
                tx.object("0x6"), // Clock
            ],
        });

        const result = await client.signAndExecuteTransaction({
            transaction: tx,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        console.log("\nClaim submitted!");
        console.log("  Bounty index:", bountyIndex.toString());
        console.log("  Awaiting poster review...");
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
