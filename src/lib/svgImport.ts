"use client";
// Turns a simple SVG (rect, line, circle, ellipse, path, polyline, polygon, text) into canvas items,
// so the text stays editable and the shapes stay movable. Used for the bundled template kits
// and for "Import SVG". Anything else in the file is skipped.
import { El, Pt } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: string | null, d = 0) => { const n = parseFloat(v ?? ""); return Number.isFinite(n) ? n : d; };

type Opts = { lock?: boolean; group?: boolean; scale?: number };

export function svgToEls(svgText: string, opts: Opts = {}): El[] {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("That file isn't a readable SVG.");
  // a hidden SVG to measure path bounds
  const ns = "http://www.w3.org/2000/svg";
  const probe = document.createElementNS(ns, "svg");
  probe.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden");
  document.body.appendChild(probe);
  const k = opts.scale ?? 1, g = opts.group ? uid() : undefined;
  const out: El[] = [];
  const paint = (el: Element, key: "fill" | "stroke") => {
    const v = el.getAttribute(key) ?? (el.getAttribute("style") ?? "").match(new RegExp(`${key}:\\s*([^;]+)`))?.[1]?.trim() ?? null;
    return !v || v === "none" || v === "transparent" ? undefined : v;
  };
  const base = (el: Element): Partial<El> => {
    const op = num(el.getAttribute("opacity"), 1) * num(el.getAttribute("fill-opacity"), 1);
    return { id: uid(), g, ...(opts.lock ? { lock: true } : {}), ...(op < 1 ? { op } : {}) };
  };
  try {
    root.querySelectorAll("rect,line,circle,ellipse,path,polyline,polygon,text").forEach((el) => {
      if (el.closest("defs,clipPath,mask,pattern,symbol")) return;
      const tag = el.nodeName.toLowerCase();
      const stroke = paint(el, "stroke"), fill = paint(el, "fill");
      const sw = stroke ? num(el.getAttribute("stroke-width"), 1) * k : 0;
      switch (tag) {
        case "rect": {
          const x = num(el.getAttribute("x")) * k, y = num(el.getAttribute("y")) * k, w = num(el.getAttribute("width")) * k, h = num(el.getAttribute("height")) * k;
          if (!w || !h) return;
          out.push({ ...base(el), t: "rect", x, y, x2: x + w, y2: y + h, c: stroke ?? fill ?? "#000", w: sw, fill, rx: num(el.getAttribute("rx"), 0) * k } as El);
          break;
        }
        case "line":
          if (!stroke) return;
          out.push({ ...base(el), t: "line", x: num(el.getAttribute("x1")) * k, y: num(el.getAttribute("y1")) * k, x2: num(el.getAttribute("x2")) * k, y2: num(el.getAttribute("y2")) * k, c: stroke, w: sw } as El);
          break;
        case "circle": case "ellipse": {
          const cx = num(el.getAttribute("cx")) * k, cy = num(el.getAttribute("cy")) * k;
          const rx = (tag === "circle" ? num(el.getAttribute("r")) : num(el.getAttribute("rx"))) * k, ry = (tag === "circle" ? num(el.getAttribute("r")) : num(el.getAttribute("ry"))) * k;
          if (!rx || !ry) return;
          out.push({ ...base(el), t: "ellipse", x: cx - rx, y: cy - ry, x2: cx + rx, y2: cy + ry, c: stroke ?? fill ?? "#000", w: sw, fill } as El);
          break;
        }
        case "polyline": case "polygon": {
          const nums = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
          const pts: Pt[] = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] * k, nums[i + 1] * k]);
          if (pts.length < 2) return;
          const d = "M" + pts.map((p) => p.join(" ")).join("L") + (tag === "polygon" ? "Z" : "");
          pushPath(el, d, stroke, fill, sw, false);
          break;
        }
        case "path": pushPath(el, el.getAttribute("d") ?? "", stroke, fill, sw, true); break;
        case "text": {
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim(); if (!text) return;
          const fs = num(el.getAttribute("font-size"), 16) * k;
          const fam = (el.getAttribute("font-family") ?? "").toLowerCase();
          const weight = el.getAttribute("font-weight") ?? "";
          let x = num(el.getAttribute("x")) * k; const anchor = el.getAttribute("text-anchor");
          if (anchor === "middle" || anchor === "end") { const w = text.length * fs * 0.56; x -= anchor === "middle" ? w / 2 : w; }
          out.push({ ...base(el), lock: undefined, ...(opts.lock ? { tl: 1 as const } : {}), t: "text", x, y: num(el.getAttribute("y")) * k, text, fs, c: fill ?? "#1f2937", w: 1,
            bold: weight === "bold" || num(weight, 400) >= 600 || undefined,
            font: /mono|courier/.test(fam) ? "mono" : /comic|hand|cursive|marker/.test(fam) ? "hand" : undefined } as El);
          break;
        }
      }
    });
  } finally { probe.remove(); }
  return out;

  function pushPath(el: Element, d: string, stroke: string | undefined, fill: string | undefined, sw: number, raw: boolean) {
    if (!d || (!stroke && !fill)) return;
    const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); probe.appendChild(p);
    let bb: DOMRect; try { bb = p.getBBox(); } catch { return; } finally { p.remove(); }
    const sx = raw ? k : 1;
    const ob: [number, number, number, number] = [bb.x, bb.y, Math.max(bb.width, 0.01), Math.max(bb.height, 0.01)];
    out.push({ ...base(el), t: "path", d, ob, x: bb.x * sx, y: bb.y * sx, x2: (bb.x + ob[2]) * sx, y2: (bb.y + ob[3]) * sx, c: stroke ?? fill ?? "#000", w: sw, fill,
      ...(el.getAttribute("stroke-linecap") === "round" ? {} : {}) } as El);
  }
}

export async function loadSvg(src: string, opts: Opts = {}) {
  const r = await fetch(src); if (!r.ok) throw new Error(`Couldn't load ${src}`);
  return svgToEls(await r.text(), opts);
}
