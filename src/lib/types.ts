export type Pt = [number, number];

export type ElType = "pen" | "hl" | "line" | "arrow" | "rect" | "ellipse" | "text" | "axes" | "plot" | "diamond" | "triangle" | "cube" | "poly";

// One drawing object on a canvas note. Coordinates are in world space.
export type El = {
  id: string;
  t: ElType;
  x: number; y: number; x2?: number; y2?: number; // bounds / endpoints
  pts?: Pt[];                                      // pen, hl
  c: string;                                       // colour, "auto" = follows theme
  w: number;                                       // stroke width
  text?: string; fs?: number;                      // text
  expr?: string;
  dx?: number; dy?: number;                        // cube: depth offset of the back face
  head?: boolean;                                  // pen: draw an arrowhead at the end (curved arrow)                                   // plot: "sin(x); x^2/9 @ -6..6"
};

export type Note = {
  id: string;
  kind: "doc" | "canvas";
  title: string;
  body: string;
  drawing?: El[];
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
  font: "sans" | "serif" | "mono";
  fontSize: number;
};

export const defaultSettings: Settings = { theme: "system", accent: "#6366f1", font: "sans", fontSize: 16 };
