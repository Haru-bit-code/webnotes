"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { El, ElType, Pt } from "@/lib/types";
import { parsePlotShort, plotInner } from "@/lib/charts";

type Tool = "select" | "hand" | "pen" | "hl" | "eraser" | "line" | "arrow" | "rect" | "ellipse" | "diamond" | "triangle" | "cube" | "text" | "axes" | "plot";
const TOOLS: [Tool, string, string][] = [
  ["select", "↖", "Select / move (double-click text or plot to edit)"], ["hand", "✋", "Pan (or hold Space)"],
  ["pen", "✏️", "Pen"], ["hl", "🖍", "Highlighter"], ["eraser", "🧽", "Eraser"],
  ["line", "╱", "Line"], ["arrow", "→", "Arrow"], ["rect", "▭", "Rectangle"], ["ellipse", "◯", "Ellipse"], ["diamond", "◇", "Diamond (decision)"], ["triangle", "△", "Triangle"], ["cube", "🧊", "Cube (3D box)"],
  ["text", "T", "Text"], ["axes", "⊹", "Axes (x–y)"], ["plot", "ƒ", "Function plot"],
];
const COLORS = ["auto", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
const GRIDS = ["dots", "grid", "none"] as const;
const uid = () => Math.random().toString(36).slice(2, 10);
const stroke = (e: El) => (e.c === "auto" ? "currentColor" : e.c);

const pathD = (p: Pt[]) => {
  if (p.length === 1) return `M${p[0][0]} ${p[0][1]}l.01 0`;
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 1; i < p.length - 1; i++) d += `Q${p[i][0]} ${p[i][1]} ${(p[i][0] + p[i + 1][0]) / 2} ${(p[i][1] + p[i + 1][1]) / 2}`;
  return d + `L${p.at(-1)![0]} ${p.at(-1)![1]}`;
};

export function bbox(e: El) {
  if (e.pts) {
    const xs = e.pts.map((p) => p[0]), ys = e.pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (e.t === "text") {
    const lines = (e.text || "").split("\n"), fs = e.fs || 20;
    return { x: e.x, y: e.y - fs, w: Math.max(...lines.map((l) => l.length)) * fs * 0.6, h: lines.length * fs * 1.3 };
  }
  if (e.t === "cube") {
    const fw = Math.abs((e.x2 ?? e.x) - e.x), fh = Math.abs((e.y2 ?? e.y) - e.y);
    const dx = e.dx ?? fw * 0.35, dy = e.dy ?? -fh * 0.35;
    const fx = Math.min(e.x, e.x2 ?? e.x), fy = Math.min(e.y, e.y2 ?? e.y);
    const x0 = Math.min(fx, fx + dx), y0 = Math.min(fy, fy + dy);
    return { x: x0, y: y0, w: Math.max(fx + fw, fx + fw + dx) - x0, h: Math.max(fy + fh, fy + fh + dy) - y0 };
  }
  const x2 = e.x2 ?? e.x, y2 = e.y2 ?? e.y;
  return { x: Math.min(e.x, x2), y: Math.min(e.y, y2), w: Math.abs(x2 - e.x), h: Math.abs(y2 - e.y) };
}

function moveEl(e: El, dx: number, dy: number): El {
  return { ...e, x: e.x + dx, y: e.y + dy, ...(e.x2 !== undefined && { x2: e.x2 + dx, y2: e.y2! + dy }),
    ...(e.pts && { pts: e.pts.map(([x, y]) => [x + dx, y + dy] as Pt) }) };
}

export function Shape({ e }: { e: El }) {
  const s = stroke(e);
  const b = bbox(e);
  const common = { stroke: s, strokeWidth: e.w, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (e.t) {
    case "pen": case "hl": {
      let head: React.ReactNode = null;
      if (e.head && e.pts!.length > 1) { // curved arrow: arrowhead follows the end direction of the path
        const end = e.pts!.at(-1)!;
        let from = e.pts![0];
        for (let i = e.pts!.length - 2; i >= 0; i--) { if (Math.hypot(end[0] - e.pts![i][0], end[1] - e.pts![i][1]) >= 12) { from = e.pts![i]; break; } }
        const ang = Math.atan2(end[1] - from[1], end[0] - from[0]), hl = 8 + e.w * 2;
        head = <path d={`M${end[0] - hl * Math.cos(ang - 0.45)} ${end[1] - hl * Math.sin(ang - 0.45)}L${end[0]} ${end[1]}L${end[0] - hl * Math.cos(ang + 0.45)} ${end[1] - hl * Math.sin(ang + 0.45)}`} {...common} />;
      }
      return <>{head}<path d={pathD(e.pts!)} {...common} strokeOpacity={e.t === "hl" ? 0.35 : 1} strokeLinecap={e.t === "hl" ? "butt" : "round"} />
        <path d={pathD(e.pts!)} fill="none" stroke="transparent" strokeWidth={Math.max(e.w, 14)} /></>;
    }
    case "poly": return <path d={`M${e.pts!.map((q) => q.join(" ")).join("L")}Z`} {...common} fill="transparent" />;
    case "cube": {
      const w = Math.abs((e.x2 ?? e.x) - e.x), h = Math.abs((e.y2 ?? e.y) - e.y);
      const x = Math.min(e.x, e.x2 ?? e.x), y = Math.min(e.y, e.y2 ?? e.y);
      const dx = e.dx ?? w * 0.35, dy = e.dy ?? -h * 0.35;
      const L = dx >= 0, B = dy <= 0; // back face is to the right / above → its left and bottom edges are hidden
      const bx = x + dx, by = y + dy, dash = "5 4";
      let n = 0;
      const ln = (x1: number, y1: number, x2: number, y2: number, hidden = false) =>
        <line key={n++} x1={x1} y1={y1} x2={x2} y2={y2} {...common} strokeDasharray={hidden ? dash : undefined} strokeOpacity={hidden ? 0.6 : 1} />;
      return <g>
        {ln(bx, by, bx + w, by, !B)}{ln(bx, by + h, bx + w, by + h, B)}{ln(bx, by, bx, by + h, L)}{ln(bx + w, by, bx + w, by + h, !L)}
        {ln(x, y, bx, by, L && !B)}{ln(x + w, y, bx + w, by, !L && !B)}{ln(x, y + h, bx, by + h, L && B)}{ln(x + w, y + h, bx + w, by + h, !L && B)}
        <rect x={x} y={y} width={w} height={h} {...common} fill="transparent" />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" /></g>;
    }
    case "line": case "arrow": {
      const ang = Math.atan2(e.y2! - e.y, e.x2! - e.x), hl = 8 + e.w * 2;
      return <><line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} {...common} />
        {e.t === "arrow" && <path d={`M${e.x2! - hl * Math.cos(ang - 0.45)} ${e.y2! - hl * Math.sin(ang - 0.45)}L${e.x2} ${e.y2}L${e.x2! - hl * Math.cos(ang + 0.45)} ${e.y2! - hl * Math.sin(ang + 0.45)}`} {...common} />}
        <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke="transparent" strokeWidth={14} /></>;
    }
    case "rect": return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} {...common} fill="transparent" />;
    case "ellipse": return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...common} fill="transparent" />;
    case "diamond": return <path d={`M${b.x + b.w / 2} ${b.y}L${b.x + b.w} ${b.y + b.h / 2}L${b.x + b.w / 2} ${b.y + b.h}L${b.x} ${b.y + b.h / 2}Z`} {...common} fill="transparent" />;
    case "triangle": return <path d={`M${b.x + b.w / 2} ${b.y}L${b.x + b.w} ${b.y + b.h}L${b.x} ${b.y + b.h}Z`} {...common} fill="transparent" />;
    case "text":
      return <text x={e.x} y={e.y} fontSize={e.fs || 20} fill={s} fontFamily="ui-sans-serif,system-ui,sans-serif" style={{ whiteSpace: "pre" }}>
        {(e.text || "").split("\n").map((l, i) => <tspan key={i} x={e.x} dy={i ? (e.fs || 20) * 1.3 : 0}>{l}</tspan>)}</text>;
    case "axes": {
      const x0 = b.x + 24, y0 = b.y + b.h - 24, ticks: React.ReactNode[] = [];
      for (let x = x0 + 40; x < b.x + b.w - 8; x += 40) ticks.push(<line key={"x" + x} x1={x} x2={x} y1={y0 - 4} y2={y0 + 4} {...common} strokeWidth={1} />);
      for (let y = y0 - 40; y > b.y + 8; y -= 40) ticks.push(<line key={"y" + y} x1={x0 - 4} x2={x0 + 4} y1={y} y2={y} {...common} strokeWidth={1} />);
      return <g>
        <path d={`M${x0} ${y0}H${b.x + b.w}M${b.x + b.w - 8} ${y0 - 5}L${b.x + b.w} ${y0}L${b.x + b.w - 8} ${y0 + 5}M${x0} ${y0}V${b.y}M${x0 - 5} ${b.y + 8}L${x0} ${b.y}L${x0 + 5} ${b.y + 8}`} {...common} />
        {ticks}<rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" /></g>;
    }
    case "plot": {
      let inner = "";
      try { inner = plotInner(parsePlotShort(e.expr || "x"), Math.max(b.w, 120), Math.max(b.h, 90)); } catch { inner = `<text x="10" y="20" fill="#ef4444" font-size="12">invalid expression</text>`; }
      return <g color={s}><svg x={b.x} y={b.y} width={b.w} height={b.h} viewBox={`0 0 ${Math.max(b.w, 120)} ${Math.max(b.h, 90)}`} dangerouslySetInnerHTML={{ __html: inner }} />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" /></g>;
    }
  }
}

// ---- Shape recognition -------------------------------------------------------------
type Snap = { remove: string[]; el: El };
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pathLen = (p: Pt[]) => p.reduce((s, q, i) => s + (i ? dist(q, p[i - 1]) : 0), 0);

// Douglas–Peucker: indices of the points that matter
function rdpIdx(p: Pt[], eps: number, a = 0, b = p.length - 1, keep = new Set<number>([a, b])): number[] {
  const [ax, ay] = p[a], [bx, by] = p[b];
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9;
  let md = 0, mi = -1;
  for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (p[i][0] - ax) - dx * (p[i][1] - ay)) / l; if (d > md) { md = d; mi = i; } }
  if (md > eps && mi >= 0) { keep.add(mi); rdpIdx(p, eps, a, mi, keep); rdpIdx(p, eps, mi, b, keep); }
  return [...keep].sort((x, y) => x - y);
}

const turnAngle = (a: Pt, b: Pt, c: Pt) => {
  const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
  const d = Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1e-9;
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / d))) * 180) / Math.PI;
};

const straightDev = (pts: Pt[]) => {
  const a = pts[0], b = pts.at(-1)!, chord = dist(a, b) || 1e-9;
  return Math.max(...pts.map((p) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / chord));
};

// Turn a rough hand-drawn stroke into a clean shape. May also merge with the previous stroke
// (arrowhead added afterwards, or two offset squares → cube).
function recogniseAll(pts: Pt[], els: El[], base: { id: string; c: string; w: number }): Snap | null {
  if (pts.length < 5) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  const len = pathLen(pts);
  const a = pts[0], b = pts.at(-1)!, chord = dist(a, b);
  const mk = (e: Partial<El>, remove: string[] = []): Snap => ({ remove, el: { ...base, x: 0, y: 0, t: "line", ...e } as El });
  const prev = els.at(-1);

  // 1) a short stroke next to the end of the previous line/curve → arrowhead
  if (prev && chord > 8 && w < 90 && h < 90 && !(chord < len * 0.25)) {
    const open = prev.t === "line" || prev.t === "arrow" || prev.t === "pen";
    if (open) {
      const pa: Pt = prev.pts ? prev.pts[0] : [prev.x, prev.y], pb: Pt = prev.pts ? prev.pts.at(-1)! : [prev.x2!, prev.y2!];
      const plen = prev.pts ? pathLen(prev.pts) : dist(pa, pb);
      const near = (q: Pt) => Math.min(...pts.map((p) => dist(p, q)));
      if (len < 0.6 * plen && Math.min(near(pa), near(pb)) < 30) {
        const atStart = near(pa) < near(pb);
        if (prev.t === "arrow" || prev.head) return { remove: [prev.id], el: prev }; // extra wing: just absorb it
        if (prev.t === "line") return { remove: [prev.id], el: atStart ? { ...prev, t: "arrow", x: prev.x2!, y: prev.y2!, x2: prev.x, y2: prev.y } : { ...prev, t: "arrow" } };
        return { remove: [prev.id], el: { ...prev, head: true, pts: atStart ? [...prev.pts!].reverse() : prev.pts } };
      }
    }
  }

  // open stroke with arrowhead turned back at the end (straight or curved shaft)
  if (len > 40 && !(chord < len * 0.25)) {
    const idx = rdpIdx(pts, Math.max(5, len * 0.035));
    const S = idx.map((i) => pts[i]);
    for (let k = 1; k < S.length - 1; k++) {
      if (turnAngle(S[k - 1], S[k], S[k + 1]) < 100) continue;
      const shaft = pts.slice(0, idx[k] + 1), headLen = pathLen(pts.slice(idx[k]));
      const shaftLen = pathLen(shaft);
      if (shaftLen > 30 && headLen > 8 && headLen < 0.6 * shaftLen) {
        const tip = S[k];
        if (straightDev(shaft) < Math.max(8, dist(shaft[0], tip) * 0.07)) return mk({ t: "arrow", x: shaft[0][0], y: shaft[0][1], x2: tip[0], y2: tip[1] });
        const keep = rdpIdx(shaft, 3).map((i) => shaft[i]);
        return mk({ t: "pen", pts: keep, head: true });
      }
      break;
    }
  }
  // 2) straight line
  if (chord > 30 && straightDev(pts) < Math.max(8, chord * 0.07)) return mk({ t: "line", x: a[0], y: a[1], x2: b[0], y2: b[1] });

  // 3) closed shapes
  if (chord < len * 0.25 && w > 20 && h > 20) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = w / 2, ry = h / 2, diag = Math.hypot(w, h);
    const ell = pts.reduce((s, p) => s + Math.abs(((p[0] - cx) / rx) ** 2 + ((p[1] - cy) / ry) ** 2 - 1), 0) / pts.length;
    const tol = Math.min(w, h) * 0.1;
    const edge = pts.filter((p) => Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]) < tol).length / pts.length;
    // corner vertices of the outline
    const m = pts.reduce((best, p, i) => (dist(p, a) > dist(best.p, a) ? { p, i } : best), { p: a, i: 0 }).i;
    const idx = [...rdpIdx(pts.slice(0, m + 1), diag * 0.08), ...rdpIdx(pts.slice(m), diag * 0.08).map((i) => i + m)];
    let v = idx.filter((q, i) => i === 0 || q !== idx[i - 1]).map((i) => pts[i]);
    if (v.length > 1 && dist(v[0], v.at(-1)!) < diag * 0.12) v = v.slice(0, -1); // closing point
    const segDist = (p: Pt, s1: Pt, s2: Pt) => {
      const dx = s2[0] - s1[0], dy = s2[1] - s1[1], l2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - s1[0]) * dx + (p[1] - s1[1]) * dy) / l2));
      return Math.hypot(p[0] - s1[0] - t * dx, p[1] - s1[1] - t * dy);
    };
    const meanDev = v.length < 3 ? 1e9 : pts.reduce((sum, p) => sum + Math.min(...v.map((q, k) => segDist(p, q, v[(k + 1) % v.length]))), 0) / pts.length;
    const polygonal = v.length >= 3 && v.length <= 7 && meanDev < diag * 0.022; // straight edges between corners

    const area = Math.abs(v.reduce((sum, q, k) => sum + (q[0] * v[(k + 1) % v.length][1] - v[(k + 1) % v.length][0] * q[1]), 0)) / 2;
    if (ell < 0.07 || (!polygonal && ell < 0.12)) return mk({ t: "ellipse", x: x0, y: y0, x2: x1, y2: y1 });
    if (polygonal && v.length >= 5 && v.length <= 7 && w / h > 0.6 && w / h < 1.7 && area / (w * h) > 0.6 && area / (w * h) < 0.88) { // hexagon outline → isometric cube
      const d = Math.min(w, h) * 0.3;
      return mk({ t: "cube", x: x0, y: y0 + d, x2: x1 - d, y2: y1, dx: d, dy: -d });
    }
    if (edge > 0.8 && (polygonal || ell >= 0.2)) {
      // second square offset from a previous square → cube
      if (prev?.t === "rect") {
        const pw = Math.abs(prev.x2! - prev.x), ph = Math.abs(prev.y2! - prev.y), px = Math.min(prev.x, prev.x2!), py = Math.min(prev.y, prev.y2!);
        const dx = x0 - px, dy = y0 - py;
        if (Math.abs(w - pw) < 0.35 * pw && Math.abs(h - ph) < 0.35 * ph && Math.abs(dx) > 0.12 * pw && Math.abs(dy) > 0.12 * ph && Math.abs(dx) < 0.8 * pw && Math.abs(dy) < 0.8 * ph) {
          const frontIsNew = x0 - y0 < px - py; // front face = the lower-left one
          const f = frontIsNew ? { x: x0, y: y0, w, h } : { x: px, y: py, w: pw, h: ph };
          const k = frontIsNew ? { x: px, y: py } : { x: x0, y: y0 };
          return mk({ t: "cube", x: f.x, y: f.y, x2: f.x + f.w, y2: f.y + f.h, dx: k.x - f.x, dy: k.y - f.y }, [prev.id]);
        }
      }
      return mk({ t: "rect", x: x0, y: y0, x2: x1, y2: y1 });
    }
    if (polygonal) return mk({ t: "poly", pts: v });
    if (ell < 0.25) return mk({ t: "ellipse", x: x0, y: y0, x2: x1, y2: y1 });
  }

  return null;
}

export function Canvas({ initial, onChange, title }: { initial: El[]; onChange: (els: El[]) => void; title: string }) {
  const [els, setEls] = useState<El[]>(initial);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("auto");
  const [width, setWidth] = useState(3);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [draft, setDraft] = useState<El | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [smooth, setSmooth] = useState(5);
  const [snapGrid, setSnapGrid] = useState(false);
  const [penOnly, setPenOnly] = useState(false);
  const touches = useRef(new Map<number, Pt>());
  const gesture = useRef<null | { d0: number; m0: Pt; v0: { x: number; y: number; k: number } }>(null);
  const lastMove = useRef(0); // time the pointer last moved beyond the "held still" tolerance
  const anchor = useRef<Pt>([0, 0]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapPrev, setSnapPrev] = useState<Snap | null>(null);
  const stab = useRef<Pt>([0, 0]);
  const [grid, setGrid] = useState<(typeof GRIDS)[number]>("dots");
  const [textBox, setTextBox] = useState<{ id?: string; x: number; y: number; value: string } | null>(null);
  const past = useRef<El[][]>([]);
  const future = useRef<El[][]>([]);
  const elsRef = useRef(els); elsRef.current = els;
  const drawRef = useRef<El | null>(null);
  const drag = useRef<null | { mode: "draw" | "pan" | "move" | "erase"; sx: number; sy: number; last: Pt; snap?: El[]; moved?: boolean }>(null);
  const widthSnap = useRef<El[] | null>(null);
  const space = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);

  drawRef.current = draft;
  const commit = useCallback((next: El[], prev = elsRef.current) => {
    past.current.push(prev); future.current = [];
    setEls(next); onChange(next);
  }, [onChange]);
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(elsRef.current); setEls(p); onChange(p); setSel(null); };
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(elsRef.current); setEls(n); onChange(n); };

  const toWorld = (cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k];
  };

  const zoomBy = (f: number) => {
    const r = svgRef.current!.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2;
    setView((v) => { const k = Math.min(8, Math.max(0.1, v.k * f)); return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }; });
  };

  // wheel: pan, ctrl/pinch: zoom
  useEffect(() => {
    const svg = svgRef.current!;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        setView((v) => { const k = Math.min(8, Math.max(0.1, v.k * Math.exp(-e.deltaY * 0.01))); return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }; });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    svg.addEventListener("wheel", h, { passive: false });
    return () => svg.removeEventListener("wheel", h);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") { space.current = true; e.preventDefault(); }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { commit(elsRef.current.filter((x) => x.id !== sel)); setSel(null); }
      else if (e.key === "Escape") setSel(null);
      else if (!mod && /^[1-9]$/.test(e.key)) { const hit = TOOLS[+e.key - 1]; if (hit) setTool(hit[0]); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  const idAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-id]") as HTMLElement | null)?.dataset.id ?? null;

  const onDown = (e: React.PointerEvent) => {
    if (textBox) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.current.size === 2) { // second finger: cancel any stroke, start pinch / two-finger pan
        const [a, b] = [...touches.current.values()];
        const r = svgRef.current!.getBoundingClientRect();
        drag.current = null; setDraft(null);
        gesture.current = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top], v0: view };
        return;
      }
      if (touches.current.size > 2) return;
    }
    if (e.pointerType === "pen" && !penOnly) setPenOnly(true); // a stylus was used: let fingers pan instead
    const p = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || tool === "hand" || space.current || (penOnly && e.pointerType === "touch")) { drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, last: [view.x, view.y] }; return; }
    if (tool === "select") {
      const id = idAt(e.clientX, e.clientY);
      setSel(id);
      if (id) drag.current = { mode: "move", sx: 0, sy: 0, last: p, snap: elsRef.current };
      return;
    }
    if (tool === "eraser") { drag.current = { mode: "erase", sx: 0, sy: 0, last: p, snap: elsRef.current }; erase(e.clientX, e.clientY); return; }
    if (tool === "text") { setTimeout(() => setTextBox({ x: p[0], y: p[1], value: "" }), 0); return; } // after mousedown's focus change, or the box blurs at once
    const t = tool as ElType;
    const isFree = t === "pen" || t === "hl";
    if (!isFree && snapGrid) { p[0] = Math.round(p[0] / 24) * 24; p[1] = Math.round(p[1] / 24) * 24; }
    stab.current = p; lastMove.current = Date.now(); anchor.current = [e.clientX, e.clientY]; setSnapPrev(null);
    setDraft({ id: uid(), t, x: p[0], y: p[1], x2: p[0], y2: p[1], pts: isFree ? [p] : undefined, c: color, w: t === "hl" ? width * 5 : width });
    drag.current = { mode: "draw", sx: 0, sy: 0, last: p };
  };

  const erase = (cx: number, cy: number) => {
    const id = idAt(cx, cy);
    if (id && elsRef.current.some((x) => x.id === id)) setEls(elsRef.current.filter((x) => x.id !== id));
  };

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      const g = gesture.current;
      if (g && touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        const r = svgRef.current!.getBoundingClientRect();
        const k = Math.min(8, Math.max(0.1, (g.v0.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / g.d0));
        const m: Pt = [(a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top];
        const wp: Pt = [(g.m0[0] - g.v0.x) / g.v0.k, (g.m0[1] - g.v0.y) / g.v0.k];
        setView({ k, x: m[0] - wp[0] * k, y: m[1] - wp[1] * k });
        return;
      }
    }
    const d = drag.current; if (!d) return;
    if (d.mode === "pan") { setView((v) => ({ ...v, x: d.last[0] + e.clientX - d.sx, y: d.last[1] + e.clientY - d.sy })); return; }
    const p = toWorld(e.clientX, e.clientY);
    if (d.mode === "erase") { erase(e.clientX, e.clientY); return; }
    if (d.mode === "move" && sel) {
      d.moved = true;
      const dx = p[0] - d.last[0], dy = p[1] - d.last[1]; d.last = p;
      setEls((cur) => cur.map((x) => (x.id === sel ? moveEl(x, dx, dy) : x)));
      return;
    }
    if (d.mode === "draw" && drawRef.current?.pts) {
      // "held still" detection with a tolerance, since fingers always wobble a little
      const tol = e.pointerType === "touch" ? 12 : 5;
      if (Math.hypot(e.clientX - anchor.current[0], e.clientY - anchor.current[1]) > tol) {
        anchor.current = [e.clientX, e.clientY]; lastMove.current = Date.now(); setSnapPrev(null);
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current = setTimeout(() => {
          const dr = drawRef.current;
          if (dr?.pts && dr.t === "pen") setSnapPrev(recogniseAll(dr.pts, elsRef.current, dr));
        }, 480);
      }
    }
    if (d.mode === "draw") setDraft((dr) => {
      if (!dr) return dr;
      if (dr.pts) {
        const k = 1 - Math.min(0.9, smooth * 0.09); // stabiliser: follow the pointer with lag
        const q: Pt = [stab.current[0] + (p[0] - stab.current[0]) * k, stab.current[1] + (p[1] - stab.current[1]) * k];
        stab.current = q;
        return { ...dr, pts: [...dr.pts, q] };
      }
      let [x2, y2] = p;
      if (snapGrid) { x2 = Math.round(x2 / 24) * 24; y2 = Math.round(y2 / 24) * 24; }
      if (e.shiftKey) { // constrain: square / 45° line
        const dx = x2 - dr.x, dy = y2 - dr.y;
        if (dr.t === "line" || dr.t === "arrow") { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); x2 = dr.x + l * Math.cos(a); y2 = dr.y + l * Math.sin(a); }
        else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x2 = dr.x + Math.sign(dx) * m; y2 = dr.y + Math.sign(dy) * m; }
      }
      return { ...dr, x2, y2 };
    });
  };

  const onUp = (e?: React.PointerEvent) => {
    if (e?.pointerType === "touch") { touches.current.delete(e.pointerId); if (touches.current.size < 2) gesture.current = null; }
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (d.mode === "erase" || d.mode === "move") {
      if (d.mode === "erase" ? elsRef.current.length !== d.snap!.length : d.moved) { past.current.push(d.snap!); future.current = []; onChange(elsRef.current); }
      return;
    }
    if (d.mode !== "draw" || !draft) return;
    let el = draft;
    setDraft(null);
    if (el.pts) {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (el.t === "pen" && (snapPrev || Date.now() - lastMove.current > 450)) { // held still before lifting → snap to clean shape
        const r = snapPrev ?? recogniseAll(el.pts, elsRef.current, el);
        if (r) { setSnapPrev(null); commit([...elsRef.current.filter((x) => !r.remove.includes(x.id)), r.el]); return; }
      }
      setSnapPrev(null);
      commit([...elsRef.current, el]);
      return;
    }
    const big = Math.hypot((el.x2 ?? 0) - el.x, (el.y2 ?? 0) - el.y) > 6;
    if (!big) return;
    if (el.t === "plot") {
      const ex = window.prompt("Function(s) of x, separated by ;  — optional range after @\nExample:  sin(x); x^2/10 @ -2*pi..2*pi", "sin(x)");
      if (!ex) return;
      try { parsePlotShort(ex); } catch (err) { alert("Invalid: " + (err as Error).message); return; }
      const x2 = el.x + Math.sign((el.x2 ?? el.x) - el.x || 1) * Math.max(240, Math.abs((el.x2 ?? el.x) - el.x));
      const y2 = el.y + Math.sign((el.y2 ?? el.y) - el.y || 1) * Math.max(160, Math.abs((el.y2 ?? el.y) - el.y));
      el = { ...el, expr: ex, w: 1, x2, y2 };
    }
    commit([...elsRef.current, el]);
    setSel(el.id);
    if (el.t !== "axes") setTool("select");
  };

  const onDouble = (e: React.MouseEvent) => {
    const id = idAt(e.clientX, e.clientY); const el = els.find((x) => x.id === id);
    if (!el) return;
    if (el.t === "text") setTextBox({ id: el.id, x: el.x, y: el.y, value: el.text || "" });
    if (el.t === "plot") {
      const ex = window.prompt("Edit function(s):", el.expr);
      if (ex) { try { parsePlotShort(ex); commit(els.map((x) => (x.id === el.id ? { ...x, expr: ex } : x))); } catch (err) { alert("Invalid: " + (err as Error).message); } }
    }
  };

  const commitText = () => {
    const tb = textBox; setTextBox(null);
    if (!tb) return;
    if (tb.id) commit(tb.value.trim() ? els.map((x) => (x.id === tb.id ? { ...x, text: tb.value } : x)) : els.filter((x) => x.id !== tb.id));
    else if (tb.value.trim()) { commit([...els, { id: uid(), t: "text", x: tb.x, y: tb.y + 16, c: color, w: 1, text: tb.value, fs: 16 + width * 2 }]); }
  };

  const exportSvg = () => {
    const all = els.map(bbox);
    if (!all.length) return null;
    const x = Math.min(...all.map((b) => b.x)) - 24, y = Math.min(...all.map((b) => b.y)) - 24;
    const w = Math.max(...all.map((b) => b.x + b.w)) + 24 - x, h = Math.max(...all.map((b) => b.y + b.h)) + 24 - y;
    const cs = getComputedStyle(document.documentElement);
    const fg = cs.getPropertyValue("--text").trim() || "#111", bg = cs.getPropertyValue("--bg").trim() || "#fff";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" color="${fg}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/>${worldRef.current!.innerHTML}</svg>`;
    return { svg, w, h };
  };
  const download = (href: string, name: string) => { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); };
  const fname = (ext: string) => (title.trim() || "canvas").replace(/[^\w-]+/g, "_") + "." + ext;
  const doExport = (kind: "png" | "svg") => {
    const o = exportSvg(); if (!o) return alert("Nothing to export yet");
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(o.svg);
    if (kind === "svg") return download(url, fname("svg"));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = o.w * 2; c.height = o.h * 2;
      const ctx = c.getContext("2d")!; ctx.scale(2, 2); ctx.drawImage(img, 0, 0, o.w, o.h);
      download(c.toDataURL("image/png"), fname("png"));
    };
    img.src = url;
  };

  const selEl = els.find((x) => x.id === sel);
  const sb = selEl ? bbox(selEl) : null;
  const cursor = tool === "hand" || space.current ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  const btn = "btn cbtn";

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      <svg ref={svgRef} className="h-full w-full touch-none" style={{ cursor }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDouble}>
        <defs>
          <pattern id="dots" width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <circle cx={1} cy={1} r={1.1} fill="currentColor" opacity=".25" /></pattern>
          <pattern id="grid" width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <path d={`M${24 * view.k} 0H0V${24 * view.k}`} fill="none" stroke="currentColor" opacity=".12" /></pattern>
        </defs>
        {grid !== "none" && <rect width="100%" height="100%" fill={`url(#${grid})`} pointerEvents="none" />}
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g ref={worldRef}>{els.filter((e) => !snapPrev?.remove.includes(e.id)).map((e) => <g key={e.id} data-id={e.id}><Shape e={e} /></g>)}</g>
          {draft && <Shape e={snapPrev ? snapPrev.el : draft} />}
          {sb && <rect x={sb.x - 6} y={sb.y - 6} width={sb.w + 12} height={sb.h + 12} fill="none" stroke="var(--accent)" strokeDasharray="5 4" strokeWidth={1.5 / view.k} pointerEvents="none" />}
        </g>
      </svg>

      {textBox && (
        <textarea autoFocus className="bd absolute min-w-[120px] resize rounded border bg-transparent p-1"
          style={{ left: textBox.x * view.k + view.x, top: (textBox.y) * view.k + view.y, fontSize: (16 + width * 2) * view.k, color: "var(--text)" }}
          placeholder="Type… (Esc / click away to finish)" value={textBox.value}
          onChange={(e) => setTextBox({ ...textBox, value: e.target.value })} onBlur={commitText}
          onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLElement).blur(); }} />
      )}

      <div className="bg-panel bd absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-xl border p-1.5 shadow">
        {TOOLS.map(([t, icon, tip]) => (
          <button key={t} title={tip} className={`${btn} ${tool === t ? "accent-bg" : ""}`} onClick={() => setTool(t)}>{icon}</button>
        ))}
        <span className="bd mx-1 h-5 border-l" />
        {COLORS.map((c) => (
          <button key={c} title={c} onClick={() => { setColor(c); if (selEl) commit(els.map((x) => (x.id === sel ? { ...x, c } : x))); }}
            className="cdot h-5 w-5 rounded-full border-2" style={{ background: c === "auto" ? "var(--text)" : c, borderColor: color === c ? "var(--accent)" : "transparent", outline: "1px solid var(--border)" }} />
        ))}
        <input type="range" min={1} max={12} value={width} className="w-16" title="Stroke width (also applies to the selected object)"
          onChange={(e) => { const v = +e.target.value; setWidth(v); if (selEl && selEl.t !== "plot") setEls((cur) => cur.map((x) => (x.id === sel ? (x.t === "text" ? { ...x, fs: 16 + v * 2 } : { ...x, w: x.t === "hl" ? v * 5 : v }) : x))); }}
          onPointerUp={() => { if (selEl && selEl.t !== "plot") { past.current.push(widthSnap.current ?? els); future.current = []; onChange(elsRef.current); } }}
          onPointerDown={() => { widthSnap.current = elsRef.current; }} />
        <span className="muted text-xs" title="Stabiliser: higher = smoother lines for shaky mouse/trackpad">〰</span>
        <input type="range" min={0} max={9} value={smooth} onChange={(e) => setSmooth(+e.target.value)} className="w-16" title="Stabiliser: higher = smoother lines for shaky mouse/trackpad" />
        <button className={`${btn} ${snapGrid ? "accent-bg" : ""}`} title="Snap shapes, lines and arrows to the grid" onClick={() => setSnapGrid((v) => !v)}>⌗ snap</button>
        <span className="bd mx-1 h-5 border-l" />
        <button className={`${btn} ${penOnly ? "accent-bg" : ""}`} title="Pen only: fingers pan & zoom, only a stylus draws (switches on automatically when a stylus is detected)" onClick={() => setPenOnly((v) => !v)}>{penOnly ? "🖊 pen only" : "👆 finger draws"}</button>
        <button className={btn} title="Undo (⌘Z)" onClick={undo}>↶</button>
        <button className={btn} title="Redo (⇧⌘Z)" onClick={redo}>↷</button>
        <button className={btn} title="Delete selected" onClick={() => { if (sel) { commit(els.filter((x) => x.id !== sel)); setSel(null); } }}>🗑</button>
        <span className="bd mx-1 h-5 border-l" />
        <button className={btn} title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
        <button className={btn} title="Reset view" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{Math.round(view.k * 100)}%</button>
        <button className={btn} title="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
        <button className={btn} title="Background" onClick={() => setGrid(GRIDS[(GRIDS.indexOf(grid) + 1) % GRIDS.length])}>▦ {grid}</button>
        <button className={btn} onClick={() => doExport("png")}>PNG</button>
        <button className={btn} onClick={() => doExport("svg")}>SVG</button>
        <button className={btn} onClick={() => confirm("Clear the whole canvas?") && commit([])}>Clear</button>
      </div>
    </div>
  );
}
