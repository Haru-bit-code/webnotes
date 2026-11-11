// Full-page layouts for new scribble pages, in a hand-drawn style.
// Every block is its own group: drag to move it, double-click any text to change it,
// double-click inside a box or table cell to type there.
import { El, Paper } from "./types";
import { COL, sketch } from "./sketchKit";

export type PageTemplate = { id: string; name: string; hint: string; paper: Paper; build: () => El[] };
type K = ReturnType<typeof sketch>;
const blocks = (...fs: ((k: K) => void)[]) => fs.flatMap((f) => { const k = sketch(); f(k); return k.done(); });
const header = (t: string, sub = "date · subject") => (k: K) => { k.title(110, 92, t, 52); k.wavy(110, 120, Math.max(300, t.length * 25)); k.text(112, 154, sub, { fs: 17, c: COL.grey }); };
const rows = (n: number, v = "") => Array.from({ length: n }, () => v);

export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: "meeting", name: "Meeting notes", hint: "Attendees, agenda, decisions, action items", paper: "sheet", build: () => blocks(
    header("Meeting", "date · time · place"),
    (k) => k.sticky(900, 60, 360, 150, COL.yellow, "Attendees", ["…", "…", "…"]),
    (k) => { k.section(110, 190, 560, 300, "Agenda"); k.numbered(132, 250, 516, rows(4, "…"), 1, 48); },
    (k) => { k.section(700, 240, 560, 250, "Decisions", COL.green); k.bullets(724, 330, ["…", "…", "…"], 34, "✔", COL.green); },
    (k) => { k.text(110, 550, "Action items", { fs: 32, bold: true, font: "script", c: COL.blue }); k.matrix(110, 570, ["Task", "Owner", "Due", "Done"], [640, 220, 180, 110], [["…", "", "", "☐"], ["…", "", "", "☐"], ["…", "", "", "☐"], ["…", "", "", "☐"]], 40); },
    (k) => k.sticky(110, 800, 1150, 80, COL.sky, "", ["Next meeting: …"], -0.3),
  ) },
  { id: "lecture", name: "Lecture notes", hint: "Cornell method: cues, notes, summary", paper: "sheet", build: () => blocks(
    header("Lecture: topic", "course · date · lecturer"),
    (k) => { k.section(110, 190, 300, 580, "Cues", COL.blue); k.bullets(132, 270, ["Key question?", "Term", "Formula"], 44, "?", COL.blue); },
    (k) => { k.section(440, 190, 820, 580, "Notes"); k.bullets(464, 270, ["Main point", "  detail", "Example"], 36, "•", "auto"); },
    (k) => k.sticky(110, 810, 1150, 100, COL.yellow, "Summary", ["In two sentences…"], -0.3),
  ) },
  { id: "revision", name: "Revision sheet", hint: "Key terms, formulas, things to remember, self-test", paper: "sheet", build: () => blocks(
    header("Revision: topic"),
    (k) => { k.text(110, 220, "Key terms", { fs: 32, bold: true, font: "script", c: COL.blue }); k.matrix(110, 240, ["Term", "Meaning"], [200, 420], [["…", "…"], ["…", "…"], ["…", "…"], ["…", "…"], ["…", "…"]], 42); },
    (k) => { k.box(780, 190, 480, 180, { fill: COL.yellow, c: "#a16207" }); k.text(800, 230, "Formulas", { fs: 28, bold: true, font: "script", c: "#1f2937" }); k.text(800, 280, "…", { fs: 22, c: "#1f2937" }); k.text(800, 330, "…", { fs: 22, c: "#1f2937" }); },
    (k) => k.sticky(780, 400, 480, 150, COL.pink, "Remember!", ["…", "…"], 0.8),
    (k) => { k.section(110, 520, 620, 330, "Test yourself", COL.red); k.numbered(132, 580, 576, rows(5, "Q: …"), 1, 46, "auto"); },
    (k) => { k.section(780, 590, 480, 260, "Mistakes I made", COL.orange); k.bullets(804, 670, ["…", "…", "…"], 34); },
  ) },
  { id: "project", name: "Project plan", hint: "Goal, milestones, task board, risks", paper: "sheet", build: () => blocks(
    header("Project plan", "owner · start · deadline"),
    (k) => { k.box(110, 180, 760, 90, { fill: COL.mint, c: COL.green }); k.text(130, 218, "Goal:", { fs: 28, bold: true, font: "script", c: "#1f2937" }); k.text(210, 218, "…", { fs: 18, c: "#1f2937" }); k.text(130, 252, "Done when: …", { fs: 15, c: "#334155" }); },
    (k) => k.sticky(910, 170, 350, 160, COL.pink, "Risks ⚠", ["…", "…", "…"], 1),
    (k) => { k.text(110, 330, "Milestones", { fs: 30, bold: true, font: "script" }); k.line(110, 380, 1260, 380, { w: 2.2 }); [0, 1, 2, 3, 4].forEach((i) => { const x = 160 + i * 260; k.ellipse(x - 9, 371, 18, 18, { fill: COL.orange, c: COL.orange }); k.text(x - 20, 360, "date", { fs: 13, c: COL.grey }); k.text(x - 30, 414, "Milestone", { fs: 16 }); }); },
    (k) => { [["To do", COL.stone], ["Doing", COL.peach], ["Done", COL.mint]].forEach(([c, f], i) => { const x = 110 + i * 390; k.box(x, 460, 370, 400); k.card(x + 1, 461, 368, 44, f, c, { fs: 20, bold: true }); [0, 1].forEach((j) => k.sticky(x + 20, 530 + j * 120, 330, 96, COL.yellow, "", ["Task…"], j ? 0.8 : -0.8)); }); },
  ) },
  { id: "brainstorm", name: "Brainstorm", hint: "Central idea, branches, sticky ideas", paper: "dots", build: () => blocks(
    header("Brainstorm", "question we are answering"),
    (k) => {
      const cx = 640, cy = 520;
      [[180, 260], [560, 220], [940, 260], [180, 700], [560, 780], [940, 700]].forEach(([x, y]) => { k.line(cx, cy, x + 80, y + 26, { w: 1.6 }); k.card(x, y, 160, 52, COL.sky, "Branch", { fs: 17 }); });
      k.ellipse(cx - 130, cy - 54, 260, 108, { fill: COL.yellow, c: "#a16207", w: 2.2 }); k.text(cx - 70, cy + 10, "Big idea", { fs: 34, bold: true, font: "script", c: "#1f2937" });
    },
    (k) => { [[1150, 220, COL.yellow, -2], [1150, 400, COL.mint, 1.5], [1150, 580, COL.pink, -1], [1150, 760, COL.sky, 2]].forEach(([x, y, f, r]) => k.sticky(x as number, y as number, 200, 140, f as string, "", ["idea…"], r as number)); },
  ) },
  { id: "decision", name: "Decision maker", hint: "Options vs criteria, pros & cons, verdict", paper: "sheet", build: () => blocks(
    header("Decision: what should I choose?"),
    (k) => { k.text(110, 220, "Compare", { fs: 32, bold: true, font: "script", c: COL.blue }); k.matrix(110, 240, ["Criteria", "Weight", "Option A", "Option B", "Option C"], [300, 120, 160, 160, 160], [["…", "", "", "", ""], ["…", "", "", "", ""], ["…", "", "", "", ""], ["…", "", "", "", ""], ["Total", "", "", "", ""]], 44); },
    (k) => { k.section(110, 540, 560, 280, "Pros", COL.green); k.bullets(134, 620, ["…", "…", "…"], 36, "+", COL.green); },
    (k) => { k.section(700, 540, 560, 280, "Cons", COL.red); k.bullets(724, 620, ["…", "…", "…"], 36, "−", COL.red); },
    (k) => k.sticky(1040, 190, 240, 170, COL.yellow, "Verdict", ["…"], 1.5),
  ) },
  { id: "week", name: "Weekly planner", hint: "Days, top 3 priorities, habits", paper: "sheet", build: () => blocks(
    header("This week", "week of …"),
    (k) => { ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"].forEach((d, i) => { const x = 110 + (i % 3) * 400, y = 180 + Math.floor(i / 3) * 280; k.section(x, y, 370, 250, d, [COL.red, COL.orange, COL.green, COL.blue, "#7c3aed", COL.grey][i]); }); },
    (k) => k.sticky(110, 760, 480, 150, COL.yellow, "Top 3", ["1.", "2.", "3."], -0.6),
    (k) => { k.text(640, 790, "Habits", { fs: 30, bold: true, font: "script" }); k.matrix(640, 806, ["Habit", "M", "T", "W", "T", "F", "S", "S"], [200, 50, 50, 50, 50, 50, 50, 50], [["…", "", "", "", "", "", "", ""], ["…", "", "", "", "", "", "", ""]], 36); },
  ) },
  { id: "journal", name: "Daily journal", hint: "Mood, gratitude, plan, reflection", paper: "ruled", build: () => blocks(
    header("Today", "date"),
    (k) => { k.text(110, 210, "Mood", { fs: 28, bold: true, font: "script" }); ["😞", "🙁", "😐", "🙂", "😄"].forEach((m, i) => { k.ellipse(220 + i * 74, 176, 56, 56); k.text(235 + i * 74, 214, m, { fs: 24, font: "ui" }); }); },
    (k) => k.sticky(820, 160, 440, 170, COL.mint, "Grateful for", ["1. …", "2. …", "3. …"], 1),
    (k) => { k.section(110, 280, 620, 330, "Plan", COL.blue); k.bullets(134, 360, ["☐ …", "☐ …", "☐ …", "☐ …", "☐ …"], 40, "", "auto"); },
    (k) => { k.section(760, 370, 500, 240, "Notes"); },
    (k) => { k.section(110, 640, 1150, 220, "Reflection", COL.orange); k.text(134, 720, "What went well? What would I change?", { fs: 16, c: COL.grey }); },
  ) },
  { id: "book", name: "Book / article notes", hint: "Source, key ideas, quotes, takeaways", paper: "sheet", build: () => blocks(
    header("Title", "author · year · link"),
    (k) => k.sticky(960, 60, 300, 150, COL.yellow, "Rating", ["☆ ☆ ☆ ☆ ☆"], 1.2),
    (k) => { k.section(110, 190, 700, 360, "Key ideas"); k.numbered(132, 250, 656, rows(5, "…"), 1, 52); },
    (k) => { k.box(840, 250, 420, 300, { fill: COL.sky, c: COL.blue }); k.text(860, 292, "“ Quotes ”", { fs: 30, bold: true, font: "script", c: "#1f2937" }); k.text(860, 340, "…", { fs: 16, c: "#1f2937" }); },
    (k) => { k.section(110, 590, 700, 260, "How I'll use this", COL.green); k.bullets(134, 670, ["…", "…", "…"], 36, "→", COL.green); },
    (k) => k.sticky(840, 600, 420, 160, COL.pink, "Questions", ["…", "…"], -1),
  ) },
  { id: "issues", name: "Problem log", hint: "Numbered problems with fixes and status", paper: "sheet", build: () => blocks(
    header("Problem log", "project · date"),
    (k) => { k.matrix(110, 190, ["#", "Problem", "Fix", "Status"], [60, 460, 460, 170], rows(8).map((_, i) => [String(i + 1), "", "", "☐ open"]), 52); },
    (k) => k.sticky(110, 690, 560, 110, COL.pink, "Pattern", ["What keeps going wrong…"], -0.5),
    (k) => k.sticky(700, 690, 560, 110, COL.mint, "Lesson", ["What we'll do next time…"], 0.5),
  ) },
];
