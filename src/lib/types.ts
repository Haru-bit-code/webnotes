export type Pt = [number, number];

export type ElType = "pen" | "hl" | "line" | "arrow" | "rect" | "ellipse" | "text" | "axes" | "plot" | "diamond" | "triangle" | "cube" | "poly" | "path" | "image";

// One drawing object on a canvas note. Coordinates are in world space.
export type El = {
  id: string;
  t: ElType;
  x: number; y: number; x2?: number; y2?: number; // bounds / endpoints
  pts?: Pt[];                                      // pen, hl
  c: string;                                       // colour, "auto" = follows theme
  w: number;                                       // stroke width
  text?: string; fs?: number; lh?: number;  // lh: line spacing (text written on ruled lines)                      // text
  expr?: string;                                   // plot: "sin(x); x^2/9 @ -6..6"
  dx?: number; dy?: number;                        // cube: depth offset of the back face
  head?: boolean;                                  // pen: draw an arrowhead at the end (curved arrow)
  g?: string;                                      // group id: templates move/delete as one
  fill?: string;                                   // rect/ellipse/diamond fill ("accent" = tinted accent)
  sk?: number;                                     // hand-drawn roughness (0/undefined = clean lines)
  font?: "hand" | "script" | "mono";               // text: handwriting, script headings, code
  bold?: boolean;                                  // text
  dash?: boolean;                                  // dashed outline
  rot?: number; rc?: Pt;                           // rotation in degrees around rc (sticky notes)
  shadow?: boolean;                                // soft drop shadow (sticky notes)
  d?: string; ob?: [number, number, number, number]; // path: SVG path data and its own bounds (x, y, w, h)
  rx?: number;                                     // rect corner radius
  op?: number;                                     // opacity 0..1
  lock?: boolean;                                  // part of a page template background: not selectable
  src?: string;                                    // image: id of the file in the asset store
  pg?: [number, number, number];                   // imported PDF page: index, width and height in points
};

export type Paper = "blank" | "dots" | "grid" | "graph" | "ruled-narrow" | "ruled" | "ruled-wide" | "handwriting" | "cornell" | "isometric" | "music" | "sheet";

export type NoteFormat = "markdown" | "rich" | "text" | "code" | "sheet";
export type Sheet = { name: string; rows: string[][] };

export type Note = {
  id: string;
  kind: "doc" | "canvas";
  format?: NoteFormat;                             // text notes only; missing = markdown (older notes)
  html?: string;                                   // rich text content (body then holds its plain text)
  lang?: string;                                   // code notes: language
  sheets?: Sheet[];                                // spreadsheet notes (body then holds the values as text)
  title: string;
  body: string;
  drawing?: El[];
  paper?: Paper;                                   // canvas page background
  ink?: El[];                                      // scribble layer drawn over a text note
  folder: string;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  deletedAt?: number;                              // set = in the trash (purged after 30 days)
  createdAt: number;
  updatedAt: number;
};

export type Settings = {
  theme: "light" | "dark" | "system";
  accent: string;
  glass?: boolean;
  folders?: string[]; // folders made with "New folder" (they exist even while empty)
  glow?: [string, string]; // the two other colours of the background glow (from a theme preset)
  remoteImages?: boolean; // load pictures from the web without asking (default: ask)   // frosted-glass panels (false = solid)
  font: "sans" | "serif" | "mono" | "hand";
  newFormat?: NoteFormat;
  fontSize: number;
};

export const defaultSettings: Settings = { theme: "system", accent: "#6366f1", font: "sans", fontSize: 16 };
