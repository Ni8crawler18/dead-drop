import { useEffect, useState } from "react";
import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { ReputationBadge } from "./ReputationBadge";
import { DEAD_DROP_CONFIG } from "../utils/config";
import type { Reputation } from "../utils/config";

type ProviderEntry = {
  address: string;
  reputation: Reputation;
};

const RPC_URL =
  import.meta.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";

function abbreviate(addr: string): string {
  return addr.slice(0, 10) + "..." + addr.slice(-6);
}

export function Leaderboard() {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalListings: 0, totalPurchases: 0 });

  useEffect(() => {
    async function fetchReputations() {
      if (!DEAD_DROP_CONFIG.registryId) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sui_getObject",
            params: [DEAD_DROP_CONFIG.registryId, { showContent: true }],
          }),
        }).then((r) => r.json());

        const fields = res?.result?.data?.content?.fields;
        if (!fields) return;

        setStats({
          totalListings: Number(fields.total_listings || 0),
          totalPurchases: Number(fields.total_purchases || 0),
        });

        // Build provider stats from listings
        const listings = fields.listings || [];
        const providerMap = new Map<string, Reputation>();

        for (const item of listings) {
          const f = item.fields || item;
          const addr = f.provider;
          if (!addr) continue;

          if (!providerMap.has(addr)) {
            providerMap.set(addr, {
              totalSales: 0,
              positiveRatings: 0,
              negativeRatings: 0,
              totalEarningsQuantity: 0,
            });
          }
          const rep = providerMap.get(addr)!;
          if (Number(f.status) === 1) {
            rep.totalSales++;
            rep.totalEarningsQuantity += Number(f.price_quantity || 0);
          }
          if (f.rated) {
            // We can't tell from listing if positive/negative without the reputations table
            // For display, count rated as positive (best effort)
            rep.positiveRatings++;
          }
        }

        const sorted = Array.from(providerMap.entries())
          .map(([address, reputation]) => ({ address, reputation }))
          .sort((a, b) => b.reputation.totalSales - a.reputation.totalSales);

        setProviders(sorted);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }

    fetchReputations();
  }, []);

  return (
    <Container>
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="1">
          <Heading
            size="5"
            style={{ color: "#a78bfa", fontFamily: "monospace" }}
          >
            // AGENT LEADERBOARD
          </Heading>
          <Text
            size="1"
            style={{
              color: "var(--color-text-muted)",
              fontFamily: "monospace",
              opacity: 0.6,
            }}
          >
            Top intel providers ranked by sales volume.
          </Text>
        </Flex>

        {/* Stats */}
        <div style={{ display: "flex", gap: 24 }}>
          <div
            style={{
              backgroundColor: "rgba(167, 139, 250, 0.06)",
              border: "1px solid rgba(167, 139, 250, 0.15)",
              borderRadius: 4,
              padding: "10px 16px",
              flex: 1,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "monospace",
                color: "#a78bfa",
                fontSize: 24,
                fontWeight: "bold",
              }}
            >
              {stats.totalListings}
            </div>
            <div
              style={{
                fontFamily: "monospace",
                color: "var(--color-text-muted)",
                fontSize: 10,
                textTransform: "uppercase",
              }}
            >
              Total Listings
            </div>
          </div>
          <div
            style={{
              backgroundColor: "rgba(74, 222, 128, 0.06)",
              border: "1px solid rgba(74, 222, 128, 0.15)",
              borderRadius: 4,
              padding: "10px 16px",
              flex: 1,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "monospace",
                color: "#4ade80",
                fontSize: 24,
                fontWeight: "bold",
              }}
            >
              {stats.totalPurchases}
            </div>
            <div
              style={{
                fontFamily: "monospace",
                color: "var(--color-text-muted)",
                fontSize: 10,
                textTransform: "uppercase",
              }}
            >
              Total Purchases
            </div>
          </div>
          <div
            style={{
              backgroundColor: "rgba(250, 200, 21, 0.06)",
              border: "1px solid rgba(250, 200, 21, 0.15)",
              borderRadius: 4,
              padding: "10px 16px",
              flex: 1,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: "monospace",
                color: "#facc15",
                fontSize: 24,
                fontWeight: "bold",
              }}
            >
              {providers.length}
            </div>
            <div
              style={{
                fontFamily: "monospace",
                color: "var(--color-text-muted)",
                fontSize: 10,
                textTransform: "uppercase",
              }}
            >
              Active Agents
            </div>
          </div>
        </div>

        {loading ? (
          <Flex justify="center" py="6">
            <Text style={{ color: "#a78bfa", fontFamily: "monospace" }}>
              {">"} Loading agent data...
            </Text>
          </Flex>
        ) : providers.length === 0 ? (
          <Flex justify="center" py="6">
            <Text
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "monospace",
                opacity: 0.5,
              }}
            >
              No agents yet. Be the first to post intel.
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="1">
            {/* Header */}
            <div
              style={{
                display: "flex",
                gap: 16,
                padding: "8px 0",
                borderBottom: "1px solid rgba(250, 250, 229, 0.1)",
                fontFamily: "monospace",
                fontSize: 10,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <div style={{ width: 36 }}>#</div>
              <div style={{ flex: 2 }}>Agent</div>
              <div style={{ flex: 2 }}>Reputation</div>
              <div style={{ flex: 1, textAlign: "right" }}>Sales</div>
              <div style={{ flex: 1, textAlign: "right" }}>Earnings</div>
            </div>

            {/* Rows */}
            {providers.map((entry, i) => (
              <div
                key={entry.address}
                style={{
                  display: "flex",
                  gap: 16,
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(250, 250, 229, 0.04)",
                  fontFamily: "monospace",
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 36,
                    color: i === 0 ? "#facc15" : "var(--color-text-muted)",
                    fontWeight: i === 0 ? "bold" : "normal",
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: 2 }}>{abbreviate(entry.address)}</div>
                <div style={{ flex: 2 }}>
                  <ReputationBadge reputation={entry.reputation} />
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  {entry.reputation.totalSales}
                </div>
                <div
                  style={{
                    flex: 1,
                    textAlign: "right",
                    color: "#4ade80",
                  }}
                >
                  {entry.reputation.totalEarningsQuantity}
                </div>
              </div>
            ))}
          </Flex>
        )}
      </Flex>
    </Container>
  );
}
