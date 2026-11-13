import { describe, expect, it } from "vitest";
import { blankOf, cellAt, cellsOf, isTickBox, segsOf } from "../../src/lib/areas";
import type { El } from "../../src/lib/types";

const r = (x: number, y: number, w: number, h: number): El => ({ id: Math.random() + "", t: "rect", x, y, x2: x + w, y2: y + h, c: "auto", w: 1 });
const l = (x: number, y: number, x2: number, y2: number): El => ({ id: Math.random() + "", t: "line", x, y, x2, y2, c: "auto", w: 1 });

// a 3 × 4 table: outer box, two column lines, three row lines
const table = [r(0, 0, 360, 160), l(120, 0, 120, 160), l(240, 0, 240, 160), l(0, 40, 360, 40), l(0, 80, 360, 80), l(0, 120, 360, 120)];

describe("template writing areas", () => {
  it("finds the table cell under a tap", () => {
    expect(cellAt([150, 100], segsOf(table))).toEqual({ x: 120, y: 80, x2: 240, y2: 120 });
    expect(cellAt([10, 10], segsOf(table))).toEqual({ x: 0, y: 0, x2: 120, y2: 40 });
  });
  it("has no cell outside the template or between open lines", () => {
    expect(cellAt([400, 50], segsOf(table))).toBeNull();
    expect(cellAt([50, 50], segsOf([l(0, 40, 400, 40), l(0, 80, 400, 80)]))).toBeNull();
  });
  it("lists every cell in reading order", () => {
    const cells = cellsOf(segsOf(table));
    expect(cells).toHaveLength(12);
    expect(cells[0]).toEqual({ x: 0, y: 0, x2: 120, y2: 40 });
    expect(cells[1]).toEqual({ x: 120, y: 0, x2: 240, y2: 40 });
    expect(cells[11]).toEqual({ x: 240, y: 120, x2: 360, y2: 160 });
  });
  it("finds planner boxes inside a page", () => {
    const page = [r(0, 0, 1200, 1600), r(190, 285, 925, 94), r(190, 403, 925, 94)];
    expect(cellAt([600, 420], segsOf(page))).toEqual({ x: 190, y: 403, x2: 1115, y2: 497 });
    const slots = cellsOf(segsOf(page)).filter((c) => c.x === 190);
    expect(slots).toEqual([{ x: 190, y: 285, x2: 1115, y2: 379 }, { x: 190, y: 403, x2: 1115, y2: 497 }]); // not the gap between them
  });
  it("treats small squares as tick boxes", () => {
    expect(isTickBox({ x: 0, y: 8, x2: 20, y2: 28 })).toBe(true);
    expect(isTickBox({ x: 0, y: 0, x2: 120, y2: 40 })).toBe(false);
  });
  it("knows which template text is a blank to fill in", () => {
    expect(blankOf("…")).toBe("");
    expect(blankOf("Write here…")).toBe("");
    expect(blankOf("DATE: ___________________")).toBe("DATE: ");
    expect(blankOf("Definition: …")).toBe("Definition: ");
    expect(blankOf("☐ …")).toBe("☐ ");
    expect(blankOf("Header")).toBeNull();
    expect(blankOf("Daily Planner")).toBeNull();
  });
});
