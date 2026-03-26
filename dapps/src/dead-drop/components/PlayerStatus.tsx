import { useState } from "react";
import type { PlayerAssets } from "../hooks/usePlayerAssets";

const API_URL = import.meta.env.VITE_API_URL || "";

export function PlayerStatus({
  playerAssets,
  walletAddress,
  onOnboarded,
}: {
  playerAssets: PlayerAssets;
  walletAddress: string;
  onOnboarded: () => void;
}) {
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOnboard = async () => {
    setOnboarding(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Onboarding failed");
      onOnboarded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to setup account");
    } finally {
      setOnboarding(false);
    }
  };

  if (playerAssets.loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", marginTop: 4,
        background: "var(--bg-surface)", border: "1px solid var(--color-border)",
        borderRadius: 6, fontSize: 12,
      }}>
        <span className="status-dot" style={{ background: "#ffc312", animation: "pulse 1.5s ease infinite" }} />
        <span style={{ color: "var(--color-text-muted)" }}>Scanning for game assets...</span>
      </div>
    );
  }

  if (playerAssets.characterId) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", marginTop: 4,
        background: "rgba(57, 217, 138, 0.03)", border: "1px solid rgba(57, 217, 138, 0.1)",
        borderRadius: 6, fontSize: 12,
      }}>
        <span className="status-dot status-dot--live" />
        <span style={{ color: "rgba(57, 217, 138, 0.8)" }}>
          Agent active
        </span>
        <span style={{ color: "var(--color-text-muted)", opacity: 0.5, fontSize: 11 }}>
          — Character: {playerAssets.characterId.slice(0, 10)}...
          {playerAssets.storageUnitId && ` | Storage: ${playerAssets.storageUnitId.slice(0, 10)}...`}
        </span>
      </div>
    );
  }

  // No character — show onboarding
  return (
    <div style={{
      padding: "16px 20px", marginTop: 4,
      background: "rgba(255, 195, 18, 0.03)", border: "1px solid rgba(255, 195, 18, 0.12)",
      borderRadius: 8, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="status-dot status-dot--sus" />
        <span style={{ color: "#ffc312", fontSize: 13, fontWeight: 600 }}>
          New agent detected
        </span>
      </div>
      <span style={{ color: "var(--color-text-muted)", fontSize: 12, lineHeight: 1.6 }}>
        You need a game character and storage unit to buy/sell intel.
        Click below to set up your demo account (takes ~15 seconds).
      </span>

      {error && (
        <div style={{
          background: "rgba(255, 71, 87, 0.06)", border: "1px solid rgba(255, 71, 87, 0.15)",
          borderRadius: 4, padding: "8px 12px", color: "#ff4757", fontSize: 11,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleOnboard}
        disabled={onboarding}
        style={{
          width: "fit-content",
          background: onboarding ? "rgba(255, 195, 18, 0.06)" : "rgba(57, 217, 138, 0.08)",
          color: onboarding ? "#ffc312" : "#39d98a",
          border: `1px solid ${onboarding ? "rgba(255, 195, 18, 0.2)" : "rgba(57, 217, 138, 0.25)"}`,
          padding: "10px 24px", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.12em", borderRadius: 6,
          cursor: onboarding ? "wait" : "pointer",
        }}
      >
        {onboarding ? "◌ SETTING UP ACCOUNT..." : "◆ SETUP DEMO ACCOUNT"}
      </button>
    </div>
  );
}
