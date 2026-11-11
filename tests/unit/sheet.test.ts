import { describe, expect, it } from "vitest";
import { evaluateSheet, colName, sheetsText } from "@/lib/sheet";

const grid = (rows: string[][]) => evaluateSheet({ name: "S", rows });

describe("spreadsheet formulas", () => {
  it("adds up a range and follows edits", () => {
    expect(grid([["1"], ["2"], ["=SUM(A1:A2)"]])[2][0]).toBe("3");
    expect(grid([["10"], ["2"], ["=SUM(A1:A2)"]])[2][0]).toBe("12");
  });
  it("supports the listed functions and operators", () => {
    const v = grid([["2", "4", "=AVERAGE(A1:B1)", "=MAX(A1:B1)*2^2", "=ROUND(10/3, 2)", '=IF(A1>1, "big", "small")', '=A1&"x"']])[0];
    expect(v.slice(2)).toEqual(["3", "16", "3.33", "big", "2x"]);
  });
  it("shows clear errors", () => {
    expect(grid([["=1/0"]])[0][0]).toBe("#DIV/0");
    expect(grid([["=A1"]])[0][0]).toBe("#CYCLE");
    expect(grid([["=NOPE(1)"]])[0][0]).toBe("#NAME");
    expect(grid([["=1+"]])[0][0]).toBe("#SYNTAX");
  });
  it("names columns like a spreadsheet", () => { expect([0, 25, 26, 27, 701].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ"]); });
  it("gives searchable text with computed values", () => { expect(sheetsText([{ name: "S", rows: [["Total", "=2*3"]] }])).toBe("Total\t6"); });
});
