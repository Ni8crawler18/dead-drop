/**
 * Among Us-style crewmate icon.
 * bodyColor = suit color, visorColor = visor glow
 */
export function CrewmateIcon({
  size = 32,
  bodyColor = "#ff4757",
  visorColor = "#22d3ee",
  glow = true,
}: {
  size?: number;
  bodyColor?: string;
  visorColor?: string;
  glow?: boolean;
}) {
  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 64 64"
      fill="none"
      style={{
        filter: glow ? `drop-shadow(0 0 8px ${bodyColor}40)` : "none",
        flexShrink: 0,
      }}
    >
      {/* Shadow under body */}
      <ellipse cx="32" cy="60" rx="18" ry="3" fill={bodyColor} opacity="0.15" />

      {/* Backpack */}
      <rect x="3" y="20" width="11" height="24" rx="5.5" fill={bodyColor} />
      <rect x="4" y="21" width="9" height="22" rx="4.5" fill={bodyColor} opacity="0.7" />
      {/* Backpack highlight */}
      <rect x="5" y="23" width="3" height="8" rx="1.5" fill="white" opacity="0.06" />

      {/* Body */}
      <path
        d="M14 12 C14 4, 50 4, 50 12 L50 40 C50 44, 48 47, 46 47 L39 47 L39 57 C39 61, 33 61, 33 57 L33 47 L27 47 L27 57 C27 61, 21 61, 21 57 L21 47 L18 47 C15 47, 14 44, 14 40 Z"
        fill={bodyColor}
      />
      {/* Body highlight (left edge) */}
      <path
        d="M16 14 C16 8, 24 6, 28 6 L28 42 C28 42, 16 42, 16 38 Z"
        fill="white"
        opacity="0.06"
      />
      {/* Body shadow (bottom) */}
      <path
        d="M14 36 L50 36 L50 40 C50 44, 48 47, 46 47 L18 47 C15 47, 14 44, 14 40 Z"
        fill="black"
        opacity="0.15"
      />

      {/* Visor background */}
      <ellipse cx="38" cy="21" rx="12" ry="10" fill="#0a1520" />

      {/* Visor */}
      <ellipse
        cx="38"
        cy="21"
        rx="11"
        ry="9"
        fill={visorColor}
        opacity="0.8"
      />
      {/* Visor gradient overlay */}
      <ellipse
        cx="38"
        cy="21"
        rx="11"
        ry="9"
        fill="url(#visorGrad)"
        opacity="0.5"
      />
      {/* Visor shine */}
      <ellipse cx="34" cy="18" rx="5" ry="3.5" fill="white" opacity="0.3" />
      <ellipse cx="42" cy="24" rx="3" ry="2" fill="white" opacity="0.08" />

      {/* Visor glow */}
      {glow && (
        <ellipse
          cx="38"
          cy="21"
          rx="14"
          ry="12"
          fill={visorColor}
          opacity="0.08"
        />
      )}

      {/* Gradient defs */}
      <defs>
        <linearGradient id="visorGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.2" />
          <stop offset="100%" stopColor={visorColor} stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
