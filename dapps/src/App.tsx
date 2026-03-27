import { useState } from "react";
import { abbreviateAddress, useConnection } from "@evefrontier/dapp-kit";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { CrewmateIcon } from "./dead-drop/components/CrewmateIcon";
import { Marketplace } from "./dead-drop/components/Marketplace";
import { PostIntel } from "./dead-drop/components/PostIntel";
import { BountyBoardPage } from "./dead-drop/components/BountyBoard";
import { Leaderboard } from "./dead-drop/components/Leaderboard";
import { Stars } from "./dead-drop/components/Stars";
import { WalkingCrewmate } from "./dead-drop/components/WalkingCrewmate";

type Page = "marketplace" | "post" | "bounties" | "leaderboard";

const NAV_ITEMS: { key: Page; label: string; icon: string; color: string }[] = [
  { key: "marketplace", label: "MARKET", icon: "◆", color: "#39d98a" },
  { key: "post", label: "POST INTEL", icon: "▲", color: "#ff4757" },
  { key: "bounties", label: "BOUNTIES", icon: "●", color: "#ffc312" },
  { key: "leaderboard", label: "AGENTS", icon: "◎", color: "#9775fa" },
];

function App() {
  const { handleConnect, handleDisconnect } = useConnection();
  const account = useCurrentAccount();
  const [page, setPage] = useState<Page>("marketplace");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <Stars />
      <WalkingCrewmate />
      {/* Header — Security Terminal Bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "rgba(6, 8, 12, 0.95)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {/* Top accent line */}
        <div style={{
          height: 2,
          background: `linear-gradient(90deg, var(--color-red) 0%, transparent 30%, transparent 70%, var(--color-green) 100%)`,
          opacity: 0.4,
        }} />

        <div style={{
          maxWidth: "90%",
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 54,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <CrewmateIcon size={36} bodyColor="#e63946" visorColor="#22d3ee" />
            <div>
              <span style={{
                fontSize: 16, fontWeight: 700, letterSpacing: "0.1em",
                fontFamily: "'Space Mono', monospace",
              }}>
                <span style={{ color: "#ff4757" }}>DEAD</span>
                <span style={{ color: "var(--color-text-muted)", opacity: 0.2 }}>/</span>
                <span style={{ color: "#39d98a" }}>DROP</span>
              </span>
            </div>
            <span style={{
              fontSize: 9, color: "var(--color-text-muted)", opacity: 0.3,
              border: "1px solid var(--color-border)", padding: "1px 6px",
              borderRadius: 3, letterSpacing: "0.08em",
            }}>
              TESTNET
            </span>
          </div>

          {/* Nav */}
          <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                style={{
                  background: page === item.key ? `${item.color}0d` : "transparent",
                  color: page === item.key ? item.color : "var(--color-text-muted)",
                  border: "none",
                  borderBottom: page === item.key ? `2px solid ${item.color}` : "2px solid transparent",
                  borderRadius: 0,
                  padding: "15px 16px 13px",
                  fontSize: 10,
                  letterSpacing: "0.1em",
                  fontWeight: page === item.key ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ fontSize: 8, opacity: page === item.key ? 1 : 0.4 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Wallet */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {account && (
              <span className="status-dot status-dot--live" />
            )}
            <button
              onClick={() => account?.address ? handleDisconnect() : handleConnect()}
              style={{
                background: account ? "rgba(57, 217, 138, 0.06)" : "var(--bg-surface)",
                color: account ? "#39d98a" : "var(--color-text)",
                border: account ? "1px solid rgba(57, 217, 138, 0.2)" : "1px solid var(--color-border)",
                padding: "6px 18px",
                fontSize: 11, fontWeight: 600,
              }}
            >
              {account ? abbreviateAddress(account.address) : "CONNECT"}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{
        flex: 1,
        maxWidth: "90%",
        margin: "0 auto",
        padding: "32px 24px 80px",
        width: "100%",
      }}>
        {!account ? (
          /* Landing — Among Us emergency meeting vibe */
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: 450, gap: 20,
          }}>
            <CrewmateIcon size={130} bodyColor="#e63946" visorColor="#22d3ee" />

            <div style={{
              fontSize: 44, fontWeight: 700, letterSpacing: "0.12em",
              fontFamily: "'Space Mono', monospace", textAlign: "center",
            }}>
              <span style={{ color: "#ff4757" }}>DEAD</span>
              <span style={{ color: "var(--color-text-muted)", opacity: 0.15 }}>/</span>
              <span style={{ color: "#39d98a" }}>DROP</span>
            </div>

            <p style={{
              color: "var(--color-text-muted)", fontSize: 13, maxWidth: 440,
              textAlign: "center", lineHeight: 1.8,
            }}>
              The underground intel market for EVE Frontier.
              <br />
              <span style={{ color: "var(--color-sus)", fontSize: 12 }}>
                Trust no one. Verify everything. Every secret has a price.
              </span>
            </p>

            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginTop: 8, opacity: 0.4, fontSize: 10,
              color: "var(--color-text-muted)", letterSpacing: "0.08em",
            }}>
              <span className="status-dot status-dot--sus" />
              SECURE TERMINAL — AUTHORIZATION REQUIRED
            </div>

            <button
              onClick={handleConnect}
              style={{
                marginTop: 12,
                background: "rgba(57, 217, 138, 0.08)",
                color: "#39d98a",
                border: "1px solid rgba(57, 217, 138, 0.25)",
                padding: "14px 40px",
                fontSize: 13, fontWeight: 700,
                letterSpacing: "0.12em",
                boxShadow: "var(--glow-green)",
              }}
            >
              CONNECT WALLET
            </button>
          </div>
        ) : (
          <>
            {page === "marketplace" && <Marketplace />}
            {page === "post" && <PostIntel />}
            {page === "bounties" && <BountyBoardPage />}
            {page === "leaderboard" && <Leaderboard />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        position: "fixed", bottom: 0, width: "100%",
        padding: "7px 0", textAlign: "center",
        backgroundColor: "rgba(6, 8, 12, 0.92)",
        borderTop: "1px solid var(--color-border)",
        zIndex: 50,
      }}>
        <span style={{
          fontSize: 9, color: "var(--color-text-muted)", opacity: 0.25,
          letterSpacing: "0.08em",
        }}>
          DEAD/DROP v0.1 // EVE FRONTIER 2026 // SUI TESTNET //
          <span style={{ color: "var(--color-sus)", opacity: 0.6 }}>CLASSIFIED</span>
        </span>
      </footer>
    </div>
  );
}

export default App;
