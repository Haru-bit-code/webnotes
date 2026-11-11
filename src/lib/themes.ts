// One-tap colour themes: an accent (buttons, links, highlights) plus the two other colours of the glow
// behind the glass. Each set is checked to look good in light and dark mode.
export type Theme = { id: string; name: string; accent: string; glow: [string, string] };
export const THEMES: Theme[] = [
  { id: "aurora", name: "Aurora", accent: "#6366f1", glow: ["#c084fc", "#38bdf8"] },
  { id: "ocean", name: "Ocean", accent: "#0284c7", glow: ["#22d3ee", "#6366f1"] },
  { id: "forest", name: "Forest", accent: "#15803d", glow: ["#84cc16", "#14b8a6"] },
  { id: "sunset", name: "Sunset", accent: "#ea580c", glow: ["#f43f5e", "#facc15"] },
  { id: "rose", name: "Rose", accent: "#db2777", glow: ["#f472b6", "#a855f7"] },
  { id: "mono", name: "Graphite", accent: "#475569", glow: ["#94a3b8", "#64748b"] },
];
export const DEFAULT_THEME = THEMES[0];

/** dark or white text, whichever reads better on this colour (WCAG relative luminance) */
export function textOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => { const c = parseInt(m[1].slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contrast with white = 1.05 / (L + .05); with near-black (#111827, L≈.012) = (L + .05) / .062
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.062 ? "#ffffff" : "#111827";
}
