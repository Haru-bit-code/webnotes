"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { El, ElType, Paper, Pt } from "@/lib/types";
import { parsePlotShort, plotInner } from "@/lib/charts";
import { CATEGORIES, STAMPS, placeStamp } from "@/lib/stamps";
import { useCustomTemplates } from "@/lib/customTemplates";
import { PaperLayer, PaperPicker } from "./Paper";
import { Icon } from "./Icon";
import rough from "roughjs";

type Tool = "select" | "hand" | "pen" | "hl" | "eraser" | "line" | "arrow" | "rect" | "ellipse" | "diamond" | "triangle" | "cube" | "text" | "axes" | "plot";
const TOOLS: [Tool, string, string][] = [
  ["select", "cursor", "Select / move (double-click text or plot to edit)"], ["hand", "hand", "Pan (or hold Space)"],
  ["pen", "pen", "Pen (hold still at the end to snap to a clean shape)"], ["hl", "highlighter", "Highlighter"], ["eraser", "eraser", "Eraser"],
  ["line", "line", "Line"], ["arrow", "arrowTool", "Arrow"], ["rect", "rect", "Rectangle"], ["ellipse", "ellipse", "Ellipse"], ["diamond", "diamond", "Diamond (decision)"], ["triangle", "triangle", "Triangle"], ["cube", "cube", "Cube (3D box)"],
  ["text", "text", "Text"], ["axes", "axes", "Axes (x–y)"], ["plot", "plot", "Function plot"],
];
const COLORS = ["auto", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
const uid = () => Math.random().toString(36).slice(2, 10);
const stroke = (e: El) => (e.c === "auto" ? "currentColor" : e.c === "accent" ? "var(--accent)" : e.c);
const fillOf = (e: El) => (!e.fill ? "transparent" : e.fill === "accent" ? "var(--accent)" : e.fill);
const fillOp = (e: El) => (e.fill === "accent" ? 0.14 : 1);

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
  return { ...e, x: e.x + dx, y: e.y + dy, ...(e.x2 !== undefined && { x2: e.x2 + dx, y2: e.y2! + dy }), ...(e.rc && { rc: [e.rc[0] + dx, e.rc[1] + dy] as Pt }),
    ...(e.pts && { pts: e.pts.map(([x, y]) => [x + dx, y + dy] as Pt) }) };
}

function scaleEl(e: El, ax: number, ay: number, k: number): El {
  const fx = (v: number) => ax + (v - ax) * k, fy = (v: number) => ay + (v - ay) * k;
  return {
    ...e, x: fx(e.x), y: fy(e.y),
    ...(e.x2 !== undefined && { x2: fx(e.x2), y2: fy(e.y2!) }),
    ...(e.pts && { pts: e.pts.map(([a, b]) => [fx(a), fy(b)] as Pt) }),
    ...(e.rc && { rc: [fx(e.rc[0]), fy(e.rc[1])] as Pt }),
    ...(e.fs && { fs: Math.max(6, e.fs * k) }),
    ...(e.dx !== undefined && { dx: e.dx * k }), ...(e.dy !== undefined && { dy: e.dy * k }),
  };
}

// ---- hand-drawn ("sketch") rendering via rough.js, deterministic per element id ----
const gen = rough.generator();
const roughCache = new Map<string, { d: string; fill: boolean }[]>();
const seedOf = (id: string) => { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 2 ** 31) || 1; };
function roughPaths(e: El, b: { x: number; y: number; w: number; h: number }) {
  const key = JSON.stringify([e.id, e.t, e.x, e.y, e.x2, e.y2, e.pts, e.w, e.sk, !!e.fill]);
  const hit = roughCache.get(key); if (hit) return hit;
  const o = { seed: seedOf(e.id), roughness: e.sk, bowing: 0.9, strokeWidth: e.w, stroke: "S", fill: e.fill ? "F" : undefined, fillStyle: "solid", disableMultiStroke: true, preserveVertices: false };
  let dr;
  switch (e.t) {
    case "rect": dr = gen.rectangle(b.x, b.y, b.w, b.h, o); break;
    case "ellipse": dr = gen.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, o); break;
    case "diamond": dr = gen.polygon([[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]], o); break;
    case "triangle": dr = gen.polygon([[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], o); break;
    case "poly": dr = gen.polygon(e.pts as [number, number][], o); break;
    default: dr = gen.line(e.x, e.y, e.x2!, e.y2!, o);
  }
  const out = gen.toPaths(dr).map((p) => ({ d: p.d, fill: !!p.fill && p.fill !== "none" }));
  if (roughCache.size > 3000) roughCache.clear();
  roughCache.set(key, out);
  return out;
}
const FONTS: Record<string, string> = {
  hand: "Kalam,'Comic Sans MS',cursive", script: "Caveat,'Comic Sans MS',cursive", mono: "'JetBrains Mono',ui-monospace,monospace",
};

export function Shape({ e }: { e: El }) {
  const body = <ShapeBody e={e} />;
  const b = e.shadow ? bbox(e) : null;
  const shadow = b && <rect x={b.x + 3} y={b.y + 5} width={b.w} height={b.h} rx={3} fill="#0f172a" opacity={0.13} />;
  if (!e.rot) return shadow ? <>{shadow}{body}</> : body;
  const c = e.rc ?? (() => { const q = bbox(e); return [q.x + q.w / 2, q.y + q.h / 2]; })();
  return <g transform={`rotate(${e.rot} ${c[0]} ${c[1]})`}>{shadow}{body}</g>;
}

function ShapeBody({ e }: { e: El }) {
  const s = stroke(e);
  const b = bbox(e);
  const common = { stroke: s, strokeWidth: e.w, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeDasharray: e.dash ? "7 6" : undefined };
  if (e.sk && ["rect", "ellipse", "diamond", "triangle", "poly", "line", "arrow"].includes(e.t)) {
    const paths = roughPaths(e, b);
    let head: React.ReactNode = null;
    if (e.t === "arrow") {
      const ang = Math.atan2(e.y2! - e.y, e.x2! - e.x), hl = 9 + e.w * 2;
      head = <path d={`M${e.x2! - hl * Math.cos(ang - 0.42)} ${e.y2! - hl * Math.sin(ang - 0.42)}Q${e.x2! - hl * 0.3 * Math.cos(ang)} ${e.y2! - hl * 0.3 * Math.sin(ang) + 0.5} ${e.x2} ${e.y2}Q${e.x2! - hl * 0.35 * Math.cos(ang)} ${e.y2! - hl * 0.35 * Math.sin(ang) - 0.5} ${e.x2! - hl * Math.cos(ang + 0.42)} ${e.y2! - hl * Math.sin(ang + 0.42)}`} {...common} strokeDasharray={undefined} />;
    }
    const hitArea = e.t === "line" || e.t === "arrow"
      ? <line x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} stroke="transparent" strokeWidth={14} />
      : <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />;
    return <g>{hitArea}{paths.map((p, i) => p.fill
      ? <path key={i} d={p.d} fill={fillOf(e)} fillOpacity={fillOp(e)} stroke="none" />
      : <path key={i} d={p.d} {...common} />)}{head}</g>;
  }
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
    case "rect": return <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={3} {...common} fill={fillOf(e)} fillOpacity={fillOp(e)} />;
    case "ellipse": return <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...common} fill={fillOf(e)} fillOpacity={fillOp(e)} />;
    case "diamond": return <path d={`M${b.x + b.w / 2} ${b.y}L${b.x + b.w} ${b.y + b.h / 2}L${b.x + b.w / 2} ${b.y + b.h}L${b.x} ${b.y + b.h / 2}Z`} {...common} fill={fillOf(e)} fillOpacity={fillOp(e)} />;
    case "triangle": return <path d={`M${b.x + b.w / 2} ${b.y}L${b.x + b.w} ${b.y + b.h}L${b.x} ${b.y + b.h}Z`} {...common} fill="transparent" />;
    case "text":
      return <g><rect x={b.x - 4} y={b.y - 2} width={Math.max(b.w, 24) + 8} height={b.h + 4} fill="transparent" />
        <text x={e.x} y={e.y} fontSize={e.fs || 20} fill={s} fontFamily={FONTS[e.font ?? ""] ?? "'Hanken Grotesk',ui-sans-serif,system-ui,sans-serif"} fontWeight={e.bold ? 700 : undefined} style={{ whiteSpace: "pre" }}>
        {(e.text || "").split("\n").map((l, i) => <tspan key={i} x={e.x} dy={i ? (e.fs || 20) * 1.3 : 0}>{l}</tspan>)}</text></g>;
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

export function Canvas({ initial, onChange, title, paper = "dots", onPaper }: { initial: El[]; onChange: (els: El[]) => void; title: string; paper?: Paper; onPaper?: (p: Paper) => void }) {
  const [panel, setPanel] = useState<null | "templates" | "paper" | "more" | "save">(null);
  const [cat, setCat] = useState<string>("Sketch");
  const custom = useCustomTemplates();
  const [sketch, setSketch] = useState(() => { try { return localStorage.getItem("webnotes:sketch") === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("webnotes:sketch", sketch ? "1" : "0"); } catch { /* ignore */ } }, [sketch]);
  const [marq, setMarq] = useState<null | { x: number; y: number; x2: number; y2: number }>(null);
  const [els, setEls] = useState<El[]>(initial);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("auto");
  const [width, setWidth] = useState(3);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [draft, setDraft] = useState<El | null>(null);
  const [selIds, setSelIds] = useState<string[]>([]);
  const sel = selIds[0] ?? null;
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
  // text being typed: x/y is the left end of the first line's baseline, in world units
  const [textBox, setTextBox] = useState<{ id?: string; x: number; y: number; value: string; fs: number; font?: El["font"]; bold?: boolean; c: string; g?: string; rot?: number; rc?: Pt } | null>(null);
  const lastPt = useRef<Pt | null>(null);       // where the page was last clicked: typing starts here
  const active = useRef(false);                 // keyboard goes to the page only after it was clicked
  const rootRef = useRef<HTMLDivElement>(null);
  const clip = useRef<{ els: El[]; marker: string } | null>(null);
  const past = useRef<El[][]>([]);
  const future = useRef<El[][]>([]);
  const elsRef = useRef(els); elsRef.current = els;
  const drawRef = useRef<El | null>(null);
  const drag = useRef<null | { mode: "draw" | "pan" | "move" | "erase" | "marquee" | "scale"; sx: number; sy: number; last: Pt; snap?: El[]; moved?: boolean; editOnUp?: string; box?: { x: number; y: number; w: number; h: number }; ids?: string[] }>(null);
  const widthSnap = useRef<El[] | null>(null);
  const space = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);

  drawRef.current = draft;
  // on open, scroll so the page's content starts below the floating toolbar
  useEffect(() => {
    const list = elsRef.current; if (!list.length) return;
    const svg = svgRef.current, dock = rootRef.current?.querySelector(".dock");
    if (!svg || !dock) return;
    const top = dock.getBoundingClientRect().bottom - svg.getBoundingClientRect().top + 20;
    const bs = list.map(bbox), minY = Math.min(...bs.map((q) => q.y)), minX = Math.min(...bs.map((q) => q.x)), maxX = Math.max(...bs.map((q) => q.x + q.w));
    const avail = svg.getBoundingClientRect().width - 32, wide = Math.max(0, maxX) - Math.min(0, minX);
    const k = wide > avail ? Math.max(0.45, avail / wide) : 1; // zoom out so the whole width fits
    setView({ k, x: minX * k < 16 ? 16 - minX * k : 0, y: Math.max(0, top - minY * k) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // a template's shapes share a group id: selecting one selects the whole group
  const withGroups = (ids: string[], list = elsRef.current) => { const gs = new Set(list.filter((x) => ids.includes(x.id) && x.g).map((x) => x.g)); return list.filter((x) => ids.includes(x.id) || (x.g && gs.has(x.g))).map((x) => x.id); };
  const setSel = (id: string | null, add = false) => setSelIds((cur) => { if (!id) return add ? cur : []; const ids = withGroups([id]); if (!add) return ids; return cur.includes(id) ? cur.filter((x) => !ids.includes(x)) : [...cur, ...ids]; });
  const selRef = useRef(selIds); selRef.current = selIds;
  const sb = (() => {
    const bs = els.filter((x) => selIds.includes(x.id)).map(bbox); if (!bs.length) return null;
    const x = Math.min(...bs.map((q) => q.x)), y = Math.min(...bs.map((q) => q.y));
    return { x, y, w: Math.max(...bs.map((q) => q.x + q.w)) - x, h: Math.max(...bs.map((q) => q.y + q.h)) - y };
  })();

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
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); commit(elsRef.current.filter((x) => !selRef.current.includes(x.id))); setSel(null); }
      else if (e.key === "Escape") setSel(null);
      if (!active.current || e.defaultPrevented) return;
      const ids = selRef.current, cur = elsRef.current;
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelIds(cur.map((x) => x.id)); setTool("select"); }
      else if (mod && e.key.toLowerCase() === "d" && ids.length) { e.preventDefault(); pasteEls(cur.filter((x) => ids.includes(x.id))); }
      else if (ids.length && e.key.startsWith("Arrow")) {
        e.preventDefault(); const st = e.shiftKey ? 10 : 1;
        const [dx, dy] = e.key === "ArrowLeft" ? [-st, 0] : e.key === "ArrowRight" ? [st, 0] : e.key === "ArrowUp" ? [0, -st] : [0, st];
        commit(cur.map((x) => (ids.includes(x.id) ? moveEl(x, dx, dy) : x)));
      }
      else if (e.key === "Enter" && ids.length) { const t = firstText(ids); if (t) { e.preventDefault(); editText(t); } }
      else if (!mod && !e.altKey && e.key.length === 1 && e.code !== "Space" && tool !== "hand") {
        // just start typing: edits the selected text, or starts new text where the page was last clicked
        e.preventDefault();
        const t = ids.length ? firstText(ids) : null;
        if (t && ids.every((id) => cur.find((x) => x.id === id)?.t === "text")) editText(t, e.key);
        else startText(lastPt.current ?? centre(), e.key);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    const inField = () => { const t = document.activeElement?.tagName; return t === "INPUT" || t === "TEXTAREA" || t === "SELECT"; };
    const copy = (e: ClipboardEvent, cut: boolean) => {
      if (!active.current || inField() || !selRef.current.length) return;
      const picked = elsRef.current.filter((x) => selRef.current.includes(x.id));
      const marker = picked.filter((x) => x.t === "text").map((x) => x.text).join("\n") || "[WebNotes drawing]";
      clip.current = { els: picked, marker }; e.clipboardData?.setData("text/plain", marker); e.preventDefault();
      if (cut) { commit(elsRef.current.filter((x) => !selRef.current.includes(x.id))); setSel(null); }
    };
    const onCopy = (e: ClipboardEvent) => copy(e, false), onCut = (e: ClipboardEvent) => copy(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (!active.current || inField()) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      e.preventDefault();
      if (clip.current && text === clip.current.marker) { pasteEls(clip.current.els); return; }
      if (!text.trim()) return;
      const p = lastPt.current ?? centre(), st = newTextStyle();
      const el: El = { id: uid(), t: "text", x: p[0], y: p[1] + st.fs * 0.35, text: text.replace(/\r/g, ""), w: 1, ...st };
      commit([...elsRef.current, el]); setSelIds([el.id]); setTool("select");
    };
    const outside = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) active.current = false; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    document.addEventListener("copy", onCopy); document.addEventListener("cut", onCut); document.addEventListener("paste", onPaste);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
      document.removeEventListener("copy", onCopy); document.removeEventListener("cut", onCut); document.removeEventListener("paste", onPaste);
      document.removeEventListener("pointerdown", outside, true);
    };
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
    active.current = true; lastPt.current = p;
    if (tool === "select" && (e.target as Element).closest?.("[data-handle]") && sb) {
      drag.current = { mode: "scale", sx: 0, sy: 0, last: p, snap: elsRef.current, box: sb, ids: selRef.current }; return;
    }
    if (e.button === 1 || tool === "hand" || space.current || (penOnly && e.pointerType === "touch")) { drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, last: [view.x, view.y] }; return; }
    if (tool === "select") {
      const id = idAt(e.clientX, e.clientY);
      if (!id) { if (!e.shiftKey) setSel(null); setMarq({ x: p[0], y: p[1], x2: p[0], y2: p[1] }); drag.current = { mode: "marquee", sx: 0, sy: 0, last: p }; return; }
      if (e.shiftKey) { setSel(id, true); return; }
      const already = selRef.current.includes(id);
      if (!already) setSel(id);
      const hitEl = elsRef.current.find((x) => x.id === id);
      // clicking a text that is already selected (e.g. inside a template) opens it for typing
      drag.current = { mode: "move", sx: 0, sy: 0, last: p, snap: elsRef.current, editOnUp: already && hitEl?.t === "text" ? id : undefined };
      return;
    }
    if (tool === "eraser") { drag.current = { mode: "erase", sx: 0, sy: 0, last: p, snap: elsRef.current }; erase(e.clientX, e.clientY); return; }
    if (tool === "text") { // after mousedown's focus change, or the box blurs at once
      const id = idAt(e.clientX, e.clientY), hitEl = elsRef.current.find((x) => x.id === id);
      setTimeout(() => (hitEl?.t === "text" ? editText(hitEl) : startText(p, "", hitEl)), 0); return;
    }
    const t = tool as ElType;
    const isFree = t === "pen" || t === "hl";
    if (!isFree && snapGrid) { p[0] = Math.round(p[0] / 24) * 24; p[1] = Math.round(p[1] / 24) * 24; }
    stab.current = p; lastMove.current = Date.now(); anchor.current = [e.clientX, e.clientY]; setSnapPrev(null);
    setDraft({ id: uid(), t, x: p[0], y: p[1], x2: p[0], y2: p[1], pts: isFree ? [p] : undefined, ...(sketch && !isFree && t !== "axes" && t !== "plot" && t !== "cube" ? { sk: 1.1 } : {}), c: t === "hl" && color === "auto" ? "#facc15" : color, w: t === "hl" ? width * 5 : width });
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
    if (d.mode === "marquee") { setMarq((m) => (m ? { ...m, x2: p[0], y2: p[1] } : m)); return; }
    if (d.mode === "scale" && d.box) {
      const bx = d.box, k = Math.max(0.15, Math.max((p[0] - bx.x) / (bx.w || 1), (p[1] - bx.y) / (bx.h || 1)));
      d.moved = true; setEls(d.snap!.map((x) => (d.ids!.includes(x.id) ? scaleEl(x, bx.x, bx.y, k) : x))); return;
    }
    if (d.mode === "move" && selRef.current.length) {
      d.moved = true;
      const dx = p[0] - d.last[0], dy = p[1] - d.last[1]; d.last = p;
      const ids = selRef.current;
      setEls((cur) => cur.map((x) => (ids.includes(x.id) ? moveEl(x, dx, dy) : x)));
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
    if (d.mode === "marquee") {
      const m = marq; setMarq(null); if (!m) return;
      const x0 = Math.min(m.x, m.x2), x1 = Math.max(m.x, m.x2), y0 = Math.min(m.y, m.y2), y1 = Math.max(m.y, m.y2);
      if (x1 - x0 < 4 && y1 - y0 < 4) return;
      const inside = elsRef.current.filter((x) => { const q = bbox(x); return q.x >= x0 && q.y >= y0 && q.x + q.w <= x1 && q.y + q.h <= y1; }).map((x) => x.id);
      setSelIds((cur) => [...new Set([...cur, ...withGroups(inside)])]);
      return;
    }
    if (d.mode === "erase" || d.mode === "move" || d.mode === "scale") {
      if (d.mode === "erase" ? elsRef.current.length !== d.snap!.length : d.moved) { past.current.push(d.snap!); future.current = []; onChange(elsRef.current); }
      else if (d.mode === "move" && d.editOnUp) { const t = elsRef.current.find((x) => x.id === d.editOnUp); if (t) setTimeout(() => editText(t), 0); }
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
    if (tool !== "select" && tool !== "text") return;
    // double-click empty space or inside a box/cell to type there; on text to edit it
    if (!el || (el.t !== "text" && el.t !== "plot")) { const p = toWorld(e.clientX, e.clientY); setTimeout(() => startText(p, "", el), 0); return; }
    if (el.t === "text") { editText(el); return; }
    if (el.t === "plot") {
      const ex = window.prompt("Edit function(s):", el.expr);
      if (ex) { try { parsePlotShort(ex); commit(els.map((x) => (x.id === el.id ? { ...x, expr: ex } : x))); } catch (err) { alert("Invalid: " + (err as Error).message); } }
    }
  };

  const centre = (): Pt => { const r = svgRef.current!.getBoundingClientRect(); return [(r.width / 2 - view.x) / view.k, (r.height / 2 - view.y) / view.k]; };
  const newTextStyle = () => ({ fs: 14 + width * 2, font: sketch ? ("hand" as const) : undefined, c: color });
  const firstText = (ids: string[]) => elsRef.current.filter((x) => ids.includes(x.id) && x.t === "text").sort((a, b) => a.y - b.y || a.x - b.x)[0] ?? null;
  const editText = (el: El, append = "") => {
    setSelIds([el.id]);
    setTextBox({ id: el.id, x: el.x, y: el.y, value: (el.text || "") + append, fs: el.fs || 20, font: el.font, bold: el.bold, c: el.c, rot: el.rot, rc: el.rc });
  };
  // new text at a point; inside a template it joins the template and copies its lettering
  const startText = (p: Pt, init = "", inside?: El | null) => {
    let st: { fs: number; font?: El["font"]; c: string; bold?: boolean } = newTextStyle(); let extra: Partial<El> = {};
    if (inside?.g) {
      const sib = elsRef.current.filter((x) => x.g === inside.g && x.t === "text" && !x.bold && (x.fs ?? 16) <= 20)[0];
      if (sib) st = { fs: sib.fs ?? 16, font: sib.font, c: sib.c };
      else if (inside.sk) st = { ...st, fs: 16, font: "hand" };
      extra = { g: inside.g, rot: inside.rot, rc: inside.rc };
    }
    setTextBox({ x: p[0], y: p[1] + st.fs * 0.35, value: init, ...st, ...extra } as NonNullable<typeof textBox>);
  };
  const pasteEls = (src: El[]) => {
    const gm = new Map<string, string>();
    const copies = src.map((x) => moveEl({ ...x, id: uid(), g: x.g ? gm.get(x.g) ?? (gm.set(x.g, uid()), gm.get(x.g)) : undefined }, 24, 24));
    commit([...elsRef.current, ...copies]); setSelIds(copies.map((x) => x.id)); setTool("select");
    if (clip.current) clip.current = { ...clip.current, els: copies };
  };
  const restyleText = (f: (t: El) => Partial<El>) => commit(els.map((x) => (selIds.includes(x.id) && x.t === "text" ? { ...x, ...f(x) } : x)));

  const commitText = () => {
    const tb = textBox; setTextBox(null);
    if (!tb) return;
    const cur = elsRef.current;
    if (tb.id) {
      const old = cur.find((x) => x.id === tb.id);
      if (old && old.text === tb.value) return;
      commit(tb.value.trim() ? cur.map((x) => (x.id === tb.id ? { ...x, text: tb.value } : x)) : cur.filter((x) => x.id !== tb.id));
    } else if (tb.value.trim()) {
      const el: El = { id: uid(), t: "text", x: tb.x, y: tb.y, c: tb.c, w: 1, text: tb.value, fs: tb.fs, font: tb.font, bold: tb.bold, g: tb.g, rot: tb.rot, rc: tb.rc };
      commit([...cur, el]); setSelIds([el.id]);
    }
  };

  const exportSvg = () => {
    const all = els.map(bbox);
    if (!all.length) return null;
    const x = Math.min(...all.map((b) => b.x)) - 24, y = Math.min(...all.map((b) => b.y)) - 24;
    const w = Math.max(...all.map((b) => b.x + b.w)) + 24 - x, h = Math.max(...all.map((b) => b.y + b.h)) + 24 - y;
    const cs = getComputedStyle(document.documentElement);
    const fg = cs.getPropertyValue("--text").trim() || "#111", bg = cs.getPropertyValue("--bg").trim() || "#fff";
    const acc = cs.getPropertyValue("--accent").trim() || "#2b59c3", raised = cs.getPropertyValue("--raised").trim() || bg;
    const inner = worldRef.current!.innerHTML.replaceAll("var(--accent)", acc).replaceAll("var(--raised)", raised);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" color="${fg}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/>${inner}</svg>`;
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
  const cursor = tool === "hand" || space.current ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";
  const btn = "btn icon-btn ghost cbtn";
  const delSel = () => { if (selIds.length) { commit(els.filter((x) => !selIds.includes(x.id))); setSel(null); } };
  const selEls = els.filter((x) => selIds.includes(x.id));
  const oneGroup = selEls.length > 0 && !!selEls[0].g && selEls.every((x) => x.g === selEls[0].g);
  const applyStyle = (on: boolean) => { setSketch(on); if (selEls.length) commit(els.map((x) => selIds.includes(x.id) ? (x.t === "text" ? { ...x, font: on ? x.font ?? "hand" : x.font === "hand" ? undefined : x.font } : ["rect", "ellipse", "diamond", "triangle", "poly", "line", "arrow"].includes(x.t) ? { ...x, sk: on ? x.sk || 1.1 : undefined } : x) : x)); };

  // templates: build each once for the thumbnails
  const built = useMemo(() => STAMPS.map((st) => ({ ...st, els: st.build() })), []);
  const cats = [...custom.cats, ...CATEGORIES];
  const shown = [
    ...custom.list.filter((t) => t.kind === "block" && t.cat === cat).map((t) => ({ key: t.id, name: t.name, els: t.els, mine: t.id })),
    ...built.map((st, i) => ({ key: "b" + i, name: st.name, els: st.els, cat: st.cat, i })).filter((x) => x.cat === cat).map((x) => ({ key: x.key, name: x.name, els: x.els, mine: undefined as string | undefined, i: x.i })),
  ];
  const insertStamp = (fresh: El[]) => {
    const r = svgRef.current!.getBoundingClientRect();
    const g = uid();
    const at0 = placeStamp(fresh, 0, 0).map((e) => ({ ...e, id: uid(), g }));
    const bs = at0.map(bbox), w = Math.max(...bs.map((q) => q.x + q.w)), h = Math.max(...bs.map((q) => q.y + q.h));
    const cx = (r.width / 2 - view.x) / view.k, cy = (r.height / 2 - view.y) / view.k;
    // find a free spot: start in the middle of the view, then step down past anything already there
    const taken = els.map(bbox), hit = (x: number, y: number) => taken.some((q) => x < q.x + q.w + 24 && x + w + 24 > q.x && y < q.y + q.h + 24 && y + h + 24 > q.y);
    let px = cx - w / 2, py = cy - h / 2;
    for (let i = 0; i < 200 && hit(px, py); i++) py += 24;
    const placed = placeStamp(at0, px, py);
    commit([...els, ...placed]); setSelIds(placed.map((x) => x.id)); setTool("select");
    if (py !== cy - h / 2) setView((v) => ({ ...v, y: r.height / 2 - (py + h / 2) * v.k })); // bring it into view
    if (window.innerWidth < 768) setPanel(null);
  };

  return (
    <div ref={rootRef} className="relative h-full w-full select-none overflow-hidden">
      <svg ref={svgRef} className="h-full w-full touch-none" style={{ cursor }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onDouble}>
        <PaperLayer paper={paper} view={view} />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g ref={worldRef}>{els.filter((e) => !snapPrev?.remove.includes(e.id)).map((e) => <g key={e.id} data-id={e.id}><Shape e={e} /></g>)}</g>
          {draft && <Shape e={snapPrev ? snapPrev.el : draft} />}
          {marq && <rect x={Math.min(marq.x, marq.x2)} y={Math.min(marq.y, marq.y2)} width={Math.abs(marq.x2 - marq.x)} height={Math.abs(marq.y2 - marq.y)} fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeDasharray="4 3" strokeWidth={1 / view.k} pointerEvents="none" />}
          {sb && tool === "select" && !textBox && <rect data-handle="se" x={sb.x + sb.w + 6 - 7 / view.k} y={sb.y + sb.h + 6 - 7 / view.k} width={14 / view.k} height={14 / view.k} rx={3 / view.k} fill="var(--raised)" stroke="var(--accent)" strokeWidth={2 / view.k} style={{ cursor: "nwse-resize" }} />}
          {sb && <rect x={sb.x - 6} y={sb.y - 6} width={sb.w + 12} height={sb.h + 12} fill="none" stroke="var(--accent)" strokeDasharray="5 4" strokeWidth={1.5 / view.k} pointerEvents="none" />}
        </g>
      </svg>

      {textBox && (() => {
        const lines = textBox.value.split("\n"), longest = Math.max(4, ...lines.map((l) => l.length));
        const fam = textBox.font ? ({ hand: "Kalam,cursive", script: "Caveat,cursive", mono: "'JetBrains Mono',monospace" } as const)[textBox.font] : "'Hanken Grotesk',ui-sans-serif,sans-serif";
        const left = textBox.x * view.k + view.x, top = (textBox.y - textBox.fs * 0.95) * view.k + view.y;
        const col = textBox.c === "auto" ? "var(--text)" : textBox.c === "accent" ? "var(--accent)" : textBox.c;
        return (
          <textarea autoFocus className="text-edit" aria-label="Text" spellCheck
            style={{ left, top, fontSize: textBox.fs * view.k, fontFamily: fam, fontWeight: textBox.bold ? 700 : 400, color: col, width: `calc(${longest + 2}ch)`, height: `${lines.length * 1.3 + 0.25}em`,
              transform: textBox.rot ? `rotate(${textBox.rot}deg)` : undefined, transformOrigin: "0 0" }}
            placeholder="Type here" value={textBox.value}
            onFocus={(e) => { const n = e.target.value.length; e.target.setSelectionRange(n, n); }}
            onChange={(e) => setTextBox({ ...textBox, value: e.target.value })} onBlur={commitText}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); (e.target as HTMLElement).blur(); } }} />
        );
      })()}

      <div className="dock" role="toolbar" aria-label="Drawing tools">
        <div className="dock-group">
          {TOOLS.map(([t, icon, tip]) => (
            <button key={t} title={tip} aria-label={tip} aria-pressed={tool === t} className={`${btn} ${tool === t ? "on" : ""}`} onClick={() => setTool(t)}><Icon name={icon} /></button>
          ))}
        </div>
        <div className="dock-group">
          {COLORS.map((c) => (
            <button key={c} title={c === "auto" ? "Ink (follows theme)" : c} aria-label={`Colour ${c}`} aria-pressed={color === c}
              onClick={() => { setColor(c); if (selEl) commit(els.map((x) => (selIds.includes(x.id) ? { ...x, c } : x))); }}
              className={`cdot ${color === c ? "on" : ""}`} style={{ background: c === "auto" ? "var(--text)" : c }} />
          ))}
          <input type="range" min={1} max={12} value={width} className="range w-16" title="Stroke width (also applies to the selection)" aria-label="Stroke width"
            onChange={(e) => { const v = +e.target.value; setWidth(v); if (selEl && selEl.t !== "plot") setEls((cur) => cur.map((x) => (selIds.includes(x.id) && x.t !== "plot" && !(x.g && x.t === "text") ? (x.t === "text" ? { ...x, fs: 16 + v * 2 } : { ...x, w: x.t === "hl" ? v * 5 : v }) : x))); }}
            onPointerUp={() => { if (selEl && selEl.t !== "plot") { past.current.push(widthSnap.current ?? els); future.current = []; onChange(elsRef.current); } }}
            onPointerDown={() => { widthSnap.current = elsRef.current; }} />
        </div>
        <div className="dock-group">
          <button className={btn} title="Undo (⌘Z)" aria-label="Undo" onClick={undo}><Icon name="undo" /></button>
          <button className={btn} title="Redo (⇧⌘Z)" aria-label="Redo" onClick={redo}><Icon name="redo" /></button>
          {sel && <button className={btn} title="Delete selection" aria-label="Delete selection" onClick={delSel}><Icon name="trash" /></button>}
          {oneGroup && <button className={btn} title="Ungroup: edit the template's parts one by one" aria-label="Ungroup" onClick={() => commit(els.map((x) => (selIds.includes(x.id) ? { ...x, g: undefined } : x)))}><Icon name="ungroup" /></button>}
          {selEls.some((x) => x.t === "text") && <>
            <button className={btn} title="Smaller text" aria-label="Smaller text" onClick={() => restyleText((t) => ({ fs: Math.max(8, (t.fs || 20) - 2) }))}><span className="txt-ico">A−</span></button>
            <button className={btn} title="Bigger text" aria-label="Bigger text" onClick={() => restyleText((t) => ({ fs: (t.fs || 20) + 2 }))}><span className="txt-ico">A+</span></button>
            <button className={btn} title="Bold" aria-label="Bold" onClick={() => { const on = !selEls.filter((x) => x.t === "text").every((x) => x.bold); restyleText(() => ({ bold: on || undefined })); }}><span className="txt-ico font-bold">B</span></button>
          </>}
          {selEls.length > 1 && !oneGroup && <button className={btn} title="Group: move these together" aria-label="Group" onClick={() => { const g = uid(); commit(els.map((x) => (selIds.includes(x.id) ? { ...x, g } : x))); }}><Icon name="template" /></button>}
        </div>
        <div className="dock-group">
          <div className="seg" role="radiogroup" aria-label="Drawing style" title="Style for new shapes and text (also restyles the selection)">
            <button role="radio" aria-checked={!sketch} className={!sketch ? "on" : ""} onClick={() => applyStyle(false)}>Clean</button>
            <button role="radio" aria-checked={sketch} className={`sketch-label ${sketch ? "on" : ""}`} onClick={() => applyStyle(true)}>Sketch</button>
          </div>
        </div>
        <div className="dock-group dock-main">
          <button className={`btn ${panel === "save" ? "btn-primary" : ""}`} title={selIds.length ? "Save the selection as a template" : "Save this page as a page template"} onClick={() => setPanel(panel === "save" ? null : "save")}><Icon name="plus" /> Save as template</button>
          <button className={`btn ${panel === "templates" ? "btn-primary" : ""}`} aria-expanded={panel === "templates"} onClick={() => setPanel(panel === "templates" ? null : "templates")}><Icon name="template" /> Templates</button>
          {onPaper && <button className={`btn ${panel === "paper" ? "btn-primary" : ""}`} aria-expanded={panel === "paper"} onClick={() => setPanel(panel === "paper" ? null : "paper")}><Icon name="paper" /> Paper</button>}
          <button className={`${btn} ${panel === "more" ? "on" : ""}`} title="More options" aria-label="More options" aria-expanded={panel === "more"} onClick={() => setPanel(panel === "more" ? null : "more")}><Icon name="more" /></button>
        </div>
      </div>

      <div className="zoom-pill">
        <button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Icon name="minus" /></button>
        <button title="Reset view" onClick={() => setView({ x: 0, y: 0, k: 1 })}>{Math.round(view.k * 100)}%</button>
        <button aria-label="Zoom in" onClick={() => zoomBy(1.25)}><Icon name="plus" /></button>
      </div>

      {panel === "more" && (
        <div className="pop more-pop">
          <label className="pop-row" title="Higher = smoother lines for a shaky mouse or trackpad"><span>Smoothing</span><input type="range" className="range w-24" min={0} max={9} value={smooth} onChange={(e) => setSmooth(+e.target.value)} /></label>
          <label className="pop-row"><span>Snap shapes to grid</span><input type="checkbox" checked={snapGrid} onChange={() => setSnapGrid((v) => !v)} /></label>
          <label className="pop-row" title="Fingers pan and zoom, only a stylus draws. Turns on by itself when a stylus is used."><span>Stylus only</span><input type="checkbox" checked={penOnly} onChange={() => setPenOnly((v) => !v)} /></label>
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="btn" onClick={() => doExport("png")}><Icon name="download" /> PNG</button>
            <button className="btn" onClick={() => doExport("svg")}><Icon name="download" /> SVG</button>
            <button className="btn btn-danger" onClick={() => confirm("Clear the whole page?") && commit([])}>Clear page</button>
          </div>
        </div>
      )}

      {panel === "paper" && onPaper && (
        <div className="pop paper-pop">
          <div className="pop-head"><b>Paper</b><button className="btn icon-btn ghost" aria-label="Close" onClick={() => setPanel(null)}><Icon name="close" /></button></div>
          <PaperPicker value={paper} onPick={(p) => onPaper(p)} />
        </div>
      )}

      {panel === "templates" && (
        <aside className="stamp-panel" aria-label="Templates">
          <div className="pop-head"><b>Templates</b><button className="btn icon-btn ghost" aria-label="Close templates" onClick={() => setPanel(null)}><Icon name="close" /></button></div>
          <div className="stamp-cats">
            {cats.map((c) => <button key={c} className={`chip-btn ${cat === c ? "on" : ""} ${custom.cats.includes(c) ? "mine" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="stamp-grid">
            {shown.map((st) => (
              <div key={st.key} className="stamp-wrap">
                <button className="stamp" onClick={() => insertStamp(st.mine ? st.els : STAMPS[(st as { i: number }).i].build())} title={`Insert ${st.name}`}>
                  <StampThumb els={st.els} />
                  <span>{st.name}</span>
                </button>
                {st.mine && <button className="stamp-del" aria-label={`Delete template ${st.name}`} title="Delete this template" onClick={() => confirm(`Delete the template "${st.name}"?`) && custom.remove(st.mine!)}><Icon name="close" /></button>}
              </div>
            ))}
            {shown.length === 0 && <p className="muted col-span-2 text-sm">No templates here yet.</p>}
          </div>
          <div className="stamp-foot">
            <span className="flex-1">Tap to drop it on the page. Double-click any text to change it, or inside a box or cell to type there. Drag the corner handle to resize.</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn flex-1" onClick={() => setPanel("save")}><Icon name="plus" /> New template</button>
            <button className="btn" title="Download your templates as a file" disabled={!custom.list.length} onClick={custom.exportFile}><Icon name="download" /></button>
            <label className="btn cursor-pointer" title="Add templates from a file">Import<input type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) custom.importFile(f).then((n) => alert(n ? `Added ${n} template(s).` : "No templates found in that file.")); e.target.value = ""; }} /></label>
          </div>
        </aside>
      )}

      {panel === "save" && (
        <SaveTemplate count={selEls.length} defaultCat={custom.cats[0] ?? "My templates"} cats={custom.cats}
          onCancel={() => setPanel(null)}
          onSave={(name, category, whole) => {
            const src = whole ? els : selEls;
            if (!src.length) { alert("This page is empty. Draw something or add a template first."); return; }
            const norm = placeStamp(src.map((x) => ({ ...x, g: undefined })), 0, 0);
            custom.add({ name, cat: category, kind: whole ? "page" : "block", paper: whole ? paper : undefined, els: norm });
            setPanel("templates"); if (!whole) setCat(category);
          }} />
      )}
    </div>
  );
}

export function StampThumb({ els }: { els: El[] }) {
  const bs = els.map(bbox);
  const x = Math.min(...bs.map((q) => q.x)) - 8, y = Math.min(...bs.map((q) => q.y)) - 8;
  const w = Math.max(...bs.map((q) => q.x + q.w)) + 8 - x, h = Math.max(...bs.map((q) => q.y + q.h)) + 8 - y;
  return <svg viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">{els.map((e) => <Shape key={e.id} e={e} />)}</svg>;
}

function SaveTemplate({ count, cats, defaultCat, onSave, onCancel }: { count: number; cats: string[]; defaultCat: string; onSave: (name: string, cat: string, whole: boolean) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState(defaultCat);
  const [whole, setWhole] = useState(count === 0);
  return (
    <form className="pop save-pop" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSave(name.trim(), cat.trim() || "My templates", whole); }}>
      <div className="pop-head"><b>Save as template</b><button type="button" className="btn icon-btn ghost" aria-label="Close" onClick={onCancel}><Icon name="close" /></button></div>
      <div className="seg mb-3 w-full" role="radiogroup" aria-label="What to save">
        <button type="button" role="radio" aria-checked={!whole} disabled={!count} className={`flex-1 justify-center ${!whole ? "on" : ""}`} onClick={() => setWhole(false)}>Selection ({count})</button>
        <button type="button" role="radio" aria-checked={whole} className={`flex-1 justify-center ${whole ? "on" : ""}`} onClick={() => setWhole(true)}>Whole page</button>
      </div>
      <p className="muted mb-3 text-xs leading-relaxed">{whole ? "Saves everything on this page, with its paper, as a layout you can start new pages from." : "Saves the selected items as a block you can drop onto any page. Tip: drag a box with the select tool to pick several items."}</p>
      <label className="field-label">Name<input autoFocus className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={whole ? "Lecture notes layout" : "Bug table"} /></label>
      {!whole && <label className="field-label mt-2">Category
        <input className="field" list="tpl-cats" value={cat} onChange={(e) => setCat(e.target.value)} />
        <datalist id="tpl-cats">{["My templates", ...cats].filter((c, i, a) => a.indexOf(c) === i).map((c) => <option key={c} value={c} />)}</datalist>
      </label>}
      <div className="mt-3 flex justify-end gap-2"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={!name.trim()}>Save template</button></div>
    </form>
  );
}
