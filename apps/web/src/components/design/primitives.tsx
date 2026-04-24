"use client";

const PORTRAIT_COLORS = [
  "#D4805A",
  "#9B8EC4",
  "#6BA3A0",
  "#C9A87C",
  "#8BBF6A",
];

export function colorFromString(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PORTRAIT_COLORS[Math.abs(hash) % PORTRAIT_COLORS.length];
}

export function initialsFor(name: string) {
  return name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

type PortraitProps = {
  name: string;
  color?: string;
  size?: number;
  ring?: boolean;
};

export function Portrait({ name, color, size = 36, ring = false }: PortraitProps) {
  const swatch = color ?? colorFromString(name);
  const initials = initialsFor(name) || name.charAt(0).toUpperCase();
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: `radial-gradient(circle at 30% 25%, ${swatch}88, ${swatch}33 70%)`,
        border: ring ? "2px solid var(--bg)" : "none",
        outline: ring ? `2px solid ${swatch}` : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 600,
        fontSize: size * 0.38,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent 0 4px, rgba(255,255,255,0.06) 4px 5px)",
        }}
      />
      <span
        style={{
          position: "relative",
          textShadow: "0 1px 2px rgba(0,0,0,0.25)",
        }}
      >
        {initials}
      </span>
    </div>
  );
}

type SparklineProps = {
  color: string;
  up?: boolean;
  width?: number;
  height?: number;
};

export function Sparkline({
  color,
  up = true,
  width = 72,
  height = 22,
}: SparklineProps) {
  const points = up
    ? "0,18 12,14 22,15 34,9 48,10 60,5 72,2"
    : "0,4 12,8 22,6 34,12 48,10 60,15 72,18";
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 72 22"
      style={{ overflow: "visible" }}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="72" cy={up ? 2 : 18} r="2.5" fill={color} />
    </svg>
  );
}
