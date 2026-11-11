import { describe, expect, it } from "vitest";
import { compileExpr } from "@/lib/expr";

describe("plot expressions (no eval)", () => {
  const at = (s: string, x: number) => compileExpr(s)(x);
  it("does the maths people type", () => {
    expect(at("sin(x)", Math.PI / 2)).toBeCloseTo(1);
    expect(at("y = 2x^2 + 3x - 1", 2)).toBe(13);
    expect(at("2^3^2", 0)).toBe(512);          // right-associative
    expect(at("-x^2", 3)).toBe(-9);            // minus binds looser than power
    expect(at("(x+1)(x-1)", 3)).toBe(8);       // implicit multiplication
    expect(at("2pi", 0)).toBeCloseTo(2 * Math.PI);
    expect(at("log(100) + ln(e)", 0)).toBe(3);
    expect(at("max(1, x, 3)", 5)).toBe(5);
    expect(at("sqrt x", 16)).toBe(4);
  });
  it("refuses anything that isn't maths", () => {
    for (const bad of ["alert(1)", "constructor", "Math.PI", "x;1", "fetch('/')"]) expect(() => compileExpr(bad)).toThrow();
  });
});
