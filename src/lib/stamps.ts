// Drop-in templates for scribble pages: tables, charts, lists, planners, study layouts.
// Each one is built from ordinary canvas shapes that share a group id, so it moves as a unit
// and every line or label stays editable.
import { El, ElType, Pt } from "./types";
import { COL, sketch } from "./sketchKit";
const INK_LINE = "#a16207";

export type Stamp = { name: string; cat: Category; build: () => El[] };
export type Category = "Sketch" | "Tables" | "Charts" | "Lines & lists" | "Diagrams" | "Planning" | "Study" | "Maths & science";
export const CATEGORIES: Category[] = ["Sketch", "Tables", "Charts", "Lines & lists", "Diagrams", "Planning", "Study", "Maths & science"];

const uid = () => Math.random().toString(36).slice(2, 10);
const DIM = 0.45; // stroke width for guide lines

// tiny builder: collects shapes into one group
function kit() {
  const els: El[] = [];
  const add = (t: ElType, o: Partial<El>) => { const e = { id: uid(), t, x: 0, y: 0, c: "auto", w: 1.5, ...o } as El; els.push(e); return e; };
  return {
    els,
    rect: (x: number, y: number, w: number, h: number, o: Partial<El> = {}) => add("rect", { x, y, x2: x + w, y2: y + h, ...o }),
    ellipse: (x: number, y: number, w: number, h: number, o: Partial<El> = {}) => add("ellipse", { x, y, x2: x + w, y2: y + h, ...o }),
    diamond: (x: number, y: number, w: number, h: number, o: Partial<El> = {}) => add("diamond", { x, y, x2: x + w, y2: y + h, ...o }),
    line: (x: number, y: number, x2: number, y2: number, o: Partial<El> = {}) => add("line", { x, y, x2, y2, ...o }),
    arrow: (x: number, y: number, x2: number, y2: number, o: Partial<El> = {}) => add("arrow", { x, y, x2, y2, ...o }),
    text: (x: number, y: number, text: string, fs = 15, o: Partial<El> = {}) => add("text", { x, y, text, fs, w: 1, ...o }),
    poly: (pts: Pt[], o: Partial<El> = {}) => add("poly", { pts, ...o }),
    pen: (pts: Pt[], o: Partial<El> = {}) => add("pen", { pts, ...o }),
    axes: (x: number, y: number, w: number, h: number) => add("axes", { x, y, x2: x + w, y2: y + h }),
    plot: (x: number, y: number, w: number, h: number, expr: string) => add("plot", { x, y, x2: x + w, y2: y + h, expr, w: 1 }),
    done() { const g = uid(); return els.map((e) => ({ ...e, g })); },
  };
}

// centred label inside a box (text x is the left edge, so estimate the width)
const centred = (k: ReturnType<typeof kit>, cx: number, cy: number, s: string, fs = 15, o: Partial<El> = {}) =>
  k.text(cx - s.length * fs * 0.28, cy + fs * 0.35, s, fs, o);

function table(cols: number, rows: number, opt: { cw?: number; rh?: number; head?: string[]; firstCol?: string[] } = {}) {
  const k = kit(), cw = opt.cw ?? 120, rh = opt.rh ?? 40, W = cols * cw, H = rows * rh;
  if (opt.head) k.rect(0, 0, W, rh, { fill: "accent", w: 0 });
  k.rect(0, 0, W, H);
  for (let c = 1; c < cols; c++) k.line(c * cw, 0, c * cw, H, { w: 1 });
  for (let r = 1; r < rows; r++) k.line(0, r * rh, W, r * rh, { w: r === 1 && opt.head ? 1.5 : 1 });
  opt.head?.forEach((h, i) => k.text(i * cw + 10, rh / 2 + 5, h, 15));
  opt.firstCol?.forEach((h, i) => k.text(10, (i + 1) * rh + rh / 2 + 5, h, 14));
  return k.done();
}

function grid2x2(labels: string[], opt: { size?: number; axes?: [string, string, string, string] } = {}) {
  const k = kit(), s = opt.size ?? 180, o = opt.axes ? 30 : 0;
  k.rect(o, o, s * 2, s * 2); k.line(o + s, o, o + s, o + 2 * s); k.line(o, o + s, o + 2 * s, o + s);
  labels.forEach((l, i) => k.text(o + (i % 2) * s + 12, o + Math.floor(i / 2) * s + 26, l, 16));
  if (opt.axes) {
    const [top1, top2, side1, side2] = opt.axes;
    k.text(o + 12, 18, top1, 13, { c: "#64748b" }); k.text(o + s + 12, 18, top2, 13, { c: "#64748b" });
    k.text(2, o + s / 2, side1, 13, { c: "#64748b" }); k.text(2, o + s + s / 2, side2, 13, { c: "#64748b" });
  }
  return k.done();
}

function ruledBlock(n: number, gap = 32, w = 480) {
  const k = kit();
  for (let i = 1; i <= n; i++) k.line(0, i * gap, w, i * gap, { w: 1, c: "#94a3b8" });
  return k.done();
}

function chartFrame(k: ReturnType<typeof kit>, w: number, h: number, gridlines = 4) {
  k.axes(0, 0, w, h);
  for (let i = 1; i <= gridlines; i++) { const y = h - 24 - (i * (h - 40)) / gridlines; k.line(26, y, w - 10, y, { w: DIM, c: "#94a3b8" }); }
}

const SK = (name: string, f: (k: ReturnType<typeof sketch>) => void): Stamp => ({ name, cat: "Sketch", build: () => { const k = sketch(); f(k); return k.done(); } });

export const STAMPS: Stamp[] = [
  // ---- Sketch: hand-drawn blocks (double-click any text to edit, or inside a box to add text)
  SK("Page title", (k) => { k.title(0, 50, "Page title"); k.wavy(0, 74, 360); k.text(0, 104, "date · subject", { fs: 16, c: COL.grey }); }),
  SK("Section box", (k) => { k.section(0, 0, 420, 220, "Heading"); k.text(20, 90, "Write here…", { fs: 16 }); }),
  SK("Sticky · idea", (k) => k.sticky(0, 0, 300, 170, COL.yellow, "Idea 💡", ["…", "…"])),
  SK("Sticky · to do", (k) => k.sticky(0, 0, 300, 170, COL.mint, "To do", ["☐ …", "☐ …", "☐ …"], 1)),
  SK("Sticky · remember", (k) => k.sticky(0, 0, 300, 150, COL.pink, "Remember!", ["…"], 0.8)),
  SK("Sticky · question", (k) => k.sticky(0, 0, 300, 150, COL.sky, "Question?", ["…"], -0.8)),
  SK("Numbered list", (k) => k.numbered(0, 0, 520, ["…", "…", "…", "…", "…"])),
  SK("Action items", (k) => k.matrix(0, 0, ["Task", "Owner", "Due", "Done"], [280, 120, 110, 70], [["…", "", "", "☐"], ["…", "", "", "☐"], ["…", "", "", "☐"], ["…", "", "", "☐"]])),
  SK("Problem → solution", (k) => {
    k.matrix(0, 0, ["#", "Problem  →  solution"], [62, 540], []);
    for (let i = 0; i < 3; i++) {
      const y = 34 + i * 58; k.line(0, y + 58, 602, y + 58, { w: 1.6, sk: 0.4 }); k.ellipse(18, y + 16, 26, 26); k.text(26, y + 35, String(i + 1), { fs: 15 });
      k.text(74, y + 22, "Problem…", { fs: 14, c: COL.red }); k.text(74, y + 44, "→ solution…", { fs: 15 });
    }
    k.line(62, 34, 62, 34 + 3 * 58, { w: 1.4, sk: 0.4 }); k.box(0, 0, 602, 34 + 3 * 58, { w: 2.2, sk: 0.4 });
  }),
  SK("Compare options", (k) => k.matrix(0, 0, ["Criteria", "Option A", "Option B", "Option C"], [200, 110, 110, 110], [["Cost", true, false, true], ["Speed", false, true, true], ["Ease", true, true, false], ["Score", "", "", ""]])),
  SK("Definition card", (k) => { k.box(0, 0, 420, 170); k.text(18, 40, "Term", { fs: 28, bold: true, font: "script", c: COL.blue }); k.text(18, 78, "Definition: …", { fs: 16 }); k.text(18, 112, "Example: …", { fs: 16, c: COL.grey }); k.text(18, 146, "See also: …", { fs: 14, c: COL.grey }); }),
  SK("Q & A card", (k) => { k.box(0, 0, 420, 150); k.text(18, 42, "Q:", { fs: 26, bold: true, font: "script", c: COL.red }); k.text(58, 42, "…", { fs: 16 }); k.line(14, 74, 406, 74, { dash: true, w: 1 }); k.text(18, 112, "A:", { fs: 26, bold: true, font: "script", c: COL.green }); k.text(58, 112, "…", { fs: 16 }); }),
  SK("Formula box", (k) => { k.box(0, 0, 380, 150, { fill: COL.yellow, c: "#a16207" }); k.text(18, 38, "Formula", { fs: 24, bold: true, font: "script", c: "#1f2937" }); k.text(18, 86, "a² + b² = c²", { fs: 26, c: "#1f2937" }); k.text(18, 126, "where …", { fs: 14, c: "#475569" }); }),
  SK("Process flow", (k) => {
    for (let i = 0; i < 4; i++) { const x = i * 170; k.box(x, 0, 136, 70); k.text(x + 14, 32, `Step ${i + 1}`, { fs: 22, bold: true, font: "script" }); k.text(x + 14, 56, "…", { fs: 13, c: COL.grey }); if (i < 3) k.arrow(x + 138, 35, x + 166, 35); }
  }),
  SK("Swimlanes", (k) => {
    [["Team A", COL.blue], ["Team B", COL.green], ["Team C", COL.red]].forEach(([l, c], i) => k.lane(0, i * 120, 720, 108, l, c));
    k.card(150, 40, 130, 40, COL.yellow, "Task"); k.card(330, 40, 130, 40, COL.yellow, "Task"); k.arrow(282, 60, 326, 60);
    k.card(330, 160, 150, 40, COL.sky, "Task"); k.arrow(395, 82, 400, 156);
    k.card(540, 280, 140, 40, COL.mint, "Done ✔"); k.arrow(482, 182, 600, 276, { c: COL.green });
  }),
  SK("Status flow", (k) => {
    [["To do", COL.stone], ["In progress", COL.peach], ["Review", COL.sky], ["Done", COL.mint]].forEach(([l, f], i) => { k.card(i * 200, 0, 160, 48, f, l, { fs: 18 }); if (i < 3) k.arrow(i * 200 + 162, 24, i * 200 + 196, 24); });
    k.pen([[480, 50], [400, 96], [300, 50]], { head: true, c: COL.red, w: 1.6 }); k.text(330, 112, "changes needed", { fs: 13, c: COL.red });
  }),
  SK("Stick figures", (k) => {
    k.stickman(40, 14, "Person A", COL.blue); k.stickman(380, 14, "Person B", COL.green);
    k.arrow(100, 60, 320, 60, { w: 2 }); k.text(150, 46, "says / sends…", { fs: 14 });
  }),
  SK("Timeline", (k) => {
    k.line(0, 40, 620, 40, { w: 2.2 });
    for (let i = 0; i < 5; i++) { const x = 30 + i * 140; k.ellipse(x - 9, 31, 18, 18, { fill: COL.orange, c: COL.orange }); k.text(x - 20, 18, "Date", { fs: 13, c: COL.grey }); k.text(x - 22, 76, "Event", { fs: 16 }); }
  }),
  SK("Mind map", (k) => {
    const cx = 260, cy = 160;
    [[40, 30], [400, 30], [40, 260], [400, 260]].forEach(([x, y]) => { k.line(cx, cy, x + 60, y + 22, { w: 1.6 }); k.card(x, y, 120, 44, COL.sky, "Branch"); });
    k.ellipse(cx - 90, cy - 38, 180, 76, { fill: COL.yellow, c: INK_LINE, w: 2 }); k.text(cx - 46, cy + 8, "Big idea", { fs: 22, bold: true, font: "script", c: "#1f2937" });
  }),
  SK("Before / after", (k) => {
    k.section(0, 0, 330, 240, "Before", COL.red); k.section(360, 0, 330, 240, "After", COL.green);
    k.bullets(22, 90, ["…", "…", "…"], 30, "•", "auto"); k.bullets(382, 90, ["…", "…", "…"], 30, "•", "auto");
  }),
  SK("Rating scale", (k) => {
    k.text(0, 20, "How did it go?", { fs: 20, bold: true, font: "script" });
    ["😞", "🙁", "😐", "🙂", "😄"].forEach((m, i) => { k.ellipse(i * 70, 40, 54, 54); k.text(i * 70 + 14, 76, m, { fs: 22, font: "ui" }); });
  }),
  SK("Starred list", (k) => k.bullets(0, 0, ["…", "…", "…", "…"])),
  SK("Code card", (k) => k.code(0, 0, 440, "Snippet", ["function hello(name) {", "  return `Hi ${name}`;", "}"])),
  SK("Wavy underline", (k) => { k.wavy(0, 10, 360); }),
  SK("Marker highlight", (k) => { k.pen([[0, 12], [260, 12]], { t: "hl", c: "#facc15", w: 18 }); k.text(6, 18, "important words", { fs: 18 }); }),

  // ---- Tables
  { name: "Table 2 × 3", cat: "Tables", build: () => table(2, 3) },
  { name: "Table 3 × 4", cat: "Tables", build: () => table(3, 4, { head: ["Header", "Header", "Header"] }) },
  { name: "Table 4 × 6", cat: "Tables", build: () => table(4, 6, { cw: 110, head: ["Item", "", "", ""] }) },
  { name: "Table 5 × 8", cat: "Tables", build: () => table(5, 8, { cw: 96, rh: 34, head: ["#", "", "", "", ""] }) },
  { name: "Pros & cons", cat: "Tables", build: () => table(2, 7, { cw: 200, head: ["Pros", "Cons"] }) },
  { name: "Comparison", cat: "Tables", build: () => table(4, 6, { cw: 120, head: ["Feature", "Option A", "Option B", "Option C"] }) },
  { name: "Habit tracker", cat: "Tables", build: () => table(8, 7, { cw: 52, rh: 36, head: ["Habit", "M", "T", "W", "T", "F", "S", "S"] }) },

  // ---- Charts
  { name: "Bar chart", cat: "Charts", build: () => {
    const k = kit(), W = 380, H = 260; chartFrame(k, W, H);
    [0.45, 0.75, 0.55, 0.9, 0.35].forEach((v, i) => { const bh = (H - 50) * v; k.rect(50 + i * 64, H - 24 - bh, 40, bh, { fill: "accent", w: 1.2 }); });
    k.text(0, -12, "Chart title", 16); return k.done();
  } },
  { name: "Line chart", cat: "Charts", build: () => {
    const k = kit(), W = 380, H = 260; chartFrame(k, W, H);
    const pts: Pt[] = [[40, 190], [100, 150], [160, 165], [220, 105], [280, 120], [340, 60]];
    k.pen(pts, { c: "#3b82f6", w: 2.5 }); pts.forEach(([x, y]) => k.ellipse(x - 4, y - 4, 8, 8, { c: "#3b82f6", fill: "#3b82f6", w: 1 }));
    k.text(0, -12, "Chart title", 16); return k.done();
  } },
  { name: "Pie chart", cat: "Charts", build: () => {
    const k = kit(), r = 110, cx = 120, cy = 120;
    k.ellipse(cx - r, cy - r, 2 * r, 2 * r, { w: 2 });
    [0, 0.38, 0.62, 0.82].forEach((f) => { const a = f * 2 * Math.PI - Math.PI / 2; k.line(cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a)); });
    ["#3b82f6", "#22c55e", "#eab308", "#ef4444"].forEach((c, i) => { k.rect(270, 40 + i * 34, 18, 18, { fill: c, c }); k.text(298, 54 + i * 34, `Label ${i + 1}`, 14); });
    return k.done();
  } },
  { name: "Scatter grid", cat: "Charts", build: () => {
    const k = kit(), W = 340, H = 260; k.axes(0, 0, W, H);
    for (let x = 64; x < W - 10; x += 40) k.line(x, 10, x, H - 24, { w: DIM, c: "#94a3b8" });
    for (let y = H - 64; y > 10; y -= 40) k.line(26, y, W - 10, y, { w: DIM, c: "#94a3b8" });
    return k.done();
  } },
  { name: "Coordinate plane", cat: "Charts", build: () => {
    const k = kit(), S = 300, c = S / 2;
    for (let v = 20; v < S; v += 20) { k.line(v, 0, v, S, { w: DIM, c: "#94a3b8" }); k.line(0, v, S, v, { w: DIM, c: "#94a3b8" }); }
    k.arrow(0, c, S + 14, c, { w: 1.8 }); k.arrow(c, S, c, -14, { w: 1.8 });
    k.text(S + 18, c + 5, "x", 15); k.text(c + 8, -14, "y", 15); k.text(c - 14, c + 16, "0", 12);
    return k.done();
  } },
  { name: "Number line", cat: "Charts", build: () => {
    const k = kit(); k.arrow(-14, 30, 474, 30, { w: 1.8 }); k.arrow(440, 30, -20, 30, { w: 1.8 });
    for (let i = -5; i <= 5; i++) { const x = 230 + i * 40; k.line(x, 22, x, 38, { w: 1.5 }); k.text(x - (i < 0 ? 8 : 4), 58, String(i), 13); }
    return k.done();
  } },
  { name: "Venn (2 sets)", cat: "Charts", build: () => {
    const k = kit(); k.ellipse(0, 0, 220, 220, { c: "#3b82f6", w: 2 }); k.ellipse(130, 0, 220, 220, { c: "#ef4444", w: 2 });
    k.text(60, 115, "A", 20); k.text(168, 115, "A ∩ B", 14); k.text(280, 115, "B", 20); return k.done();
  } },
  { name: "Venn (3 sets)", cat: "Charts", build: () => {
    const k = kit(); k.ellipse(0, 0, 200, 200, { c: "#3b82f6", w: 2 }); k.ellipse(120, 0, 200, 200, { c: "#ef4444", w: 2 }); k.ellipse(60, 100, 200, 200, { c: "#22c55e", w: 2 });
    k.text(50, 80, "A", 20); k.text(250, 80, "B", 20); k.text(150, 260, "C", 20); return k.done();
  } },
  { name: "Function plot", cat: "Charts", build: () => { const k = kit(); k.plot(0, 0, 360, 220, "sin(x); cos(x) @ -2*pi..2*pi"); return k.done(); } },

  // ---- Lines & lists
  { name: "Ruled block", cat: "Lines & lists", build: () => ruledBlock(8) },
  { name: "Checklist", cat: "Lines & lists", build: () => {
    const k = kit(); for (let i = 0; i < 6; i++) { const y = i * 40; k.rect(0, y + 8, 20, 20, { w: 1.6 }); k.line(34, y + 28, 400, y + 28, { w: 1, c: "#94a3b8" }); }
    return k.done();
  } },
  { name: "Bullet list", cat: "Lines & lists", build: () => {
    const k = kit(); for (let i = 0; i < 6; i++) { const y = i * 40; k.ellipse(4, y + 14, 9, 9, { fill: "currentColor", w: 1 }); k.line(28, y + 26, 400, y + 26, { w: 1, c: "#94a3b8" }); }
    return k.done();
  } },
  { name: "Numbered list", cat: "Lines & lists", build: () => {
    const k = kit(); for (let i = 0; i < 6; i++) { const y = i * 40; k.text(0, y + 24, `${i + 1}.`, 16); k.line(28, y + 28, 400, y + 28, { w: 1, c: "#94a3b8" }); }
    return k.done();
  } },
  { name: "Timeline", cat: "Lines & lists", build: () => {
    const k = kit(); k.arrow(0, 40, 520, 40, { w: 2 });
    for (let i = 0; i < 5; i++) { const x = 40 + i * 110; k.ellipse(x - 8, 32, 16, 16, { fill: "accent", w: 1.8 }); k.text(x - 22, 76, `Step ${i + 1}`, 14); k.text(x - 18, 18, "Date", 12, { c: "#64748b" }); }
    return k.done();
  } },
  { name: "Section divider", cat: "Lines & lists", build: () => {
    const k = kit(); k.line(0, 10, 210, 10, { w: 1.2 }); k.diamond(222, 2, 16, 16, { fill: "accent" }); k.line(250, 10, 460, 10, { w: 1.2 }); return k.done();
  } },
  { name: "Heading + lines", cat: "Lines & lists", build: () => {
    const k = kit(); k.text(0, 22, "Heading", 24); k.line(0, 34, 480, 34, { w: 2.2, c: "accent" });
    for (let i = 1; i <= 5; i++) k.line(0, 34 + i * 32, 480, 34 + i * 32, { w: 1, c: "#94a3b8" });
    return k.done();
  } },

  // ---- Diagrams
  { name: "Flowchart", cat: "Diagrams", build: () => {
    const k = kit();
    k.ellipse(100, 0, 140, 50); centred(k, 170, 25, "Start");
    k.arrow(170, 50, 170, 86);
    k.rect(100, 86, 140, 54); centred(k, 170, 113, "Step");
    k.arrow(170, 140, 170, 176);
    k.diamond(95, 176, 150, 90); centred(k, 170, 221, "Check?");
    k.arrow(95, 221, 30, 221); k.arrow(30, 221, 30, 300); k.text(48, 212, "yes", 12, { c: "#64748b" });
    k.arrow(245, 221, 310, 221); k.arrow(310, 221, 310, 300); k.text(258, 212, "no", 12, { c: "#64748b" });
    k.rect(-30, 300, 120, 50); centred(k, 30, 325, "Do A");
    k.rect(250, 300, 120, 50); centred(k, 310, 325, "Do B");
    return k.done();
  } },
  { name: "Mind map", cat: "Diagrams", build: () => {
    const k = kit(), cx = 260, cy = 170;
    k.ellipse(cx - 80, cy - 36, 160, 72, { fill: "accent", w: 2 }); centred(k, cx, cy, "Main idea", 17);
    [[40, 30], [380, 30], [0, 160], [420, 160], [40, 290], [380, 290]].forEach(([x, y], i) => {
      k.line(cx, cy, x + 60, y + 22, { w: 1.4 }); k.rect(x, y, 120, 44, { fill: "#ffffff00" }); centred(k, x + 60, y + 22, `Topic ${i + 1}`, 14);
    });
    // put the centre on top of the branch lines
    const els = k.done(); const centre = els.splice(0, 2); return [...els, ...centre];
  } },
  { name: "Cycle", cat: "Diagrams", build: () => {
    const k = kit(), cx = 200, cy = 170, R = 130;
    const pos = [0, 1, 2, 3].map((i) => { const a = (i / 4) * 2 * Math.PI - Math.PI / 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    pos.forEach(([x, y], i) => { k.ellipse(x - 58, y - 28, 116, 56); centred(k, x, y, `Stage ${i + 1}`, 14); });
    const arc = (a: number, b: number) => { const m = (a + b) / 2, rr = R * 1.08; return [cx + rr * Math.cos(m), cy + rr * Math.sin(m)] as Pt; };
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * 2 * Math.PI - Math.PI / 2 + 0.42, a1 = ((i + 1) / 4) * 2 * Math.PI - Math.PI / 2 - 0.42;
      const p0: Pt = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1: Pt = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
      k.pen([p0, arc(a0, a1), p1], { head: true, w: 1.6 });
    }
    return k.done();
  } },
  { name: "Hierarchy", cat: "Diagrams", build: () => {
    const k = kit();
    k.rect(170, 0, 140, 48, { fill: "accent" }); centred(k, 240, 24, "Top");
    k.line(240, 48, 240, 80); k.line(70, 80, 410, 80);
    [70, 240, 410].forEach((x, i) => { k.line(x, 80, x, 110); k.rect(x - 65, 110, 130, 46); centred(k, x, 133, `Item ${i + 1}`); });
    return k.done();
  } },
  { name: "Process steps", cat: "Diagrams", build: () => {
    const k = kit(); for (let i = 0; i < 4; i++) { const x = i * 150; k.rect(x, 0, 116, 60); centred(k, x + 58, 30, `Step ${i + 1}`); if (i < 3) k.arrow(x + 120, 30, x + 146, 30); }
    return k.done();
  } },

  // ---- Planning
  { name: "Daily schedule", cat: "Planning", build: () => {
    const k = kit(); k.text(0, 0, "Today", 20);
    for (let h = 0; h <= 11; h++) { const y = 20 + h * 36; k.text(0, y + 22, `${String(h + 7).padStart(2, "0")}:00`, 13, { c: "#64748b" }); k.line(56, y + 36, 460, y + 36, { w: 1, c: "#94a3b8" }); }
    k.line(56, 20, 56, 20 + 12 * 36, { w: 1.2, c: "accent" }); return k.done();
  } },
  { name: "Weekly planner", cat: "Planning", build: () => {
    const k = kit(), W = 230, H = 150;
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Notes"].forEach((d, i) => {
      const x = (i % 2) * W, y = Math.floor(i / 2) * H; k.rect(x, y, W, H); k.rect(x, y, W, 30, { fill: "accent", w: 0 }); k.text(x + 10, y + 21, d, 14);
    });
    return k.done();
  } },
  { name: "Kanban board", cat: "Planning", build: () => {
    const k = kit(); ["To do", "Doing", "Done"].forEach((c, i) => {
      const x = i * 180; k.rect(x, 0, 168, 320); k.rect(x, 0, 168, 36, { fill: "accent", w: 0 }); k.text(x + 12, 24, c, 15);
      for (let j = 0; j < 2 - i % 2; j++) k.rect(x + 12, 50 + j * 70, 144, 56, { fill: "#fde68a", c: "#b45309", w: 1 });
    });
    return k.done();
  } },
  { name: "Priority matrix", cat: "Planning", build: () => grid2x2(["Do first", "Schedule", "Delegate", "Drop"], { axes: ["Urgent", "Not urgent", "", ""] }) },
  { name: "SWOT", cat: "Planning", build: () => grid2x2(["Strengths", "Weaknesses", "Opportunities", "Threats"]) },
  { name: "Goal & steps", cat: "Planning", build: () => {
    const k = kit(); k.rect(0, 0, 460, 60, { fill: "accent" }); k.text(14, 36, "Goal:", 18);
    for (let i = 0; i < 4; i++) { const y = 84 + i * 46; k.rect(0, y, 22, 22, { w: 1.6 }); k.text(34, y + 17, `Step ${i + 1}`, 15, { c: "#64748b" }); k.line(100, y + 22, 460, y + 22, { w: 1, c: "#94a3b8" }); }
    return k.done();
  } },

  // ---- Study
  { name: "Cornell notes", cat: "Study", build: () => {
    const k = kit(), W = 520, H = 460; k.rect(0, 0, W, H); k.line(0, 50, W, 50); k.line(150, 50, 150, H - 100); k.line(0, H - 100, W, H - 100);
    k.text(10, 32, "Topic", 17); k.text(10, 76, "Cues", 13, { c: "#64748b" }); k.text(162, 76, "Notes", 13, { c: "#64748b" }); k.text(10, H - 76, "Summary", 13, { c: "#64748b" });
    return k.done();
  } },
  { name: "Flashcard", cat: "Study", build: () => {
    const k = kit(); k.rect(0, 0, 260, 160, { w: 2 }); k.text(12, 26, "Front", 13, { c: "#64748b" }); k.rect(290, 0, 260, 160, { w: 2, fill: "accent" }); k.text(302, 26, "Back", 13, { c: "#64748b" });
    return k.done();
  } },
  { name: "KWL chart", cat: "Study", build: () => table(3, 6, { cw: 170, rh: 56, head: ["Know", "Want to know", "Learned"] }) },
  { name: "Frayer model", cat: "Study", build: () => {
    const els = grid2x2(["Definition", "Characteristics", "Examples", "Non-examples"], { size: 190 });
    const k = kit(); k.ellipse(120, 150, 140, 80, { fill: "var(--raised)", w: 2 }); centred(k, 190, 190, "Word", 18);
    const g = els[0].g; return [...els, ...k.els.map((e) => ({ ...e, g }))];
  } },
  { name: "Sticky note", cat: "Study", build: () => { const k = kit(); k.rect(0, 0, 180, 160, { fill: "#fde68a", c: "#d97706", w: 1 }); k.text(14, 32, "Note", 16, { c: "#1f2937" }); return k.done(); } },
  { name: "Callout box", cat: "Study", build: () => {
    const k = kit(); k.rect(0, 0, 440, 140, { w: 1.6 }); k.rect(0, 0, 8, 140, { fill: "accent", w: 0 }); k.text(22, 30, "Key idea", 17); return k.done();
  } },

  // ---- Maths & science
  { name: "Free-body diagram", cat: "Maths & science", build: () => {
    const k = kit(), cx = 160, cy = 150; k.rect(cx - 40, cy - 30, 80, 60, { fill: "accent" });
    k.arrow(cx, cy - 30, cx, cy - 120, { c: "#3b82f6", w: 2 }); k.text(cx + 8, cy - 112, "N", 16, { c: "#3b82f6" });
    k.arrow(cx, cy + 30, cx, cy + 120, { c: "#ef4444", w: 2 }); k.text(cx + 8, cy + 116, "mg", 16, { c: "#ef4444" });
    k.arrow(cx + 40, cy, cx + 140, cy, { c: "#22c55e", w: 2 }); k.text(cx + 120, cy - 10, "F", 16, { c: "#22c55e" });
    k.arrow(cx - 40, cy, cx - 120, cy, { c: "#f97316", w: 2 }); k.text(cx - 124, cy - 10, "f", 16, { c: "#f97316" });
    return k.done();
  } },
  { name: "3D axes", cat: "Maths & science", build: () => {
    const k = kit(), o: Pt = [120, 200]; k.arrow(o[0], o[1], 320, 200, { w: 1.8 }); k.arrow(o[0], o[1], 120, 10, { w: 1.8 }); k.arrow(o[0], o[1], 10, 300, { w: 1.8 });
    k.text(326, 205, "y", 16); k.text(126, 10, "z", 16); k.text(0, 300, "x", 16); return k.done();
  } },
  { name: "Right triangle", cat: "Maths & science", build: () => {
    const k = kit(); k.poly([[0, 200], [260, 200], [0, 0]], { w: 2 }); k.rect(0, 180, 20, 20, { w: 1 });
    k.text(-20, 105, "a", 17); k.text(125, 225, "b", 17); k.text(140, 92, "c", 17); k.text(214, 192, "θ", 15); return k.done();
  } },
  { name: "Unit circle", cat: "Maths & science", build: () => {
    const k = kit(), c = 160, r = 120; k.arrow(0, c, 2 * c + 10, c, { w: 1.4 }); k.arrow(c, 2 * c, c, -10, { w: 1.4 });
    k.ellipse(c - r, c - r, 2 * r, 2 * r, { w: 2 }); const a = -Math.PI / 4; k.line(c, c, c + r * Math.cos(a), c + r * Math.sin(a), { c: "accent", w: 2 });
    k.text(c + r + 6, c - 6, "1", 13); k.text(c + 14, c - 10, "θ", 14); k.text(c + r * Math.cos(a) + 6, c + r * Math.sin(a) - 6, "(cos θ, sin θ)", 13); return k.done();
  } },
  { name: "Circuit loop", cat: "Maths & science", build: () => {
    const k = kit(); k.line(0, 0, 120, 0); k.rect(120, -14, 80, 28); k.text(146, -22, "R", 14); k.line(200, 0, 320, 0); k.line(320, 0, 320, 180); k.line(320, 180, 190, 180);
    k.line(190, 160, 190, 200, { w: 2.5 }); k.line(170, 168, 170, 192, { w: 2.5 }); k.text(168, 222, "V", 14); k.line(170, 180, 0, 180); k.line(0, 180, 0, 0);
    return k.done();
  } },
];

// Move a stamp so its top-left corner sits at (x, y)
export function placeStamp(els: El[], x: number, y: number): El[] {
  const xs: number[] = [], ys: number[] = [];
  for (const e of els) {
    if (e.pts) e.pts.forEach(([a, b]) => { xs.push(a); ys.push(b); });
    else { xs.push(e.x, e.x2 ?? e.x); ys.push(e.y - (e.t === "text" ? e.fs ?? 15 : 0), e.y2 ?? e.y); }
  }
  const dx = x - Math.min(...xs), dy = y - Math.min(...ys);
  return els.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy, ...(e.x2 !== undefined && { x2: e.x2 + dx, y2: e.y2! + dy }), ...(e.pts && { pts: e.pts.map(([a, b]) => [a + dx, b + dy] as Pt) }) }));
}
