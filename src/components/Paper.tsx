"use client";
// Page backgrounds for scribble pages, like the paper choices in GoodNotes / Notability.
// Patterns are defined in world units and follow the canvas pan/zoom through patternTransform.
import { useId } from "react";
import { Paper } from "@/lib/types";

export const PAPERS: { id: Paper; name: string; hint: string }[] = [
  { id: "blank", name: "Blank", hint: "Plain page" },
  { id: "dots", name: "Dotted", hint: "Bullet-journal dots" },
  { id: "grid", name: "Grid", hint: "Squares for sketches" },
  { id: "graph", name: "Graph paper", hint: "Fine grid, bold every 5" },
  { id: "ruled-narrow", name: "Narrow ruled", hint: "Small handwriting" },
  { id: "ruled", name: "College ruled", hint: "Lined, with margin" },
  { id: "ruled-wide", name: "Wide ruled", hint: "Large handwriting" },
  { id: "handwriting", name: "Handwriting", hint: "School 3-line guides" },
  { id: "cornell", name: "Cornell", hint: "Cue column + notes" },
  { id: "isometric", name: "Isometric", hint: "3D drawing dots" },
  { id: "music", name: "Music staff", hint: "Five-line staves" },
];

type View = { x: number; y: number; k: number };
const LINE = "var(--paper-line)", MARGIN = "var(--paper-margin)";
const ISO_W = 24 * Math.sqrt(3);

function pattern(paper: Paper): { w: number; h: number; body: React.ReactNode } | null {
  switch (paper) {
    case "dots": return { w: 24, h: 24, body: <circle cx={12} cy={12} r={1.15} fill="currentColor" opacity={0.3} /> };
    case "grid": return { w: 24, h: 24, body: <path d="M24 0H0V24" fill="none" stroke="currentColor" opacity={0.13} /> };
    case "graph": {
      const minor = [12, 24, 36, 48].map((v) => `M${v} 0V60M0 ${v}H60`).join("");
      return { w: 60, h: 60, body: <><path d={minor} fill="none" stroke={LINE} opacity={0.16} strokeWidth={0.6} /><path d="M60 0H0V60" fill="none" stroke={LINE} opacity={0.38} /></> };
    }
    case "ruled-narrow": case "ruled": case "ruled-wide": {
      const h = paper === "ruled-narrow" ? 24 : paper === "ruled" ? 30 : 38;
      return { w: 16, h, body: <path d={`M0 ${h - 0.5}H16`} stroke={LINE} opacity={0.45} /> };
    }
    case "cornell": return { w: 16, h: 30, body: <path d="M0 29.5H16" stroke={LINE} opacity={0.45} /> };
    case "handwriting": return { w: 16, h: 72, body: <>
      <path d="M0 14H16M0 50H16" stroke={LINE} opacity={0.55} />
      <path d="M0 32H8" stroke={LINE} opacity={0.4} />
    </> };
    case "isometric": return { w: ISO_W, h: 24, body: <>
      {[[0, 0], [ISO_W, 0], [0, 24], [ISO_W, 24], [ISO_W / 2, 12]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.1} fill="currentColor" opacity={0.32} />)}
    </> };
    case "music": return { w: 16, h: 120, body: <path d={[30, 39, 48, 57, 66].map((y) => `M0 ${y}H16`).join("")} stroke="currentColor" opacity={0.32} /> };
    default: return null;
  }
}

// Lines that are fixed in world space (margins, Cornell cue column)
function decorations(paper: Paper) {
  const big = 1e5;
  if (paper === "ruled" || paper === "ruled-narrow" || paper === "ruled-wide")
    return <path d={`M72 ${-big}V${big}`} stroke={MARGIN} opacity={0.55} vectorEffect="non-scaling-stroke" />;
  if (paper === "cornell")
    return <path d={`M${-big} 90H${big}M220 90V${big}`} stroke={MARGIN} opacity={0.55} vectorEffect="non-scaling-stroke" />;
  return null;
}

export function PaperLayer({ paper, view }: { paper: Paper; view: View }) {
  const id = "p" + useId().replace(/:/g, "");
  const p = pattern(paper);
  const t = `translate(${view.x} ${view.y}) scale(${view.k})`;
  return (
    <g pointerEvents="none">
      {p && <>
        <defs><pattern id={id} width={p.w} height={p.h} patternUnits="userSpaceOnUse" patternTransform={t}>{p.body}</pattern></defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </>}
      <g transform={t}>{decorations(paper)}</g>
    </g>
  );
}

export function PaperSwatch({ paper }: { paper: Paper }) {
  return (
    <svg className="paper-swatch" viewBox="0 0 120 84" aria-hidden="true">
      <rect width="120" height="84" fill="var(--raised)" />
      <PaperLayer paper={paper} view={{ x: 0, y: 0, k: 0.5 }} />
    </svg>
  );
}

export function PaperPicker({ value, onPick }: { value?: Paper; onPick: (p: Paper) => void }) {
  return (
    <div className="paper-grid" role="listbox" aria-label="Paper style">
      {PAPERS.map((p) => (
        <button key={p.id} role="option" aria-selected={value === p.id} className={`paper-opt ${value === p.id ? "on" : ""}`} onClick={() => onPick(p.id)} title={p.hint}>
          <PaperSwatch paper={p.id} />
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}
