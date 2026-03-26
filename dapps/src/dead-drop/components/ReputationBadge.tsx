import type { Reputation } from "../utils/config";

export function ReputationBadge({ reputation }: { reputation: Reputation }) {
  const total = reputation.positiveRatings + reputation.negativeRatings;
  const score = total > 0 ? Math.round((reputation.positiveRatings / total) * 100) : 0;
  const color = total === 0 ? "var(--color-text-muted)" : score >= 75 ? "#39d98a" : score >= 50 ? "#ffc312" : "#ff4757";
  const label = total === 0 ? "UNRATED" : score >= 75 ? "TRUSTED" : score >= 50 ? "NEUTRAL" : "SUS";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className={`status-dot ${total > 0 && score < 50 ? "status-dot--sus" : ""}`}
        style={{ backgroundColor: color, width: 6, height: 6 }}
      />
      <span style={{ fontSize: 11, color, fontWeight: 600, letterSpacing: "0.06em" }}>
        {total === 0 ? "—" : `${score}%`}
      </span>
      <span style={{
        fontSize: 8, color, fontWeight: 700, letterSpacing: "0.12em",
        backgroundColor: `${color}10`, padding: "1px 6px", borderRadius: 2,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: "var(--color-text-muted)", opacity: 0.5 }}>
        {reputation.totalSales} sales
      </span>
    </div>
  );
}
