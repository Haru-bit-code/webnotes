// Hand-drawn "study sheet" building blocks: wobbly boxes, handwriting, sticky notes,
// numbered tables, tick matrices, swimlanes, stick figures. Used by the Sketch templates
// and the full-page layouts.
import { El, ElType, Pt } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export const INK = "#1f2937";
export const COL = {
  red: "#dc2626", blue: "#1d4ed8", green: "#15803d", orange: "#f59e0b", grey: "#64748b",
  yellow: "#fdf0a6", yellowHead: "#fcd34d", mint: "#d5f2de", pink: "#fdd6de", sky: "#d6e8fb", peach: "#fde3c4", stone: "#e5e7eb",
};

type TextOpt = { fs?: number; c?: string; bold?: boolean; font?: El["font"] | "ui" };

export function sketch() {
  const els: El[] = [];
  const push = (t: ElType, o: Partial<El>) => { const e = { id: uid(), t, x: 0, y: 0, c: "auto", w: 1.6, ...o } as El; els.push(e); return e; };
  const text = (x: number, y: number, s: string, o: TextOpt = {}) =>
    push("text", { x, y, text: s, fs: o.fs ?? 16, c: o.c ?? "auto", bold: o.bold, w: 1, font: o.font === "ui" ? undefined : o.font ?? "hand" });

  const api = {
    els,
    text,
    box: (x: number, y: number, w: number, h: number, o: Partial<El> = {}) => push("rect", { x, y, x2: x + w, y2: y + h, sk: 1, w: 1.8, ...o }),
    ellipse: (x: number, y: number, w: number, h: number, o: Partial<El> = {}) => push("ellipse", { x, y, x2: x + w, y2: y + h, sk: 0.8, ...o }),
    line: (x: number, y: number, x2: number, y2: number, o: Partial<El> = {}) => push("line", { x, y, x2, y2, sk: 0.7, ...o }),
    arrow: (x: number, y: number, x2: number, y2: number, o: Partial<El> = {}) => push("arrow", { x, y, x2, y2, sk: 0.9, w: 1.8, ...o }),
    pen: (pts: Pt[], o: Partial<El> = {}) => push("pen", { pts, ...o }),
    title: (x: number, y: number, s: string, fs = 46) => text(x, y, s, { fs, bold: true }),
    script: (x: number, y: number, s: string, c = "auto", fs = 30) => text(x, y, s, { fs, c, bold: true, font: "script" }),
    wavy: (x: number, y: number, w: number, c = COL.red) => {
      const pts: Pt[] = []; for (let i = 0; i <= w; i += 6) pts.push([x + i, y + Math.sin(i / 9) * 2.2 - i * 0.012]);
      return push("pen", { pts, c, w: 2.6 });
    },
    /** sticky note: pastel square with shadow, slightly turned */
    sticky: (x: number, y: number, w: number, h: number, fill: string, heading: string, body: string[] = [], rot = -1.2) => {
      const rc: Pt = [x + w / 2, y + h / 2];
      push("rect", { x, y, x2: x + w, y2: y + h, fill, c: fill, w: 0.5, shadow: true, rot, rc });
      if (heading) push("text", { x: x + 16, y: y + 36, text: heading, fs: 26, c: INK, bold: true, font: "script", w: 1, rot, rc });
      body.forEach((l, i) => push("text", { x: x + 16, y: y + (heading ? 64 : 34) + i * 24, text: l, fs: 15, c: INK, font: "hand", w: 1, rot, rc }));
    },
    /** heading box: hand-drawn border with a script title */
    section: (x: number, y: number, w: number, h: number, heading: string, c = "auto") => {
      push("rect", { x, y, x2: x + w, y2: y + h, sk: 1.1, w: 2 });
      if (heading) text(x + 18, y + 42, heading, { fs: 32, c, bold: true, font: "script" });
    },
    card: (x: number, y: number, w: number, h: number, fill: string, label: string, o: TextOpt = {}) => {
      push("rect", { x, y, x2: x + w, y2: y + h, fill, c: fill, w: 0.5, sk: 0.5 });
      label.split("\n").forEach((l, i) => text(x + 10, y + 22 + i * 18, l, { fs: o.fs ?? 14, c: INK, bold: o.bold }));
    },
    bullets: (x: number, y: number, items: string[], gap = 30, mark = "✱", c = COL.orange) => {
      items.forEach((it, i) => { text(x, y + i * gap, mark, { fs: 16, c, font: "ui" }); text(x + 22, y + i * gap, it, { fs: 16 }); });
    },
    /** numbered table like "Errors we found" */
    numbered: (x: number, y: number, w: number, rows: string[], start = 1, rh = 44, c = "auto") => {
      const H = rows.length * rh;
      push("rect", { x, y, x2: x + w, y2: y + H, w: 2.4, sk: 0.4 });
      push("line", { x: x + 62, y, x2: x + 62, y2: y + H, w: 2.2, sk: 0.4 });
      rows.forEach((r, i) => {
        const ry = y + i * rh;
        if (i) push("line", { x, y: ry, x2: x + w, y2: ry, w: 2.2, sk: 0.4 });
        push("ellipse", { x: x + 18, y: ry + rh / 2 - 13, x2: x + 44, y2: ry + rh / 2 + 13, sk: 0.7, w: 1.6 });
        const n = String(start + i); text(x + 31 - n.length * 4.2, ry + rh / 2 + 6, n, { fs: 15 });
        if (r) r.split("\n").forEach((l, j) => text(x + 74, ry + 27 + j * 20, l, { fs: 15, c }));
      });
    },
    /** table with a yellow header row and ✔ / ✘ cells */
    matrix: (x: number, y: number, cols: string[], widths: number[], rows: (string | boolean)[][], rh = 34) => {
      const W = widths.reduce((a, b) => a + b, 0), H = (rows.length + 1) * rh;
      push("rect", { x, y, x2: x + W, y2: y + rh, fill: COL.yellowHead, c: COL.yellowHead, w: 0.5 });
      push("rect", { x, y, x2: x + W, y2: y + H, w: 2.2, sk: 0.4 });
      let cx = x;
      widths.forEach((cw, i) => {
        if (i) push("line", { x: cx, y, x2: cx, y2: y + H, w: 1.4, sk: 0.4 });
        text(cx + 10, y + rh - 10, cols[i], { fs: 19, bold: true, font: "script", c: INK });
        cx += cw;
      });
      rows.forEach((row, r) => {
        const ry = y + (r + 1) * rh;
        push("line", { x, y: ry, x2: x + W, y2: ry, w: r === 0 ? 2 : 1.2, sk: 0.4 });
        let colX = x;
        row.forEach((v, i) => {
          if (typeof v === "boolean") text(colX + widths[i] / 2 - 7, ry + rh - 10, v ? "✔" : "✘", { fs: 17, c: v ? COL.green : COL.red, font: "ui" });
          else if (v) text(colX + 10, ry + rh - 11, v, { fs: 14 });
          colX += widths[i];
        });
      });
    },
    stickman: (x: number, y: number, label: string, c = "auto") => {
      push("ellipse", { x: x - 11, y: y - 11, x2: x + 11, y2: y + 11, sk: 1, w: 2.2 });
      push("pen", { pts: [[x, y + 11], [x - 1, y + 42], [x + 1, y + 70]], w: 2.4 });
      push("pen", { pts: [[x - 22, y + 30], [x, y + 24], [x + 22, y + 34]], w: 2.4 });
      push("pen", { pts: [[x - 18, y + 106], [x + 1, y + 70], [x + 20, y + 106]], w: 2.4 });
      text(x - label.length * 7, y + 142, label, { fs: 30, c, bold: true, font: "script" });
    },
    lane: (x: number, y: number, w: number, h: number, label: string, c = "auto") => {
      push("rect", { x, y, x2: x + w, y2: y + h, dash: true, sk: 0.6, w: 1.4 });
      text(x + 12, y + 28, label, { fs: 26, c, bold: true, font: "script" });
    },
    code: (x: number, y: number, w: number, heading: string, lines: string[]) => {
      const h = 60 + lines.length * 20;
      push("rect", { x, y, x2: x + w, y2: y + h, sk: 1, w: 1.8 });
      text(x + 16, y + 34, heading, { fs: 26, bold: true, font: "script" });
      lines.forEach((l, i) => text(x + 16, y + 62 + i * 20, l, { fs: 12.5, font: "mono" }));
    },
    done(grouped = true) { const g = uid(); return grouped ? els.map((e) => ({ ...e, g })) : els; },
  };
  return api;
}
