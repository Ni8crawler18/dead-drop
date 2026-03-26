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

/**
 * Accept a bounty claim. Reveals the decryption key to the poster.
 *
 * Usage: Set environment variables:
 *   BOUNTY_INDEX          - Index of the bounty with pending claim
 *   ENCRYPTED_CIPHERTEXT  - (optional) Hex ciphertext to decrypt after accept
 */
async function main() {
    console.log("============= Accept Bounty Claim ==============\n");

    try {
        const env = getEnvConfig();
        const ctx = initializeContext(env.network, env.adminExportedKey);
        const { client, keypair } = ctx;
        await hydrateWorldConfig(ctx);

        const { builderPackageId, bountyBoardId } = resolveDeadDropIdsFromEnv();

        const bountyIndex = BigInt(requireEnv("BOUNTY_INDEX"));

        const tx = new Transaction();

        tx.moveCall({
            target: `${builderPackageId}::${MODULE.BOUNTY_BOARD}::accept_claim`,
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

        const event = extractEvent<{
            bounty_index: string;
            poster: string;
            claimant: string;
            decryption_key: number[];
        }>(result, "::bounty_board::BountyAccepted");

        console.log("\nBounty claim accepted!");
        if (event) {
            console.log("  Bounty index:", event.bounty_index);
            console.log("  Claimant:", event.claimant);

            const keyBytes = new Uint8Array(event.decryption_key);

            // Attempt decryption if ciphertext provided
            const ciphertextHex = process.env.ENCRYPTED_CIPHERTEXT;
            if (ciphertextHex) {
                const ciphertext = fromHex(ciphertextHex);
                const plaintext = await decryptIntel(ciphertext, keyBytes);
                console.log("\n  === DECRYPTED INTEL ===");
                console.log(" ", plaintext);
                console.log("  ======================");
            }
        }
        console.log("Transaction digest:", result.digest);
    } catch (error) {
        handleError(error);
    }
}

main();
