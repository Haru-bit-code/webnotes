// One catalogue for everything you can start from or drop in, sorted into a few groups so it's easy to find:
// whole pages (planners, notes, journals, …), blocks to drop onto a page (tables, lists, charts, …) and stickers.
import { KIT_PAGES, KitPage } from "./kits";
import { Category } from "./stamps";

export type PageGroup = "Notes & paper" | "Planners" | "Work & meetings" | "Study & research" | "Journal & life" | "Reports & money" | "Creative";
export const PAGE_GROUPS: PageGroup[] = ["Planners", "Notes & paper", "Work & meetings", "Study & research", "Journal & life", "Reports & money", "Creative"];

// the template kit's own categories, folded into the groups above
const KIT_GROUP: Record<string, PageGroup> = {
  "Classic Notes": "Notes & paper", "Visual Notes and Diagrams": "Notes & paper",
  "Planning": "Planners", "Project Management": "Planners",
  "Work & Productivity": "Work & meetings", "Meetings and Collaboration": "Work & meetings", "Executive and Strategy": "Work & meetings",
  "Product and Design": "Work & meetings", "Marketing and Communication": "Work & meetings", "Presentation Visuals": "Work & meetings",
  "Study & Learning": "Study & research", "Research and Education": "Study & research",
  "Journaling": "Journal & life", "Wellness": "Journal & life", "Personal & Home": "Journal & life", "Social & Memories": "Journal & life",
  "Analytics and Reporting": "Reports & money", "Finance and Operations": "Reports & money",
  "Creative Doodle": "Creative", "Decorative Pages": "Creative",
};
export const kitGroup = (p: KitPage): PageGroup => KIT_GROUP[p.cat] ?? "Notes & paper";
// the hand-drawn page layouts (lib/pages.ts), by id
export const LAYOUT_GROUP: Record<string, PageGroup> = {
  meeting: "Work & meetings", lecture: "Study & research", revision: "Study & research", project: "Planners", brainstorm: "Creative",
  decision: "Work & meetings", week: "Planners", journal: "Journal & life", book: "Study & research", issues: "Work & meetings",
};
export const pagesIn = (g: PageGroup | "All") => KIT_PAGES.filter((p) => g === "All" || kitGroup(p) === g);

// blocks dropped onto a page (lib/stamps.ts categories), under friendlier names
export type BlockGroup = "Tables" | "Lists & lines" | "Planners" | "Study" | "Charts & maths" | "Diagrams" | "Hand-drawn";
export const BLOCK_GROUPS: BlockGroup[] = ["Tables", "Lists & lines", "Planners", "Study", "Charts & maths", "Diagrams", "Hand-drawn"];
export const blockGroup = (c: Category): BlockGroup =>
  c === "Lines & lists" ? "Lists & lines" : c === "Planning" ? "Planners" : c === "Charts" || c === "Maths & science" ? "Charts & maths" : c === "Sketch" ? "Hand-drawn" : (c as BlockGroup);

/** does a template match what was typed in the search box (every word, anywhere in its name or group) */
export const matches = (q: string, ...fields: string[]) => {
  const hay = fields.join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};
