import { useState } from "react";
import { Box, Container, Flex, Heading, Text } from "@radix-ui/themes";
import { Transaction } from "@mysten/sui/transactions";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { ListingCard } from "./ListingCard";
import { Modal } from "./Modal";
import { PlayerStatus } from "./PlayerStatus";
import { CATEGORIES, DEAD_DROP_CONFIG, MODULES } from "../utils/config";
import { useIntelRegistry } from "../hooks/useIntelRegistry";
import { usePlayerAssets } from "../hooks/usePlayerAssets";
import { decryptIntel } from "../utils/crypto";
import type { IntelListing, Category } from "../utils/config";

type PurchaseState =
  | { step: "idle" }
  | { step: "confirming"; listing: IntelListing }
  | { step: "signing"; listing: IntelListing }
  | { step: "success"; listing: IntelListing; txDigest: string; decryptedIntel: string | null; decryptionKeyHex: string }
  | { step: "error"; listing: IntelListing; message: string };

export function Marketplace() {
  const [filter, setFilter] = useState<Category | "all">("all");
  const { listings, loading, error, refetch } = useIntelRegistry();
  const [purchase, setPurchase] = useState<PurchaseState>({ step: "idle" });
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const playerAssets = usePlayerAssets(account?.address);
  const [ratingStatus, setRatingStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [ratedPositive, setRatedPositive] = useState<boolean | null>(null);

  const filtered =
    filter === "all"
      ? listings
      : listings.filter((l) => l.category === filter);

  const handlePurchase = (listingIndex: number) => {
    const listing = listings.find((l) => l.index === listingIndex);
    if (listing) setPurchase({ step: "confirming", listing });
  };

  const handleConfirm = async () => {
    if (purchase.step !== "confirming") return;
    const { listing } = purchase;

    setPurchase({ step: "signing", listing });

    try {
      if (!playerAssets.characterId || !playerAssets.storageUnitId || !playerAssets.ownerCapId) {
        throw new Error("No EVE Frontier character or storage unit found for your wallet. Create one first via the game client.");
      }

      const pkg = DEAD_DROP_CONFIG.packageId;
      const tx = new Transaction();

      // Step 1: Borrow OwnerCap from Character (Receiving pattern)
      const [ownerCap, returnReceipt] = tx.moveCall({
        target: `${pkg}::character::borrow_owner_cap`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(playerAssets.characterId),
          tx.object(playerAssets.ownerCapId),
        ],
      });

      // Step 2: Call purchase_intel
      tx.moveCall({
        target: `${pkg}::${MODULES.INTEL_MARKET}::purchase_intel`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(DEAD_DROP_CONFIG.registryId),
          tx.object(DEAD_DROP_CONFIG.configId),
          tx.object(playerAssets.storageUnitId),
          tx.object(playerAssets.characterId),
          ownerCap,
          tx.pure.u64(listing.index),
          tx.object("0x6"), // Clock
        ],
      });

      // Step 3: Return OwnerCap to Character
      tx.moveCall({
        target: `${pkg}::character::return_owner_cap`,
        typeArguments: [`${pkg}::storage_unit::StorageUnit`],
        arguments: [
          tx.object(playerAssets.characterId),
          ownerCap,
          returnReceipt,
        ],
      });

      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });

      // Extract digest from wallet response
      let txDigest = "";
      try {
        const jsonStr = JSON.stringify(result, (_, v) =>
          v instanceof Uint8Array ? `[bytes]` : typeof v === "bigint" ? v.toString() : v
        );
        const digestMatch = jsonStr.match(/"(?:digest|transactionDigest)"\s*:\s*"([A-Za-z0-9]{32,50})"/);
        if (digestMatch) txDigest = digestMatch[1];
      } catch {
        // fallback: no digest
      }

      // Fetch full transaction to get events (wallet response may not include them)
      let decryptionKeyHex = "";
      let decryptedText: string | null = null;
      const RPC = import.meta.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";

      if (txDigest) {
        // Wait a moment for indexing
        await new Promise((r) => setTimeout(r, 2000));

        try {
          const txDetails = await fetch(RPC, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "sui_getTransactionBlock",
              params: [txDigest, { showEvents: true }],
            }),
          }).then((r) => r.json());

          const events = txDetails?.result?.events || [];
          const purchaseEvent = events.find((e: any) =>
            e.type?.includes("::intel_market::IntelPurchased"),
          );

          if (purchaseEvent?.parsedJson?.decryption_key) {
            const keyArr: number[] = purchaseEvent.parsedJson.decryption_key;
            const keyBytes = new Uint8Array(keyArr);
            decryptionKeyHex =
              "0x" +
              Array.from(keyBytes)
                .map((b: number) => b.toString(16).padStart(2, "0"))
                .join("");

            // Fetch ciphertext from registry and decrypt
            try {
              const registryObj = await fetch(RPC, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "sui_getObject",
                  params: [DEAD_DROP_CONFIG.registryId, { showContent: true }],
                }),
              }).then((r) => r.json());

              const listings =
                registryObj?.result?.data?.content?.fields?.listings || [];
              const rawListing = listings[listing.index];
              if (rawListing) {
                const ciphertextArr: number[] =
                  (rawListing.fields || rawListing).encrypted_intel || [];
                const ciphertext = new Uint8Array(ciphertextArr);
                decryptedText = await decryptIntel(ciphertext, keyBytes);
              }
            } catch {
              // Decryption is best-effort
            }
          }
        } catch {
          // Event fetch failed, still show success with digest
        }
      }

      setPurchase({
        step: "success",
        listing,
        txDigest,
        decryptedIntel: decryptedText,
        decryptionKeyHex,
      });

      // Refresh listings after purchase
      setTimeout(refetch, 3000);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Transaction failed";
      // Map known Move abort codes to friendly messages
      let message = raw;
      if (raw.includes("purchase_intel")) {
        if (raw.includes("13836185239384752137") || raw.includes("abort code: 4"))
          message = "You cannot purchase your own intel listing.";
        else if (raw.includes("abort code: 2") || raw.includes("13836466254800093195"))
          message = "This listing has already been purchased.";
        else if (raw.includes("abort code: 3"))
          message = "This listing has expired.";
        else if (raw.includes("abort code: 1"))
          message = "Listing not found.";
        else
          message = "Purchase failed: " + raw.split("MoveAbort")[0].trim();
      }
      setPurchase({ step: "error", listing, message });
    }
  };

  const closeModal = () => {
    setPurchase({ step: "idle" });
    setRatingStatus("idle");
    setRatedPositive(null);
  };

  const handleRate = async (positive: boolean) => {
    if (purchase.step !== "success" || ratingStatus !== "idle") return;
    setRatingStatus("submitting");
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${DEAD_DROP_CONFIG.packageId}::${MODULES.INTEL_MARKET}::rate_intel`,
        arguments: [
          tx.object(DEAD_DROP_CONFIG.registryId),
          tx.object(DEAD_DROP_CONFIG.configId),
          tx.pure.u64(purchase.listing.index),
          tx.pure.bool(positive),
          tx.object("0x6"),
        ],
      });
      await dAppKit.signAndExecuteTransaction({ transaction: tx });
      setRatedPositive(positive);
      setRatingStatus("done");
    } catch {
      setRatingStatus("idle");
    }
  };
  const activeListing =
    purchase.step !== "idle" ? purchase.listing : null;

  return (
    <Container>
      <Flex direction="column" gap="5">
        {/* Header */}
        <Flex justify="between" align="center">
          <Flex direction="column" gap="2">
            <Heading
              size="5"
              style={{ color: "#4ade80", fontFamily: "monospace" }}
            >
              // INTEL MARKETPLACE
            </Heading>
            <Text
              size="1"
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "monospace",
                opacity: 0.6,
              }}
            >
              Encrypted intelligence. Trustless exchange. Every secret has a
              price.
            </Text>
          </Flex>
          <Flex gap="4" align="center">
            <Text
              size="2"
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "monospace",
              }}
            >
              {listings.filter((l) => l.status === 0).length} active
            </Text>
            <button
              onClick={refetch}
              style={{
                backgroundColor: "rgba(74, 222, 128, 0.08)",
                color: "#4ade80",
                border: "1px solid rgba(74, 222, 128, 0.15)",
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

        {/* Category filter */}
        <Flex
          gap="3"
          wrap="wrap"
          py="3"
          style={{ borderBottom: "1px solid rgba(250, 250, 229, 0.06)" }}
        >
          {[
            { key: "all" as const, label: "ALL" },
            ...CATEGORIES.map((c) => ({ key: c, label: c.toUpperCase() })),
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key as Category | "all")}
              style={{
                backgroundColor:
                  filter === item.key
                    ? "rgba(74, 222, 128, 0.12)"
                    : "transparent",
                color:
                  filter === item.key
                    ? "#4ade80"
                    : "var(--color-text-muted)",
                border:
                  filter === item.key
                    ? "1px solid rgba(74, 222, 128, 0.25)"
                    : "1px solid rgba(250, 250, 229, 0.08)",
                fontSize: 11,
                padding: "4px 14px",
                cursor: "pointer",
                fontFamily: "monospace",
                borderRadius: 3,
                letterSpacing: "0.05em",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </button>
          ))}
        </Flex>

        {/* Player status + onboarding */}
        {account && (
          <PlayerStatus
            playerAssets={playerAssets}
            walletAddress={account.address}
            onOnboarded={() => window.location.reload()}
          />
        )}

        {/* Loading */}
        {loading && (
          <Flex justify="center" py="6">
            <Text style={{ color: "#4ade80", fontFamily: "monospace" }}>
              {">"} Scanning intel network...
            </Text>
          </Flex>
        )}

        {/* Error */}
        {error && (
          <Box
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.06)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              padding: "10px 14px",
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                color: "#f87171",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            >
              [ERR] {error}
            </Text>
          </Box>
        )}

        {/* Listings */}
        <Flex direction="column" gap="2">
          {!loading && filtered.length === 0 ? (
            <Flex justify="center" py="6">
              <Text
                style={{
                  color: "var(--color-text-muted)",
                  fontFamily: "monospace",
                  opacity: 0.5,
                }}
              >
                No intel found. The network is quiet...
              </Text>
            </Flex>
          ) : (
            filtered.map((listing) => (
              <ListingCard
                key={listing.index}
                listing={listing}
                onPurchase={handlePurchase}
                isPurchasing={
                  purchase.step === "signing" &&
                  purchase.listing.index === listing.index
                }
              />
            ))
          )}
        </Flex>

        {/* Source indicator */}
        {!loading && listings.length > 0 && (
          <Text
            size="1"
            style={{
              color: "var(--color-text-muted)",
              fontFamily: "monospace",
              opacity: 0.3,
              textAlign: "center",
              paddingTop: 8,
            }}
          >
            src: IntelRegistry{" "}
            {DEAD_DROP_CONFIG.registryId.slice(0, 12)}... on Sui testnet
          </Text>
        )}
      </Flex>

      {/* Purchase Modal */}
      <Modal
        open={purchase.step !== "idle"}
        onClose={closeModal}
        title={
          purchase.step === "success"
            ? "// INTEL ACQUIRED"
            : purchase.step === "error"
              ? "// ACQUISITION FAILED"
              : "// ACQUIRE INTEL"
        }
        accentColor={
          purchase.step === "success"
            ? "#4ade80"
            : purchase.step === "error"
              ? "#f87171"
              : "#4ade80"
        }
      >
        {/* Confirming state */}
        {purchase.step === "confirming" && activeListing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <span
                style={{
                  color: "var(--color-text-muted)",
                  fontFamily: "monospace",
                  fontSize: 10,
                  textTransform: "uppercase",
                }}
              >
                Listing #{activeListing.index}
              </span>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 16,
                  fontWeight: "bold",
                  marginTop: 4,
                  color: "var(--color-text)",
                }}
              >
                {activeListing.title}
              </div>
            </div>

            <div
              style={{
                backgroundColor: "rgba(250, 200, 21, 0.06)",
                border: "1px solid rgba(250, 200, 21, 0.15)",
                borderRadius: 4,
                padding: "10px 14px",
              }}
            >
              <span style={{ fontFamily: "monospace", color: "#ffc312" }}>
                Cost: {activeListing.priceQuantity} x{" "}
                {activeListing.priceTypeId === 1 ? "Fuel Cell" : activeListing.priceTypeId === 2 ? "Data Core" : `Item#${activeListing.priceTypeId}`}
              </span>
            </div>

            <div
              style={{
                backgroundColor: "rgba(96, 165, 250, 0.06)",
                border: "1px solid rgba(96, 165, 250, 0.15)",
                borderRadius: 4,
                padding: "10px 14px",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  color: "#60a5fa",
                  lineHeight: 1.6,
                  fontSize: 11,
                }}
              >
                Your wallet will sign a transaction. On success, the
                AES-256 decryption key is revealed via an on-chain event.
              </span>
            </div>

            <div
              style={{
                backgroundColor: "rgba(250, 250, 229, 0.03)",
                borderRadius: 4,
                padding: "10px 14px",
                fontFamily: "monospace",
                fontSize: 11,
                color: "var(--color-text-muted)",
                wordBreak: "break-all",
                lineHeight: 1.6,
              }}
            >
              target: {DEAD_DROP_CONFIG.packageId.slice(0, 16)}...::
              {MODULES.INTEL_MARKET}::purchase_intel
              <br />
              registry: {DEAD_DROP_CONFIG.registryId.slice(0, 16)}...
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(250, 250, 229, 0.05)",
                  color: "var(--color-text-muted)",
                  border: "1px solid rgba(250, 250, 229, 0.1)",
                  padding: "10px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 2,
                  backgroundColor: "rgba(74, 222, 128, 0.12)",
                  color: "#4ade80",
                  border: "1px solid rgba(74, 222, 128, 0.3)",
                  padding: "10px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  borderRadius: 4,
                  letterSpacing: "0.1em",
                }}
              >
                CONFIRM ACQUISITION
              </button>
            </div>
          </div>
        )}

        {/* Signing state */}
        {purchase.step === "signing" && (
          <div
            style={{
              textAlign: "center",
              padding: "30px 0",
              fontFamily: "monospace",
            }}
          >
            <div
              style={{
                color: "#facc15",
                fontSize: 14,
                marginBottom: 8,
              }}
            >
              Waiting for wallet signature...
            </div>
            <div
              style={{
                color: "var(--color-text-muted)",
                fontSize: 12,
                opacity: 0.6,
              }}
            >
              Check your wallet for the approval prompt
            </div>
          </div>
        )}

        {/* Success state */}
        {purchase.step === "success" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                backgroundColor: "rgba(74, 222, 128, 0.08)",
                border: "1px solid rgba(74, 222, 128, 0.2)",
                borderRadius: 4,
                padding: "14px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  color: "#4ade80",
                  fontSize: 14,
                  marginBottom: 4,
                }}
              >
                Intel Acquired Successfully
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  wordBreak: "break-all",
                }}
              >
                tx: {purchase.txDigest}
              </div>
            </div>

            {/* Decrypted intel */}
            {purchase.decryptedIntel && (
              <div
                style={{
                  backgroundColor: "rgba(248, 113, 113, 0.06)",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                  borderRadius: 4,
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    fontFamily: "monospace",
                    color: "#f87171",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: 6,
                  }}
                >
                  CLASSIFIED // DECRYPTED INTEL
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    color: "var(--color-text)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {purchase.decryptedIntel}
                </div>
              </div>
            )}

            {/* Decryption key */}
            {purchase.decryptionKeyHex && (
              <div
                style={{
                  backgroundColor: "rgba(250, 250, 229, 0.03)",
                  borderRadius: 4,
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 10,
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  AES-256 Decryption Key
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    color: "#facc15",
                    wordBreak: "break-all",
                  }}
                >
                  {purchase.decryptionKeyHex}
                </div>
              </div>
            )}

            {/* Rate intel */}
            <div style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              border: "1px solid var(--color-border)",
              borderRadius: 6, padding: "14px",
            }}>
              {ratingStatus === "done" ? (
                <div style={{ textAlign: "center", fontFamily: "monospace", fontSize: 12 }}>
                  <span style={{ color: ratedPositive ? "#39d98a" : "#ff4757" }}>
                    {ratedPositive ? "👍 Rated accurate" : "👎 Rated inaccurate"} — on-chain
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{
                    fontFamily: "monospace", fontSize: 10, color: "var(--color-text-muted)",
                    textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center",
                  }}>
                    Was this intel accurate?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleRate(true)}
                      disabled={ratingStatus === "submitting"}
                      style={{
                        flex: 1, padding: "10px", fontSize: 13, fontFamily: "monospace",
                        background: "rgba(57, 217, 138, 0.06)", color: "#39d98a",
                        border: "1px solid rgba(57, 217, 138, 0.2)", borderRadius: 4,
                        cursor: ratingStatus === "submitting" ? "wait" : "pointer",
                      }}
                    >
                      {ratingStatus === "submitting" ? "..." : "👍 Accurate"}
                    </button>
                    <button
                      onClick={() => handleRate(false)}
                      disabled={ratingStatus === "submitting"}
                      style={{
                        flex: 1, padding: "10px", fontSize: 13, fontFamily: "monospace",
                        background: "rgba(255, 71, 87, 0.06)", color: "#ff4757",
                        border: "1px solid rgba(255, 71, 87, 0.2)", borderRadius: 4,
                        cursor: ratingStatus === "submitting" ? "wait" : "pointer",
                      }}
                    >
                      {ratingStatus === "submitting" ? "..." : "👎 Inaccurate"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <a
              href={`https://suiscan.xyz/testnet/tx/${purchase.txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: "#60a5fa",
                textAlign: "center",
              }}
            >
              View on SuiScan →
            </a>

            <button
              onClick={closeModal}
              style={{
                backgroundColor: "rgba(74, 222, 128, 0.12)",
                color: "#4ade80",
                border: "1px solid rgba(74, 222, 128, 0.3)",
                padding: "10px",
                fontSize: 12,
                fontFamily: "monospace",
                cursor: "pointer",
                borderRadius: 4,
                marginTop: 4,
              }}
            >
              CLOSE
            </button>
          </div>
        )}

        {/* Error state */}
        {purchase.step === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                backgroundColor: "rgba(248, 113, 113, 0.08)",
                border: "1px solid rgba(248, 113, 113, 0.2)",
                borderRadius: 4,
                padding: "14px",
              }}
            >
              <div
                style={{
                  fontFamily: "monospace",
                  color: "#f87171",
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {purchase.message}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1,
                  backgroundColor: "rgba(250, 250, 229, 0.05)",
                  color: "var(--color-text-muted)",
                  border: "1px solid rgba(250, 250, 229, 0.1)",
                  padding: "10px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                CLOSE
              </button>
              <button
                onClick={() =>
                  setPurchase({
                    step: "confirming",
                    listing: purchase.listing,
                  })
                }
                style={{
                  flex: 1,
                  backgroundColor: "rgba(250, 200, 21, 0.1)",
                  color: "#facc15",
                  border: "1px solid rgba(250, 200, 21, 0.2)",
                  padding: "10px",
                  fontSize: 12,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  borderRadius: 4,
                }}
              >
                RETRY
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Container>
  );
}
