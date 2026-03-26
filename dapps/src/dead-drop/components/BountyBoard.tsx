import { useState } from "react";
import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { Transaction } from "@mysten/sui/transactions";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { BountyCard } from "./BountyCard";
import { Modal } from "./Modal";
import { CATEGORIES, DEAD_DROP_CONFIG, MODULES } from "../utils/config";
import { useBountyBoard } from "../hooks/useBountyBoard";
import { usePlayerAssets } from "../hooks/usePlayerAssets";
import { encryptIntel } from "../utils/crypto";
import type { Bounty } from "../utils/config";

export function BountyBoardPage() {
  const { bounties, loading, error, refetch } = useBountyBoard();
  const [selectedBounty, setSelectedBounty] = useState<Bounty | null>(null);
  const [claimIntel, setClaimIntel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const playerAssets = usePlayerAssets(account?.address);

  // Post bounty state
  const [showPostBounty, setShowPostBounty] = useState(false);
  const [bountyDesc, setBountyDesc] = useState("");
  const [bountyCategory, setBountyCategory] = useState("coordinates");
  const [bountyRewardTypeId, setBountyRewardTypeId] = useState("1");
  const [bountyRewardQty, setBountyRewardQty] = useState("10");
  const [bountyExpiryHours, setBountyExpiryHours] = useState("72");
  const [postingBounty, setPostingBounty] = useState(false);
  const [postBountyResult, setPostBountyResult] = useState<string | null>(null);
  const [postBountyError, setPostBountyError] = useState<string | null>(null);

  const handlePostBounty = async () => {
    if (!bountyDesc || !account || !playerAssets.characterId || !playerAssets.storageUnitId || !playerAssets.ownerCapId) return;
    setPostingBounty(true);
    setPostBountyError(null);

    try {
      const pkg = DEAD_DROP_CONFIG.packageId;
      const tx = new Transaction();

      const [ownerCap, returnReceipt] = tx.moveCall({
        target: `${pkg}::character::borrow_owner_cap`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(playerAssets.characterId),
          tx.object(playerAssets.ownerCapId),
        ],
      });

      tx.moveCall({
        target: `${pkg}::${MODULES.BOUNTY_BOARD}::post_bounty`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(DEAD_DROP_CONFIG.bountyBoardId),
          tx.object(playerAssets.storageUnitId),
          tx.object(playerAssets.characterId),
          ownerCap,
          tx.pure.vector("u8", Array.from(new TextEncoder().encode(bountyDesc))),
          tx.pure.vector("u8", Array.from(new TextEncoder().encode(bountyCategory))),
          tx.pure.u64(BigInt(bountyRewardTypeId)),
          tx.pure.u32(Number(bountyRewardQty)),
          tx.pure.u64(
            Number(bountyExpiryHours) > 0
              ? BigInt(Date.now() + Number(bountyExpiryHours) * 3600000)
              : 0n,
          ),
          tx.object("0x6"),
        ],
      });

      tx.moveCall({
        target: `${pkg}::character::return_owner_cap`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(playerAssets.characterId),
          ownerCap,
          returnReceipt,
        ],
      });

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      let digest = "";
      try {
        const jsonStr = JSON.stringify(result, (_, v) =>
          v instanceof Uint8Array ? "[bytes]" : typeof v === "bigint" ? v.toString() : v,
        );
        const m = jsonStr.match(/"(?:digest|transactionDigest)"\s*:\s*"([A-Za-z0-9]{32,50})"/);
        if (m) digest = m[1];
      } catch {}

      setPostBountyResult(digest);
      setBountyDesc("");
      setTimeout(refetch, 3000);
    } catch (e) {
      setPostBountyError(e instanceof Error ? e.message : "Failed to post bounty");
    } finally {
      setPostingBounty(false);
    }
  };

  const handleClaim = (index: number) => {
    const bounty = bounties.find((b) => b.index === index);
    if (bounty) {
      setSelectedBounty(bounty);
      setClaimIntel("");
      setSubmitResult(null);
      setSubmitError(null);
    }
  };

  const handleSubmitClaim = async () => {
    if (!selectedBounty || !claimIntel || !account) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const { ciphertext, key } = await encryptIntel(claimIntel);

      const tx = new Transaction();
      tx.moveCall({
        target: `${DEAD_DROP_CONFIG.packageId}::${MODULES.BOUNTY_BOARD}::submit_claim`,
        arguments: [
          tx.object(DEAD_DROP_CONFIG.bountyBoardId),
          tx.pure.u64(selectedBounty.index),
          tx.pure.vector("u8", Array.from(ciphertext)),
          tx.pure.vector("u8", Array.from(key)),
          tx.object("0x6"),
        ],
      });

      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });

      let digest = "";
      try {
        const jsonStr = JSON.stringify(result, (_, v) =>
          v instanceof Uint8Array ? "[bytes]" : typeof v === "bigint" ? v.toString() : v,
        );
        const m = jsonStr.match(/"(?:digest|transactionDigest)"\s*:\s*"([A-Za-z0-9]{32,50})"/);
        if (m) digest = m[1];
      } catch {}

      setSubmitResult(digest);
      setTimeout(refetch, 3000);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="center">
          <Flex direction="column" gap="1">
            <Heading size="5" style={{ color: "#facc15", fontFamily: "monospace" }}>
              // BOUNTY BOARD
            </Heading>
            <Text
              size="1"
              style={{ color: "var(--color-text-muted)", fontFamily: "monospace", opacity: 0.6 }}
            >
              Post bounties for intel you need. Anyone can claim by submitting information.
            </Text>
          </Flex>
          <Flex gap="3" align="center">
            <Text size="2" style={{ color: "var(--color-text-muted)", fontFamily: "monospace" }}>
              {bounties.filter((b) => b.status === 0).length} open
            </Text>
            <button
              onClick={() => { setShowPostBounty(true); setPostBountyResult(null); setPostBountyError(null); }}
              style={{
                backgroundColor: "rgba(250, 200, 21, 0.12)",
                color: "#facc15",
                border: "1px solid rgba(250, 200, 21, 0.25)",
                fontSize: 11,
                padding: "4px 14px",
                cursor: "pointer",
                fontFamily: "monospace",
                borderRadius: 4,
                letterSpacing: "0.05em",
              }}
            >
              + POST BOUNTY
            </button>
            <button
              onClick={refetch}
              style={{
                backgroundColor: "rgba(250, 200, 21, 0.08)",
                color: "#facc15",
                border: "1px solid rgba(250, 200, 21, 0.15)",
                fontSize: 11,
                padding: "4px 12px",
                cursor: "pointer",
                fontFamily: "monospace",
                borderRadius: 4,
              }}
            >
              REFRESH
            </button>
          </Flex>
        </Flex>

        {loading && (
          <Flex justify="center" py="6">
            <Text style={{ color: "#facc15", fontFamily: "monospace" }}>
              {">"} Scanning bounty board...
            </Text>
          </Flex>
        )}

        {error && (
          <div style={{
            backgroundColor: "rgba(248, 113, 113, 0.06)",
            border: "1px solid rgba(248, 113, 113, 0.2)",
            padding: "10px 14px", borderRadius: 4,
            fontFamily: "monospace", color: "#f87171", fontSize: 13,
          }}>
            [ERR] {error}
          </div>
        )}

        <Flex direction="column" gap="2">
          {!loading && bounties.length === 0 ? (
            <Flex justify="center" py="6">
              <Text style={{ color: "var(--color-text-muted)", fontFamily: "monospace", opacity: 0.5 }}>
                No bounties posted yet. The board is empty.
              </Text>
            </Flex>
          ) : (
            bounties.map((bounty) => (
              <BountyCard
                key={bounty.index}
                bounty={bounty}
                onClaim={handleClaim}
              />
            ))
          )}
        </Flex>
      </Flex>

      {/* Submit Claim Modal */}
      <Modal
        open={!!selectedBounty}
        onClose={() => setSelectedBounty(null)}
        title="// SUBMIT INTEL"
        accentColor="#facc15"
      >
        {selectedBounty && !submitResult && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase" }}>
                Bounty #{selectedBounty.index}
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 14, marginTop: 4, color: "var(--color-text)" }}>
                {selectedBounty.description}
              </div>
            </div>

            <div style={{
              backgroundColor: "rgba(250, 200, 21, 0.06)",
              border: "1px solid rgba(250, 200, 21, 0.15)",
              borderRadius: 4, padding: "10px 14px",
              fontFamily: "monospace", color: "#facc15",
            }}>
              Reward: {selectedBounty.rewardQuantity} x Type#{selectedBounty.rewardTypeId}
            </div>

            <div>
              <div style={{ color: "#f87171", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                YOUR INTEL (encrypted before submission)
              </div>
              <textarea
                style={{
                  backgroundColor: "rgba(250, 250, 229, 0.05)",
                  border: "1px solid rgba(250, 250, 229, 0.15)",
                  color: "var(--color-text)",
                  fontFamily: "monospace",
                  padding: "8px 12px",
                  borderRadius: 4,
                  width: "100%",
                  fontSize: 13,
                  minHeight: 100,
                  resize: "vertical",
                  outline: "none",
                }}
                value={claimIntel}
                onChange={(e) => setClaimIntel(e.target.value)}
                placeholder="Provide the intel requested in the bounty..."
              />
            </div>

            {submitError && (
              <div style={{
                backgroundColor: "rgba(248, 113, 113, 0.08)",
                border: "1px solid rgba(248, 113, 113, 0.2)",
                borderRadius: 4, padding: "10px 14px",
                fontFamily: "monospace", color: "#f87171", fontSize: 12,
              }}>
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setSelectedBounty(null)}
                style={{
                  flex: 1, backgroundColor: "rgba(250, 250, 229, 0.05)",
                  color: "var(--color-text-muted)", border: "1px solid rgba(250, 250, 229, 0.1)",
                  padding: "10px", fontSize: 12, fontFamily: "monospace", cursor: "pointer", borderRadius: 4,
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleSubmitClaim}
                disabled={!claimIntel || submitting}
                style={{
                  flex: 2,
                  backgroundColor: submitting ? "rgba(250, 200, 21, 0.08)" : "rgba(250, 200, 21, 0.12)",
                  color: "#facc15",
                  border: "1px solid rgba(250, 200, 21, 0.3)",
                  padding: "10px", fontSize: 12, fontFamily: "monospace",
                  cursor: !claimIntel || submitting ? "not-allowed" : "pointer",
                  opacity: !claimIntel || submitting ? 0.6 : 1,
                  borderRadius: 4, letterSpacing: "0.1em",
                }}
              >
                {submitting ? "SUBMITTING..." : "// ENCRYPT & SUBMIT CLAIM"}
              </button>
            </div>
          </div>
        )}

        {/* Success */}
        {selectedBounty && submitResult !== null && submitResult !== undefined && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              backgroundColor: "rgba(74, 222, 128, 0.08)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              borderRadius: 4, padding: "14px", textAlign: "center",
            }}>
              <div style={{ fontFamily: "monospace", color: "#4ade80", fontSize: 14 }}>
                Claim submitted! Awaiting poster review.
              </div>
              {submitResult && (
                <a
                  href={`https://suiscan.xyz/testnet/tx/${submitResult}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa" }}
                >
                  View on SuiScan →
                </a>
              )}
            </div>
            <button
              onClick={() => { setSelectedBounty(null); setSubmitResult(null); }}
              style={{
                backgroundColor: "rgba(74, 222, 128, 0.12)",
                color: "#4ade80", border: "1px solid rgba(74, 222, 128, 0.3)",
                padding: "10px", fontSize: 12, fontFamily: "monospace",
                cursor: "pointer", borderRadius: 4,
              }}
            >
              CLOSE
            </button>
          </div>
        )}
      </Modal>

      {/* Post Bounty Modal */}
      <Modal
        open={showPostBounty}
        onClose={() => setShowPostBounty(false)}
        title="// POST BOUNTY"
        accentColor="#facc15"
      >
        {!postBountyResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ color: "var(--color-text-muted)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                DESCRIPTION (what intel do you need?)
              </div>
              <textarea
                style={{
                  backgroundColor: "rgba(250, 250, 229, 0.05)",
                  border: "1px solid rgba(250, 250, 229, 0.15)",
                  color: "var(--color-text)", fontFamily: "monospace",
                  padding: "8px 12px", borderRadius: 4, width: "100%",
                  fontSize: 13, minHeight: 80, resize: "vertical", outline: "none",
                }}
                value={bountyDesc}
                onChange={(e) => setBountyDesc(e.target.value)}
                placeholder="Looking for coordinates of the abandoned refinery in Sector 12..."
              />
            </div>

            <div>
              <div style={{ color: "var(--color-text-muted)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                CATEGORY
              </div>
              <select
                style={{
                  backgroundColor: "rgba(250, 250, 229, 0.05)",
                  border: "1px solid rgba(250, 250, 229, 0.15)",
                  color: "var(--color-text)", fontFamily: "monospace",
                  padding: "8px 12px", borderRadius: 4, width: "100%",
                  fontSize: 13, cursor: "pointer", outline: "none",
                }}
                value={bountyCategory}
                onChange={(e) => setBountyCategory(e.target.value)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--color-text-muted)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                  REWARD (Type ID)
                </div>
                <input
                  type="number"
                  style={{
                    backgroundColor: "rgba(250, 250, 229, 0.05)",
                    border: "1px solid rgba(250, 250, 229, 0.15)",
                    color: "var(--color-text)", fontFamily: "monospace",
                    padding: "8px 12px", borderRadius: 4, width: "100%",
                    fontSize: 13, outline: "none",
                  }}
                  value={bountyRewardTypeId}
                  onChange={(e) => setBountyRewardTypeId(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--color-text-muted)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                  QUANTITY
                </div>
                <input
                  type="number"
                  style={{
                    backgroundColor: "rgba(250, 250, 229, 0.05)",
                    border: "1px solid rgba(250, 250, 229, 0.15)",
                    color: "var(--color-text)", fontFamily: "monospace",
                    padding: "8px 12px", borderRadius: 4, width: "100%",
                    fontSize: 13, outline: "none",
                  }}
                  value={bountyRewardQty}
                  onChange={(e) => setBountyRewardQty(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "var(--color-text-muted)", fontFamily: "monospace", fontSize: 10, textTransform: "uppercase", marginBottom: 4 }}>
                  EXPIRY (hours)
                </div>
                <input
                  type="number"
                  style={{
                    backgroundColor: "rgba(250, 250, 229, 0.05)",
                    border: "1px solid rgba(250, 250, 229, 0.15)",
                    color: "var(--color-text)", fontFamily: "monospace",
                    padding: "8px 12px", borderRadius: 4, width: "100%",
                    fontSize: 13, outline: "none",
                  }}
                  value={bountyExpiryHours}
                  onChange={(e) => setBountyExpiryHours(e.target.value)}
                />
              </div>
            </div>

            <div style={{
              backgroundColor: "rgba(96, 165, 250, 0.06)",
              border: "1px solid rgba(96, 165, 250, 0.15)",
              borderRadius: 4, padding: "10px 14px",
              fontFamily: "monospace", color: "#60a5fa", fontSize: 11, lineHeight: 1.6,
            }}>
              Reward items will be escrowed from your storage unit. They are returned if you cancel.
            </div>

            {postBountyError && (
              <div style={{
                backgroundColor: "rgba(248, 113, 113, 0.08)",
                border: "1px solid rgba(248, 113, 113, 0.2)",
                borderRadius: 4, padding: "10px 14px",
                fontFamily: "monospace", color: "#f87171", fontSize: 12,
              }}>
                {postBountyError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowPostBounty(false)}
                style={{
                  flex: 1, backgroundColor: "rgba(250, 250, 229, 0.05)",
                  color: "var(--color-text-muted)", border: "1px solid rgba(250, 250, 229, 0.1)",
                  padding: "10px", fontSize: 12, fontFamily: "monospace", cursor: "pointer", borderRadius: 4,
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handlePostBounty}
                disabled={!bountyDesc || postingBounty || !playerAssets.characterId}
                style={{
                  flex: 2,
                  backgroundColor: postingBounty ? "rgba(250, 200, 21, 0.08)" : "rgba(250, 200, 21, 0.12)",
                  color: "#facc15",
                  border: "1px solid rgba(250, 200, 21, 0.3)",
                  padding: "10px", fontSize: 12, fontFamily: "monospace",
                  cursor: !bountyDesc || postingBounty ? "not-allowed" : "pointer",
                  opacity: !bountyDesc || postingBounty ? 0.6 : 1,
                  borderRadius: 4, letterSpacing: "0.1em",
                }}
              >
                {postingBounty ? "POSTING..." : "// POST BOUNTY"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              backgroundColor: "rgba(74, 222, 128, 0.08)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              borderRadius: 4, padding: "14px", textAlign: "center",
            }}>
              <div style={{ fontFamily: "monospace", color: "#4ade80", fontSize: 14 }}>
                Bounty posted successfully!
              </div>
              {postBountyResult && (
                <a
                  href={`https://suiscan.xyz/testnet/tx/${postBountyResult}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "monospace", fontSize: 11, color: "#60a5fa" }}
                >
                  View on SuiScan →
                </a>
              )}
            </div>
            <button
              onClick={() => { setShowPostBounty(false); setPostBountyResult(null); }}
              style={{
                backgroundColor: "rgba(74, 222, 128, 0.12)",
                color: "#4ade80", border: "1px solid rgba(74, 222, 128, 0.3)",
                padding: "10px", fontSize: 12, fontFamily: "monospace",
                cursor: "pointer", borderRadius: 4,
              }}
            >
              CLOSE
            </button>
          </div>
        )}
      </Modal>
    </Container>
  );
}
