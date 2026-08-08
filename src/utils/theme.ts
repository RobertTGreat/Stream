/** Parse #rgb / #rrggbb → [r,g,b] */
export function hexToRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return [
      parseInt(raw[0] + raw[0], 16),
      parseInt(raw[1] + raw[1], 16),
      parseInt(raw[2] + raw[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16),
    ];
  }
  return null;
}

function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Lighten hex for hover state */
export function lightenHex(hex: string, amount = 0.18): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return `#${[r, g, b]
    .map((c) => clamp(c + (255 - c) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Apply accent to :root CSS variables used across the app */
export function applyAccentColor(hex: string) {
  const color = hex?.startsWith("#") ? hex : `#${hex}`;
  const rgb = hexToRgb(color);
  if (!rgb) return;

  const [r, g, b] = rgb;
  const hover = lightenHex(color, 0.22);
  const root = document.documentElement;

  root.style.setProperty("--color-accent", color);
  root.style.setProperty("--color-accent-hover", hover);
  root.style.setProperty("--color-accent-soft", `rgba(${r}, ${g}, ${b}, 0.14)`);
  root.style.setProperty("--color-accent-glow", `rgba(${r}, ${g}, ${b}, 0.28)`);
  root.style.setProperty("--color-accent-rgb", `${r}, ${g}, ${b}`);
}

export const ACCENT_PRESETS = [
  { label: "Violet", value: "#a855f7" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Emerald", value: "#10b981" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Orange", value: "#f97316" },
  { label: "Pink", value: "#ec4899" },
] as const;
