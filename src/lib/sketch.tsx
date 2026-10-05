import { renderToStaticMarkup } from "react-dom/server";
import { Shape, bbox } from "@/components/Canvas";
import { Note } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Static SVG of a canvas note, for embedding in markdown.
export function sketchHtml(ref: string, notes: Note[]): string {
  const key = ref.trim();
  const n = notes.find((x) => x.kind === "canvas" && (x.id === key || x.title.trim().toLowerCase() === key.toLowerCase()));
  if (!n) return `<div class="blk-err">sketch not found: ${esc(key)}</div>`;
  const els = n.drawing ?? [];
  const head = `<div class="blk sketch" data-sketch-id="${n.id}" title="Click to open this sketch"><div class="sketch-cap">🎨 ${esc(n.title || "Untitled sketch")} <span>— click to edit</span></div>`;
  if (!els.length) return head + `<div class="muted" style="padding:24px;text-align:center">Empty sketch</div></div>`;
  const bs = els.map(bbox);
  const x = Math.min(...bs.map((b) => b.x)) - 16, y = Math.min(...bs.map((b) => b.y)) - 16;
  const w = Math.max(...bs.map((b) => b.x + b.w)) + 16 - x, h = Math.max(...bs.map((b) => b.y + b.h)) + 16 - y;
  const inner = renderToStaticMarkup(<>{els.map((e) => <g key={e.id}><Shape e={e} /></g>)}</>);
  return head + `<svg viewBox="${x} ${y} ${w} ${h}" style="width:100%;max-height:480px">${inner}</svg></div>`;
}
