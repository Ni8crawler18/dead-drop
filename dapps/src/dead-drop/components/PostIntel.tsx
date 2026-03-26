import { useState } from "react";
import { Box, Container, Flex, Heading, Text } from "@radix-ui/themes";
import { Transaction } from "@mysten/sui/transactions";
import { useDAppKit, useCurrentAccount } from "@mysten/dapp-kit-react";
import { CATEGORIES, DEAD_DROP_CONFIG, MODULES } from "../utils/config";
import { encryptIntel, toHex } from "../utils/crypto";

export function PostIntel() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("coordinates");
  const [intel, setIntel] = useState("");
  const [priceTypeId, setPriceTypeId] = useState("1");
  const [priceQuantity, setPriceQuantity] = useState("5");
  const [expiryHours, setExpiryHours] = useState("48");
  const [status, setStatus] = useState<
    "idle" | "encrypting" | "signing" | "success" | "error"
  >("idle");
  const [txDigest, setTxDigest] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const dAppKit = useDAppKit();
  const account = useCurrentAccount();

  const handleSubmit = async () => {
    if (!title || !intel || !account) return;
    setStatus("encrypting");
    setErrorMsg("");

    try {
      const { ciphertext, key } = await encryptIntel(intel);

      setStatus("signing");

      const tx = new Transaction();
      tx.moveCall({
        target: `${DEAD_DROP_CONFIG.packageId}::${MODULES.INTEL_MARKET}::create_listing`,
        arguments: [
          tx.object(DEAD_DROP_CONFIG.registryId),
          tx.pure.vector("u8", Array.from(ciphertext)),
          tx.pure.vector("u8", Array.from(key)),
          tx.pure.vector(
            "u8",
            Array.from(new TextEncoder().encode(category)),
          ),
          tx.pure.vector("u8", Array.from(new TextEncoder().encode(title))),
          tx.pure.u64(BigInt(priceTypeId)),
          tx.pure.u32(Number(priceQuantity)),
          tx.pure.u64(
            Number(expiryHours) > 0
              ? BigInt(Date.now() + Number(expiryHours) * 3600000)
              : 0n,
          ),
          tx.object("0x6"),
        ],
      });

      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });

      // Extract digest
      let digest = "";
      try {
        const jsonStr = JSON.stringify(result, (_, v) =>
          v instanceof Uint8Array
            ? "[bytes]"
            : typeof v === "bigint"
              ? v.toString()
              : v,
        );
        const m = jsonStr.match(
          /"(?:digest|transactionDigest)"\s*:\s*"([A-Za-z0-9]{32,50})"/,
        );
        if (m) digest = m[1];
      } catch {}

      setTxDigest(digest);
      setStatus("success");
      setTitle("");
      setIntel("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to submit");
      setStatus("error");
    }
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "rgba(250, 250, 229, 0.05)",
    border: "1px solid rgba(250, 250, 229, 0.15)",
    color: "var(--color-text)",
    fontFamily: "monospace",
    padding: "8px 12px",
    borderRadius: 4,
    width: "100%",
    fontSize: 14,
    outline: "none",
  };

  return (
    <Container>
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="1">
          <Heading
            size="5"
            style={{ color: "#f87171", fontFamily: "monospace" }}
          >
            // POST CLASSIFIED INTEL
          </Heading>
          <Text
            size="1"
            style={{
              color: "var(--color-text-muted)",
              fontFamily: "monospace",
              opacity: 0.6,
            }}
          >
            Your intel is encrypted client-side (AES-256-GCM) before going
            on-chain. The decryption key is only revealed to the buyer.
          </Text>
        </Flex>

        {/* Success banner */}
        {status === "success" && (
          <div
            style={{
              backgroundColor: "rgba(74, 222, 128, 0.08)",
              border: "1px solid rgba(74, 222, 128, 0.2)",
              borderRadius: 4,
              padding: "12px 14px",
              fontFamily: "monospace",
            }}
          >
            <div style={{ color: "#4ade80", fontSize: 14, marginBottom: 4 }}>
              Intel listed successfully!
            </div>
            {txDigest && (
              <a
                href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", fontSize: 11 }}
              >
                View on SuiScan: {txDigest.slice(0, 20)}...
              </a>
            )}
          </div>
        )}

        {/* Error banner */}
        {status === "error" && (
          <div
            style={{
              backgroundColor: "rgba(248, 113, 113, 0.08)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
              borderRadius: 4,
              padding: "12px 14px",
              fontFamily: "monospace",
              color: "#f87171",
              fontSize: 12,
            }}
          >
            {errorMsg}
          </div>
        )}

        <Flex direction="column" gap="3">
          <div>
            <div
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "monospace",
                fontSize: 10,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              TITLE (public)
            </div>
            <input
              style={inputStyle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hidden Resource Cache Location"
            />
          </div>

          <div>
            <div
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "monospace",
                fontSize: 10,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              CATEGORY
            </div>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div
              style={{
                color: "#f87171",
                fontFamily: "monospace",
                fontSize: 10,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              CLASSIFIED INTEL (encrypted before submission)
            </div>
            <textarea
              style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
              value={intel}
              onChange={(e) => setIntel(e.target.value)}
              placeholder="Sector 7G, Grid 42-19. Resource cache located behind the third asteroid..."
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontFamily: "monospace",
                  fontSize: 10,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                PRICE (Item Type ID)
              </div>
              <input
                style={inputStyle}
                type="number"
                value={priceTypeId}
                onChange={(e) => setPriceTypeId(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontFamily: "monospace",
                  fontSize: 10,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                QUANTITY
              </div>
              <input
                style={inputStyle}
                type="number"
                value={priceQuantity}
                onChange={(e) => setPriceQuantity(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontFamily: "monospace",
                  fontSize: 10,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                EXPIRY (hours, 0=none)
              </div>
              <input
                style={inputStyle}
                type="number"
                value={expiryHours}
                onChange={(e) => setExpiryHours(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={
              !title ||
              !intel ||
              !account ||
              status === "encrypting" ||
              status === "signing"
            }
            style={{
              backgroundColor:
                status === "signing"
                  ? "rgba(250, 200, 21, 0.12)"
                  : "rgba(248, 113, 113, 0.12)",
              color: status === "signing" ? "#facc15" : "#f87171",
              border: `1px solid ${status === "signing" ? "rgba(250, 200, 21, 0.3)" : "rgba(248, 113, 113, 0.3)"}`,
              cursor:
                !title || !intel || !account
                  ? "not-allowed"
                  : "pointer",
              opacity: !title || !intel || !account ? 0.5 : 1,
              padding: "12px 20px",
              fontSize: 13,
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              borderRadius: 4,
            }}
          >
            {status === "encrypting"
              ? "ENCRYPTING..."
              : status === "signing"
                ? "WAITING FOR WALLET..."
                : "// ENCRYPT & LIST INTEL"}
          </button>
        </Flex>
      </Flex>
    </Container>
  );
}
