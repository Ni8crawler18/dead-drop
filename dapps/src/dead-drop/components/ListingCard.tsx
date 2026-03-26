import { CrewmateIcon } from "./CrewmateIcon";
import type { IntelListing } from "../utils/config";

const STATUS_LABELS: Record<number, string> = { 0: "LIVE", 1: "ACQUIRED", 2: "VOID" };
const STATUS_COLORS: Record<number, string> = { 0: "#39d98a", 1: "#4dabf7", 2: "#555" };
const CAT_COLORS: Record<string, string> = {
  coordinates: "#39d98a", fleet: "#ff4757", trade: "#ffc312",
  resources: "#9775fa", intel: "#22d3ee", other: "#6b7280",
};
const ITEM_NAMES: Record<number, string> = {
  1: "Fuel Cells", 2: "Data Cores", 446: "Salvage",
};

function abbr(addr: string): string {
  if (!addr || addr === "0x0") return "???";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function timeLeft(ms: number): string {
  if (ms === 0) return "NO LIMIT";
  const rem = ms - Date.now();
  if (rem <= 0) return "EXPIRED";
  const h = Math.floor(rem / 3600000);
  return h < 24 ? `${h}H LEFT` : `${Math.floor(h / 24)}D ${h % 24}H`;
}

function itemName(id: number) { return ITEM_NAMES[id] || `ITEM-${id}`; }

export function ListingCard({
  listing, onPurchase, isPurchasing,
}: {
  listing: IntelListing;
  onPurchase?: (index: number) => void;
  isPurchasing?: boolean;
}) {
  const active = listing.status === 0;
  const expired = listing.expiresAtMs > 0 && Date.now() > listing.expiresAtMs;
  const cat = listing.category;
  const color = CAT_COLORS[cat] || "#6b7280";
  const sold = listing.status === 1;

  return (
    <div style={{
      position: "relative",
      background: `linear-gradient(135deg, #0d1117 0%, #0a0e14 50%, ${color}04 100%)`,
      borderRadius: 12,
      border: `1px solid ${active && !expired ? color + "22" : "rgba(255,255,255,0.04)"}`,
      overflow: "hidden",
      transition: "all 0.3s ease",
      animation: "fadeIn 0.4s ease",
      opacity: sold ? 0.8 : 1,
    }}>
      {/* Glowing top edge */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent 5%, ${color}50 30%, ${color}80 50%, ${color}50 70%, transparent 95%)`,
        opacity: active && !expired ? 0.6 : 0.15,
      }} />

      {/* Corner visor indicator */}
      <div style={{
        position: "absolute", top: 14, right: 18,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <CrewmateIcon size={20} bodyColor={sold ? "#555" : color} visorColor={sold ? "#444" : "#22d3ee"} glow={!sold} />
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: "0.18em",
          color: expired && active ? "#ff4757" : STATUS_COLORS[listing.status],
          textShadow: active && !expired ? `0 0 8px ${STATUS_COLORS[listing.status]}40` : "none",
        }}>
          {expired && active ? "EXPIRED" : STATUS_LABELS[listing.status]}
        </span>
      </div>

      <div style={{ padding: "20px 22px 18px" }}>
        {/* Category tag */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
            color: color,
            background: color + "12",
            padding: "4px 14px",
            borderRadius: 20,
            border: `1px solid ${color}25`,
            textShadow: `0 0 10px ${color}30`,
          }}>
            {cat.toUpperCase()}
          </div>
          <span style={{
            fontSize: 9, color: "rgba(255,255,255,0.15)", fontWeight: 500,
            fontFamily: "monospace",
          }}>
            DD-{String(listing.index).padStart(3, "0")}
          </span>
        </div>

        {/* Title */}
        <div style={{
          fontSize: 17, fontWeight: 700, lineHeight: 1.35,
          fontFamily: "'Space Mono', monospace",
          marginBottom: 16,
          color: sold ? "rgba(255,255,255,0.65)" : "#e8e6d9",
          textShadow: active && !expired ? "0 0 30px rgba(255,255,255,0.03)" : "none",
        }}>
          {listing.title}
        </div>

        {/* Info strip — spaceship HUD style */}
        <div style={{
          display: "flex",
          gap: 1,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: active && !expired && onPurchase ? 16 : 0,
        }}>
          {/* Cost */}
          <div style={{
            flex: 1,
            background: "rgba(255, 195, 18, 0.07)",
            borderLeft: "2px solid rgba(255, 195, 18, 0.4)",
            padding: "12px 16px",
          }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: "0.14em",
              color: "rgba(255, 195, 18, 0.7)", marginBottom: 5,
            }}>
              ▸ COST
            </div>
            <span style={{ color: "#ffc312", fontWeight: 800, fontSize: 20 }}>
              {listing.priceQuantity}
            </span>
            <span style={{ color: "rgba(255, 195, 18, 0.7)", fontSize: 12, marginLeft: 6 }}>
              {itemName(listing.priceTypeId)}
            </span>
          </div>

          {/* Source */}
          <div style={{
            flex: 1,
            background: "rgba(255,255,255,0.03)",
            borderLeft: "2px solid rgba(255,255,255,0.1)",
            padding: "12px 16px",
          }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: "0.14em",
              color: "rgba(255,255,255,0.35)", marginBottom: 5,
            }}>
              ▸ SOURCE
            </div>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              {abbr(listing.provider)}
            </span>
          </div>

          {/* Timer */}
          <div style={{
            flex: 1,
            background: expired ? "rgba(255, 71, 87, 0.07)" : "rgba(255,255,255,0.03)",
            borderLeft: `2px solid ${expired ? "rgba(255, 71, 87, 0.4)" : "rgba(255,255,255,0.1)"}`,
            padding: "12px 16px",
          }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: "0.14em",
              color: expired ? "rgba(255, 71, 87, 0.7)" : "rgba(255,255,255,0.35)", marginBottom: 5,
            }}>
              ▸ WINDOW
            </div>
            <span style={{
              fontSize: 13,
              color: expired ? "#ff4757" : "rgba(255,255,255,0.75)",
              fontWeight: expired ? 700 : 500,
            }}>
              {timeLeft(listing.expiresAtMs)}
            </span>
          </div>
        </div>

        {/* Acquire button */}
        {active && !expired && onPurchase && (
          <button
            onClick={(e) => { e.stopPropagation(); if (!isPurchasing && onPurchase) onPurchase(listing.index); }}
            disabled={isPurchasing}
            style={{
              width: "100%",
              background: isPurchasing
                ? "rgba(255, 195, 18, 0.06)"
                : `linear-gradient(135deg, ${color}10, ${color}05)`,
              color: isPurchasing ? "#ffc312" : color,
              border: `1px solid ${isPurchasing ? "rgba(255, 195, 18, 0.2)" : color + "30"}`,
              padding: "13px",
              fontSize: 11, fontWeight: 800, letterSpacing: "0.16em",
              cursor: isPurchasing ? "wait" : "pointer",
              borderRadius: 8,
              boxShadow: `0 0 20px ${color}08`,
              transition: "all 0.25s ease",
              textShadow: `0 0 10px ${color}30`,
            }}
          >
            {isPurchasing ? "◌  ACQUIRING INTEL..." : "◆  ACQUIRE INTEL"}
          </button>
        )}
      </div>
    </div>
  );
}
