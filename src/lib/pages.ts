// Full-page layouts for new scribble pages, in the hand-drawn study-sheet style.
// Each block is its own group, so the parts can be moved or deleted separately.
import { El, Paper } from "./types";
import { COL, sketch } from "./sketchKit";

export type PageTemplate = { id: string; name: string; hint: string; paper: Paper; build: () => El[] };
type K = ReturnType<typeof sketch>;
const blocks = (...fs: ((k: K) => void)[]) => fs.flatMap((f) => { const k = sketch(); f(k); return k.done(); });

const header = (t: string, sub = "study notes · date") => (k: K) => { k.title(110, 92, t, 54); k.wavy(110, 122, Math.max(320, t.length * 26)); k.text(112, 156, sub, { fs: 17, c: COL.grey }); };

export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: "overview", name: "Project overview", hint: "Title, about, stack table, stickies, roles", paper: "sheet", build: () => blocks(
    header("Project name"),
    (k) => { k.section(110, 180, 400, 230, "About"); k.text(130, 266, "One or two lines on what it is", { fs: 16 }); k.text(130, 294, "and who it is for.", { fs: 16 }); },
    (k) => { k.section(540, 180, 380, 230, "Stack"); k.matrix(560, 240, ["Part", "Tools"], [80, 260], [["Front", ""], ["Back", ""], ["DB", ""]]); },
    (k) => k.sticky(960, 170, 340, 170, COL.yellow, "Who uses it?", ["👀 Reader – …", "✍️ User – …", "🔑 Admin – …"]),
    (k) => k.sticky(960, 380, 340, 170, COL.mint, "Added this round", ["★ …", "★ …", "★ …"], 1.2),
    (k) => { k.section(110, 440, 810, 250, "Features (what it does)"); k.bullets(134, 530, ["Feature one", "Feature two", "Feature three"]); k.bullets(530, 530, ["Feature four", "Feature five", "Feature six"]); },
    (k) => { k.text(110, 760, "Roles →", { fs: 18, c: COL.grey }); [[260, "Reader", COL.grey], [480, "User", COL.blue], [700, "Moderator", COL.green], [920, "Admin", COL.red]].forEach(([x, n, c], i) => { k.stickman(x as number, 780, n as string, c as string); if (i < 3) k.arrow((x as number) + 50, 826, (x as number) + 170, 826, { w: 2 }); }); },
  ) },
  { id: "errors", name: "Errors & fixes", hint: "Two numbered tables with pattern notes", paper: "sheet", build: () => blocks(
    header("Errors we found 🐞"),
    (k) => { k.section(110, 190, 560, 520, "Round 1 – first review", COL.red); k.numbered(132, 260, 516, ["", "", "", "", "", "", ""]); k.sticky(132, 590, 516, 80, COL.pink, "", ["Pattern: …"], 0.5); },
    (k) => { k.section(720, 190, 560, 520, "Round 2 – new this round", COL.blue); k.numbered(742, 260, 516, ["", "", "", "", "", "", ""], 8); k.sticky(742, 590, 516, 80, COL.sky, "", ["Pattern: …"], -0.5); },
  ) },
  { id: "flow", name: "End-to-end flow", hint: "Swimlanes with cards and arrows", paper: "sheet", build: () => blocks(
    header("End to end: a request's life 🗺️"),
    (k) => {
      [["Reader", "auto"], ["User", COL.blue], ["Moderator", COL.green], ["Admin", COL.red]].forEach(([l, c], i) => k.lane(110, 190 + i * 150, 1180, 136, l, c));
      k.card(260, 240, 150, 40, COL.yellow, "1 Search"); k.card(470, 240, 150, 40, COL.yellow, "2 Open page"); k.arrow(412, 260, 466, 260);
      k.card(260, 390, 150, 40, COL.sky, "3 Sign in"); k.card(470, 390, 170, 40, COL.sky, "4 Write"); k.card(700, 390, 150, 40, COL.peach, "5 PENDING", { bold: true });
      k.arrow(412, 410, 466, 410); k.arrow(642, 410, 696, 410); k.arrow(545, 282, 340, 386, { c: COL.blue, dash: true });
      k.card(700, 540, 170, 40, COL.yellow, "6 Review"); k.card(940, 540, 170, 40, COL.pink, "Reject"); k.card(1110, 470, 150, 40, COL.mint, "Approve");
      k.arrow(775, 432, 775, 536); k.arrow(872, 560, 936, 560, { c: COL.red }); k.arrow(872, 548, 1106, 494, { c: COL.green });
      k.card(260, 690, 190, 40, COL.peach, "Add / archive"); k.card(490, 690, 190, 40, COL.peach, "Users: suspend"); k.card(720, 690, 190, 40, COL.sky, "Audit trail");
    },
    (k) => k.sticky(110, 820, 560, 70, COL.pink, "", ["Edit after approval? It goes back to PENDING."], 0.4),
    (k) => k.sticky(720, 820, 560, 70, COL.sky, "", ["Guard-rails: limits, ownership, rate limits."], -0.4),
  ) },
  { id: "status", name: "Status map", hint: "States, who-can-see table, notes", paper: "sheet", build: () => blocks(
    header("Review visibility 👁️"),
    (k) => {
      k.card(110, 200, 170, 50, COL.peach, "PENDING", { fs: 19 }); k.card(410, 200, 190, 50, COL.mint, "PUBLISHED", { fs: 19 }); k.card(740, 200, 170, 50, COL.pink, "HIDDEN", { fs: 19 });
      k.card(110, 340, 190, 50, COL.sky, "CHANGES_REQ", { fs: 19 }); k.card(410, 340, 170, 50, COL.stone, "REJECTED", { fs: 19 }); k.card(740, 340, 170, 50, COL.stone, "DELETED", { fs: 19 });
      k.arrow(282, 225, 406, 225, { c: COL.green }); k.arrow(602, 218, 736, 218, { c: COL.red }); k.arrow(736, 236, 602, 236, { c: COL.green });
      k.arrow(150, 252, 150, 336, { c: COL.blue }); k.arrow(240, 252, 450, 336, { c: COL.red }); k.arrow(520, 252, 780, 336, { dash: true });
    },
    (k) => k.sticky(960, 190, 330, 110, COL.yellow, "Only PUBLISHED is public.", ["Everything else stays out of search."]),
    (k) => { k.section(110, 430, 800, 330, "Who can see it?"); k.matrix(132, 500, ["Status", "Public", "Author", "Admin"], [220, 150, 200, 200], [["PENDING", false, true, true], ["PUBLISHED", true, true, true], ["REJECTED", false, true, true], ["HIDDEN", false, true, true], ["DELETED", false, false, false]]); },
    (k) => { k.section(950, 340, 340, 420, "What the public sees"); k.bullets(972, 420, ["Name or anonymous", "Story, rating", "Date", "Never: email, IDs"], 34); },
  ) },
  { id: "matrix", name: "Who can do what", hint: "Big permission matrix + three notes", paper: "sheet", build: () => blocks(
    header("Who can do what 🔑"),
    (k) => { k.box(110, 190, 1180, 470, { sk: 1.1, w: 2 }); k.matrix(130, 210, ["Ability", "Reader", "User", "Mod", "Admin", "Route"], [300, 90, 90, 90, 90, 480], [["Browse", true, true, true, true, "GET /items"], ["Write / edit own", false, true, true, true, "POST /items"], ["Report", false, true, true, true, "POST /reports"], ["Moderate", false, false, true, true, "POST /admin/decision"], ["Manage users", false, false, false, true, "/admin/users"], ["Audit trail", false, false, false, true, "GET /admin/audit"]]); },
    (k) => k.sticky(110, 700, 380, 100, COL.yellow, "", ["Locked on the server:", "guards on every admin route."], -0.6),
    (k) => k.sticky(520, 700, 380, 100, COL.pink, "", ["Admin limits: can't suspend", "self or another admin."], 0.6),
    (k) => k.sticky(930, 700, 360, 100, COL.sky, "", ["Not built yet: …"], -0.4),
  ) },
  { id: "pipeline", name: "Request pipeline", hint: "Numbered steps, error path, example", paper: "sheet", build: () => blocks(
    header("One request, start to finish 🔄"),
    (k) => {
      ["Browser", "Next.js", "1 CSRF", "2 Session", "3 Rate limit", "4 Validate", "5 Controller"].forEach((s, i) => { const x = 110 + i * 170; k.box(x, 200, 140, 80); k.text(x + 14, 236, s, { fs: 22, bold: true, font: "script" }); k.text(x + 14, 264, "…", { fs: 13, c: COL.grey }); if (i < 6) k.arrow(x + 142, 240, x + 168, 240); });
      ["6 Use case", "7 Unit of work", "8 Database"].forEach((s, i) => { const x = 1130 - i * 230; k.box(x, 350, 160, 80); k.text(x + 14, 386, s, { fs: 22, bold: true, font: "script" }); if (i < 2) k.arrow(x - 4, 390, x - 66, 390); });
      k.arrow(1200, 282, 1200, 346); k.arrow(560, 390, 300, 390); k.box(110, 350, 180, 80); k.text(124, 386, "9 JSON back", { fs: 22, bold: true, font: "script" });
      k.text(150, 480, "Error path: any step can fail → clear error code + message", { fs: 15, c: COL.red });
    },
    (k) => { k.section(110, 520, 700, 300, "Example: POST /items"); k.text(130, 600, "1. Page sends JSON + cookie\n2. Guard checks the session\n3. Validation passes\n4. Saved in one transaction\n5. Response { data }", { fs: 16 }); },
    (k) => k.sticky(860, 540, 430, 120, COL.yellow, "Why it matters", ["Guards run before any code", "touches data."]),
    (k) => k.sticky(860, 700, 430, 90, COL.sky, "", ["Same pipeline for every route."], 0.6),
  ) },
  { id: "lecture", name: "Lecture notes", hint: "Cornell-style cues, notes, summary", paper: "sheet", build: () => blocks(
    header("Lecture: topic"),
    (k) => { k.section(110, 190, 300, 560, "Cues", COL.blue); k.bullets(132, 270, ["Question?", "Key term", "Formula"], 40, "?", COL.blue); },
    (k) => { k.section(440, 190, 850, 560, "Notes"); k.bullets(462, 270, ["Main point", "Detail", "Example"]); },
    (k) => k.sticky(110, 790, 1180, 100, COL.yellow, "Summary", ["In one or two sentences…"], -0.3),
  ) },
  { id: "week", name: "Week plan", hint: "Seven day boxes and a notes sticky", paper: "sheet", build: () => blocks(
    header("This week", "week of …"),
    (k) => { ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend"].forEach((d, i) => { const x = 110 + (i % 3) * 400, y = 190 + Math.floor(i / 3) * 300; k.section(x, y, 370, 270, d, [COL.red, COL.orange, COL.green, COL.blue, "#7c3aed", COL.grey][i]); }); },
    (k) => k.sticky(110, 800, 560, 110, COL.yellow, "Top 3 this week", ["1.", "2.", "3."]),
    (k) => k.sticky(720, 800, 560, 110, COL.mint, "Done ✔", [""], 1),
  ) },
];
