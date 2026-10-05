import { compileExpr, evalConst } from "./expr";

export const PALETTE = ["#6366f1", "#ef4444", "#22c55e", "#f59e0b", "#06b6d4", "#a855f7", "#ec4899"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
let uid = 0;

function niceTicks(min: number, max: number, n = 5): number[] {
  const span = max - min || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const err = raw / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
const fmt = (v: number) => (v === 0 ? "0" : Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3 ? v.toExponential(1) : String(+v.toPrecision(4)));

type Frame = { l: number; r: number; t: number; b: number };

// Draws grid, ticks, axes, labels. Returns svg markup and mappers.
function frame(w: number, h: number, xr: [number, number], yr: [number, number], opt: { title?: string; xlabel?: string; ylabel?: string; xticks?: number[]; xlabels?: string[] }) {
  const f: Frame = { l: 50, r: 14, t: opt.title ? 28 : 12, b: opt.xlabel ? 40 : 26 };
  if (opt.ylabel) f.l += 12;
  const sx = (v: number) => f.l + ((v - xr[0]) / (xr[1] - xr[0] || 1)) * (w - f.l - f.r);
  const sy = (v: number) => h - f.b - ((v - yr[0]) / (yr[1] - yr[0] || 1)) * (h - f.t - f.b);
  const xt = opt.xticks ?? niceTicks(xr[0], xr[1], Math.max(3, Math.floor(w / 90)));
  const yt = niceTicks(yr[0], yr[1], Math.max(3, Math.floor(h / 55)));
  let s = "";
  xt.forEach((v, i) => {
    s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${f.t}" y2="${h - f.b}" stroke="currentColor" opacity=".12"/>`;
    s += `<text x="${sx(v)}" y="${h - f.b + 14}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".7">${esc(opt.xlabels?.[i] ?? fmt(v))}</text>`;
  });
  yt.forEach((v) => {
    s += `<line x1="${f.l}" x2="${w - f.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="currentColor" opacity=".12"/>`;
    s += `<text x="${f.l - 6}" y="${sy(v) + 3}" text-anchor="end" font-size="10" fill="currentColor" opacity=".7">${fmt(v)}</text>`;
  });
  if (xr[0] < 0 && xr[1] > 0) s += `<line x1="${sx(0)}" x2="${sx(0)}" y1="${f.t}" y2="${h - f.b}" stroke="currentColor" opacity=".5"/>`;
  if (yr[0] < 0 && yr[1] > 0) s += `<line x1="${f.l}" x2="${w - f.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="currentColor" opacity=".5"/>`;
  s += `<rect x="${f.l}" y="${f.t}" width="${w - f.l - f.r}" height="${h - f.t - f.b}" fill="none" stroke="currentColor" opacity=".4"/>`;
  if (opt.title) s += `<text x="${w / 2}" y="17" text-anchor="middle" font-size="13" font-weight="600" fill="currentColor">${esc(opt.title)}</text>`;
  if (opt.xlabel) s += `<text x="${(f.l + w - f.r) / 2}" y="${h - 6}" text-anchor="middle" font-size="11" fill="currentColor">${esc(opt.xlabel)}</text>`;
  if (opt.ylabel) s += `<text transform="translate(12 ${(f.t + h - f.b) / 2}) rotate(-90)" text-anchor="middle" font-size="11" fill="currentColor">${esc(opt.ylabel)}</text>`;
  return { s, sx, sy, f };
}

const legend = (names: string[], x: number, y: number) =>
  names.length < 2 ? "" : names.map((n, i) =>
    `<rect x="${x}" y="${y + i * 14}" width="10" height="3" fill="${PALETTE[i % PALETTE.length]}"/><text x="${x + 14}" y="${y + i * 14 + 4}" font-size="10" fill="currentColor">${esc(n)}</text>`).join("");

const wrap = (inner: string, w: number, h: number) =>
  `<div class="blk"><svg viewBox="0 0 ${w} ${h}" font-family="ui-sans-serif,system-ui,sans-serif" xmlns="http://www.w3.org/2000/svg">${inner}</svg></div>`;
const err = (m: string) => `<div class="blk-err">${esc(m)}</div>`;

function parseHeader(src: string) {
  const lines = src.replace(/\r/g, "").split("\n");
  const opts: Record<string, string> = {};
  const rest: string[] = [];
  let inBody = false;
  const sep = lines.findIndex((l) => l.trim() === "---");
  lines.forEach((l, i) => {
    if (inBody || (sep >= 0 && i > sep)) { rest.push(l); inBody = true; return; }
    if (i === sep) { inBody = true; return; }
    const m = l.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if (m && sep >= 0) opts[m[1].toLowerCase()] = m[2].trim(); else rest.push(l);
  });
  return { opts, rest };
}

// ```chart  — options, optional '---', then CSV (first column = x)
export function renderChart(src: string): string {
  try {
    const { opts, rest } = parseHeader(src);
    const rows = rest.filter((l) => l.trim()).map((l) => l.split(/[,\t;]/).map((c) => c.trim()));
    if (rows.length < 2) return err("chart: need a header row and data rows");
    const [head, ...data] = rows;
    const type = (opts.type || "line").toLowerCase();
    const series = head.slice(1);
    const W = 560, H = +opts.height || 320;
    const numericX = data.every((r) => r[0] !== "" && !isNaN(+r[0]));
    const ys = data.flatMap((r) => r.slice(1).map(Number)).filter(isFinite);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (type === "bar" || type === "area") y0 = Math.min(0, y0);
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const padY = (y1 - y0) * 0.06; y1 += padY; if (type !== "bar" && type !== "area") y0 -= padY;
    let out: string;
    if (type === "bar") {
      const n = data.length;
      const fr = frame(W, H, [-0.5, n - 0.5], [y0, y1], { title: opts.title, xlabel: opts.xlabel, ylabel: opts.ylabel, xticks: data.map((_, i) => i), xlabels: data.map((r) => r[0]) });
      const bw = ((W - fr.f.l - fr.f.r) / n) * 0.8 / series.length;
      let bars = "";
      data.forEach((r, i) => series.forEach((_, k) => {
        const v = +r[k + 1]; if (!isFinite(v)) return;
        const x = fr.sx(i) - (bw * series.length) / 2 + k * bw;
        bars += `<rect x="${x}" y="${Math.min(fr.sy(v), fr.sy(0))}" width="${bw - 1}" height="${Math.abs(fr.sy(v) - fr.sy(0))}" fill="${PALETTE[k % PALETTE.length]}"/>`;
      }));
      out = fr.s + bars + legend(series, W - 120, fr.f.t + 8);
    } else {
      const xs = data.map((r, i) => (numericX ? +r[0] : i));
      let x0 = Math.min(...xs), x1 = Math.max(...xs);
      if (x0 === x1) { x0 -= 1; x1 += 1; }
      if (type === "scatter") { const p = (x1 - x0) * 0.05; x0 -= p; x1 += p; }
      const fr = frame(W, H, [x0, x1], [y0, y1], { title: opts.title, xlabel: opts.xlabel, ylabel: opts.ylabel,
        ...(numericX ? {} : { xticks: xs, xlabels: data.map((r) => r[0]) }) });
      let g = "";
      series.forEach((_, k) => {
        const col = PALETTE[k % PALETTE.length];
        const pts = data.map((r, i) => [fr.sx(xs[i]), fr.sy(+r[k + 1])]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
        if (type === "scatter") g += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${col}" opacity=".85"/>`).join("");
        else {
          const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
          if (type === "area") g += `<path d="${d}L${pts.at(-1)![0]} ${fr.sy(0)}L${pts[0][0]} ${fr.sy(0)}Z" fill="${col}" opacity=".25"/>`;
          g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
          if (pts.length < 40) g += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="${col}"/>`).join("");
        }
      });
      out = fr.s + g + legend(series, W - 120, fr.f.t + 8);
    }
    return wrap(out, W, H);
  } catch (e) { return err("chart error: " + (e as Error).message); }
}

export type PlotSpec = { exprs: string[]; xmin: number; xmax: number; ymin?: number; ymax?: number; title?: string; xlabel?: string; ylabel?: string };

const parseRange = (s: string) => { const [a, b] = s.split("..").map((p) => evalConst(p)); return [a, b] as [number, number]; };

// "sin(x); x^2/9 @ -6..6"
export function parsePlotShort(s: string): PlotSpec {
  const [e, r] = s.split("@");
  const [xmin, xmax] = r ? parseRange(r) : [-6, 6];
  return { exprs: e.split(";").map((x) => x.trim()).filter(Boolean), xmin, xmax };
}

export function parsePlot(src: string): PlotSpec {
  const spec: PlotSpec = { exprs: [], xmin: -6, xmax: 6 };
  for (const raw of src.split("\n")) {
    const l = raw.trim(); if (!l) continue;
    let m;
    if ((m = l.match(/^x\s*:\s*(.+)$/i))) [spec.xmin, spec.xmax] = parseRange(m[1]);
    else if ((m = l.match(/^y\s*:\s*(.+)$/i))) [spec.ymin, spec.ymax] = parseRange(m[1]);
    else if ((m = l.match(/^title\s*:\s*(.+)$/i))) spec.title = m[1];
    else if ((m = l.match(/^xlabel\s*:\s*(.+)$/i))) spec.xlabel = m[1];
    else if ((m = l.match(/^ylabel\s*:\s*(.+)$/i))) spec.ylabel = m[1];
    else spec.exprs.push(l);
  }
  return spec;
}

export function plotInner(spec: PlotSpec, W: number, H: number): string {
  const fns = spec.exprs.map((e) => compileExpr(e));
  const N = 500;
  const dx = (spec.xmax - spec.xmin) / N;
  const samples = fns.map((f) => Array.from({ length: N + 1 }, (_, i) => { const x = spec.xmin + i * dx; return [x, f(x)] as [number, number]; }));
  let ymin = spec.ymin, ymax = spec.ymax;
  if (ymin === undefined || ymax === undefined) {
    const ys = samples.flat().map((p) => p[1]).filter((v) => isFinite(v) && Math.abs(v) < 1e6).sort((a, b) => a - b);
    if (!ys.length) throw new Error("no finite values");
    const lo = ys[Math.floor(ys.length * 0.01)], hi = ys[Math.ceil(ys.length * 0.99) - 1];
    const pad = (hi - lo || 2) * 0.08;
    ymin ??= lo - pad; ymax ??= hi + pad;
  }
  const fr = frame(W, H, [spec.xmin, spec.xmax], [ymin, ymax], spec);
  const id = "pc" + ++uid;
  let g = `<clipPath id="${id}"><rect x="${fr.f.l}" y="${fr.f.t}" width="${W - fr.f.l - fr.f.r}" height="${H - fr.f.t - fr.f.b}"/></clipPath><g clip-path="url(#${id})">`;
  const span = ymax - ymin;
  samples.forEach((pts, k) => {
    let d = "", pen = false, prev = NaN;
    for (const [x, y] of pts) {
      if (!isFinite(y) || Math.abs(y - prev) > span * 1.5) { pen = false; prev = isFinite(y) ? y : NaN; if (!isFinite(y)) continue; }
      d += `${pen ? "L" : "M"}${fr.sx(x).toFixed(1)} ${fr.sy(y).toFixed(1)}`; pen = true; prev = y;
    }
    g += `<path d="${d}" fill="none" stroke="${PALETTE[k % PALETTE.length]}" stroke-width="2"/>`;
  });
  g += "</g>";
  return fr.s + g + legend(spec.exprs.map((e) => "y=" + e.replace(/^(y|f\(x\))\s*=\s*/i, "")), W - 130, fr.f.t + 8);
}

export function renderPlot(src: string): string {
  try { return wrap(plotInner(parsePlot(src), 560, 320), 560, 320); }
  catch (e) { return err("plot error: " + (e as Error).message); }
}
