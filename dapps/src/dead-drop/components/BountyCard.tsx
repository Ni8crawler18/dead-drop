import type { Bounty } from "../utils/config";

const STATUS_LABELS: Record<number, string> = { 0: "OPEN", 1: "PENDING", 2: "DONE", 3: "VOID" };
const STATUS_COLORS: Record<number, string> = { 0: "#ffc312", 1: "#4dabf7", 2: "#39d98a", 3: "#6b7280" };

function abbr(addr: string): string {
  if (!addr || addr === "0x0") return "???";
  return addr.slice(0, 8) + "..." + addr.slice(-4);
}

function timeLeft(ms: number): string {
  if (ms === 0) return "Permanent";
  const rem = ms - Date.now();
  if (rem <= 0) return "EXPIRED";
  const h = Math.floor(rem / 3600000);
  return h < 24 ? `${h}h remaining` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function BountyCard({ bounty, onClaim }: { bounty: Bounty; onClaim?: (index: number) => void }) {
  const isOpen = bounty.status === 0;

  return (
    <div
      className="card-glow"
      style={{
        display: "flex",
        background: "var(--bg-card)",
        border: `1px solid ${isOpen ? "rgba(255, 195, 18, 0.12)" : "var(--color-border)"}`,
        borderRadius: 6, overflow: "hidden",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <div style={{
        width: 3,
        background: `linear-gradient(180deg, ${STATUS_COLORS[bounty.status]}, ${STATUS_COLORS[bounty.status]}50)`,
        flexShrink: 0,
      }} />

      <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              color: "#ffc312", backgroundColor: "rgba(255, 195, 18, 0.08)",
              padding: "3px 10px", borderRadius: 3, border: "1px solid rgba(255, 195, 18, 0.15)",
            }}>
              ● BOUNTY
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
              color: "var(--color-text-muted)", backgroundColor: "var(--bg-surface)",
              padding: "3px 8px", borderRadius: 3,
            }}>
              {bounty.category.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, color: "var(--color-text-muted)", opacity: 0.35 }}>
              #{String(bounty.index).padStart(3, "0")}
            </span>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
            color: STATUS_COLORS[bounty.status],
          }}>
            {STATUS_LABELS[bounty.status]}
          </span>
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, lineHeight: 1.6, fontFamily: "'Space Mono', monospace" }}>
          {bounty.description}
        </div>

        {/* Meta */}
        <div style={{ display: "flex", gap: 32, fontSize: 12 }}>
          <div>
            <div style={{ fontSize: 8, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>
              REWARD
            </div>
            <span style={{ color: "#ffc312", fontWeight: 600 }}>
              {bounty.rewardQuantity}x <span style={{ opacity: 0.6 }}>Type#{bounty.rewardTypeId}</span>
            </span>
          </div>
          <div>
            <div style={{ fontSize: 8, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>
              POSTER
            </div>
            <span style={{ opacity: 0.7 }}>{abbr(bounty.poster)}</span>
          </div>
          <div>
            <div style={{ fontSize: 8, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3, fontWeight: 600 }}>
              EXPIRES
            </div>
            <span>{timeLeft(bounty.expiresAtMs)}</span>
          </div>
        </div>

        {/* Action */}
        {isOpen && onClaim && (
          <button
            onClick={(e) => { e.stopPropagation(); onClaim(bounty.index); }}
            style={{
              marginTop: 6, width: "fit-content",
              background: "rgba(255, 195, 18, 0.06)",
              color: "#ffc312",
              border: "1px solid rgba(255, 195, 18, 0.18)",
              padding: "8px 22px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              boxShadow: "var(--glow-yellow)",
            }}
          >
            ▲ SUBMIT INTEL
          </button>
        )}
      </div>
    </div>
  );
}
