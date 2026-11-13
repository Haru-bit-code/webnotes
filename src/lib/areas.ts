// Writing areas of a template: the cells, boxes, slots and tick boxes you can type into directly.
// A template is a set of ordinary shapes (a locked page background, or a dropped-in group). Its straight
// lines and box edges divide it into areas; a tap inside one writes there, sized to fit it.
import { El, Pt } from "./types";

export type Cell = { x: number; y: number; x2: number; y2: number };
type HSeg = { y: number; x1: number; x2: number };
type VSeg = { x: number; y1: number; y2: number };
export type Segs = { hs: HSeg[]; vs: VSeg[] };

const AXIS = 1.5; // a line this close to level/plumb counts as horizontal/vertical

/** text the user wrote into a template area (not one of the template's own labels) */
export const isWritten = (e: El) => e.t === "text" && !!e.wr;
/** a template's own label text */
export const isLabel = (e: El) => e.t === "text" && !e.wr && (!!e.g || !!e.tl);

/** the straight edges of a template: its level/plumb lines and the sides of its boxes */
export function segsOf(els: El[]): Segs {
  const hs: HSeg[] = [], vs: VSeg[] = [];
  for (const e of els) {
    if (e.x2 === undefined || e.y2 === undefined || e.rot) continue;
    if (e.t === "line") {
      if (Math.abs(e.y2 - e.y) < AXIS && Math.abs(e.x2 - e.x) > 8) hs.push({ y: (e.y + e.y2) / 2, x1: Math.min(e.x, e.x2), x2: Math.max(e.x, e.x2) });
      else if (Math.abs(e.x2 - e.x) < AXIS && Math.abs(e.y2 - e.y) > 8) vs.push({ x: (e.x + e.x2) / 2, y1: Math.min(e.y, e.y2), y2: Math.max(e.y, e.y2) });
    } else if (e.t === "rect") {
      const x1 = Math.min(e.x, e.x2), x2 = Math.max(e.x, e.x2), y1 = Math.min(e.y, e.y2), y2 = Math.max(e.y, e.y2);
      if (x2 - x1 < 6 || y2 - y1 < 6) continue;
      hs.push({ y: y1, x1, x2 }, { y: y2, x1, x2 });
      vs.push({ x: x1, y1, y2 }, { x: x2, y1, y2 });
    }
  }
  return { hs, vs };
}

/** the smallest area around a point, bounded by the template's edges on all four sides */
export function cellAt(p: Pt, s: Segs): Cell | null {
  const [px, py] = p, T = 2;
  let up = -Infinity, down = Infinity, left = -Infinity, right = Infinity;
  for (const h of s.hs) {
    if (px < h.x1 - T || px > h.x2 + T) continue;
    if (h.y <= py && h.y > up) up = h.y;
    if (h.y > py && h.y < down) down = h.y;
  }
  for (const v of s.vs) {
    if (py < v.y1 - T || py > v.y2 + T) continue;
    if (v.x <= px && v.x > left) left = v.x;
    if (v.x > px && v.x < right) right = v.x;
  }
  if (![up, down, left, right].every(Number.isFinite)) return null;
  if (right - left < 10 || down - up < 10) return null;
  return { x: left, y: up, x2: right, y2: down };
}

/** a small square: tap it to tick it */
export const isTickBox = (c: Cell) => { const w = c.x2 - c.x, h = c.y2 - c.y; return w <= 34 && h <= 34 && Math.abs(w - h) <= 8; };

/** every writing area of a template, in reading order (top to bottom, then left to right) */
export function cellsOf(s: Segs): Cell[] {
  const xs = [...new Set(s.vs.map((v) => Math.round(v.x)))].sort((a, b) => a - b);
  const ys = [...new Set(s.hs.map((h) => Math.round(h.y)))].sort((a, b) => a - b);
  if (xs.length < 2 || ys.length < 2 || xs.length * ys.length > 40000) return [];
  const all = { x: xs[0], y: ys[0], w: xs.at(-1)! - xs[0], h: ys.at(-1)! - ys[0] };
  const out = new Map<string, Cell>();
  for (let i = 0; i + 1 < ys.length; i++) for (let j = 0; j + 1 < xs.length; j++) {
    const c = cellAt([(xs[j] + xs[j + 1]) / 2, (ys[i] + ys[i + 1]) / 2], s);
    if (!c || isTickBox(c)) continue;
    const w = c.x2 - c.x, h = c.y2 - c.y;
    if (w < 24 || h < 16 || w * h > all.w * all.h * 0.6) continue; // too small to write in, or the whole page
    if (h < 28 && w > h * 12) continue;                               // a thin gap between two boxes
    out.set(`${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.x2)},${Math.round(c.y2)}`, c);
  }
  return [...out.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export const inCell = (c: Cell, p: Pt, slack = 0) => p[0] >= c.x - slack && p[0] <= c.x2 + slack && p[1] >= c.y - slack && p[1] <= c.y2 + slack;
export const sameCell = (a: Cell, b: Cell) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.x2 - b.x2) < 1 && Math.abs(a.y2 - b.y2) < 1;

/**
 * Template text that is a blank to fill in: "…", "Write here…", "Date: ______", "Definition: …".
 * Returns what stays when you start typing ("" or the label before the blank), or null for ordinary text.
 */
export function blankOf(text?: string): string | null {
  if (!text) return null;
  const t = text.replace(/\s+$/, "");
  if (/^[\s.…_\-–☐]*$/.test(t)) return t.startsWith("☐") ? "☐ " : "";
  const m = t.match(/^(.*?)\s*(_{3,}|…|\.{3,})$/s);
  if (!m) return null;
  const before = m[1];
  if (/[:：]$/.test(before) || /^[☐•→\-–*]$/.test(before.trim())) return before.replace(/\s*$/, " ");
  return ""; // a prompt like "Write here…" or "Problem…": replaced by what you write
}
