export function Modal({
  open,
  onClose,
  title,
  children,
  accentColor = "#39d98a",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  accentColor?: string;
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(10px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#0a0d13",
          border: `1px solid ${accentColor}25`,
          borderRadius: 8,
          maxWidth: 520,
          width: "100%",
          maxHeight: "85vh",
          overflow: "auto",
          boxShadow: `0 0 60px ${accentColor}08, 0 25px 80px rgba(0,0,0,0.6)`,
          animation: "slideIn 0.2s ease",
        }}
      >
        {/* Top accent */}
        <div style={{
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accentColor}60, transparent)`,
        }} />

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 20px",
          borderBottom: `1px solid ${accentColor}12`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              backgroundColor: accentColor,
              boxShadow: `0 0 8px ${accentColor}40`,
              display: "inline-block",
            }} />
            <span style={{
              fontWeight: 700, color: accentColor,
              fontSize: 12, letterSpacing: "0.08em",
              fontFamily: "'Space Mono', monospace",
            }}>
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 71, 87, 0.06)",
              border: "1px solid rgba(255, 71, 87, 0.15)",
              color: "#ff4757",
              cursor: "pointer",
              fontSize: 10, fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 3,
              letterSpacing: "0.06em",
            }}
          >
            ESC
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
