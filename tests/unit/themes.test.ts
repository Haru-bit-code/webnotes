import { describe, expect, it } from "vitest";
import { THEMES, textOn } from "@/lib/themes";

describe("button text on the accent colour", () => {
  it("is dark on pale colours and white on deep ones", () => {
    expect(textOn("#fde047")).toBe("#111827"); // pale yellow
    expect(textOn("#a7f3d0")).toBe("#111827"); // mint
    expect(textOn("#6366f1")).toBe("#ffffff"); // indigo
    expect(textOn("#000000")).toBe("#ffffff");
  });
  it("every built-in theme keeps white button text readable (contrast ≥ 3:1)", () => {
    for (const t of THEMES) {
      const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(t.accent.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(1.05 / (L + 0.05), t.name).toBeGreaterThanOrEqual(3);
    }
  });
});
