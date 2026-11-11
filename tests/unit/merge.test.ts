import { describe, expect, it } from "vitest";
import { mergeNotes } from "@/lib/store";
import type { Note } from "@/lib/types";

const note = (id: string, updatedAt: number, body = "") => ({ id, kind: "doc", title: id, body, folder: "", tags: [], pinned: false, archived: false, createdAt: 1, updatedAt } as Note);

describe("merging notes between tabs", () => {
  it("keeps notes made in either tab", () => {
    const r = mergeNotes([note("a", 5)], [note("b", 6)], new Map(), {});
    expect(r.notes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
  it("takes the newer copy when only one side changed", () => {
    const base = new Map([["a", 5]]);
    const r = mergeNotes([note("a", 5, "old")], [note("a", 9, "new")], base, {});
    expect(r.notes).toHaveLength(1); expect(r.notes[0].body).toBe("new"); expect(r.conflicts).toBe(0);
  });
  it("keeps both versions when both sides changed the same note", () => {
    const base = new Map([["a", 5]]);
    const r = mergeNotes([note("a", 8, "mine")], [note("a", 9, "theirs")], base, {});
    expect(r.conflicts).toBe(1);
    expect(r.notes.map((n) => n.body).sort()).toEqual(["mine", "theirs"]);
    expect(r.notes.find((n) => n.body === "mine")!.title).toMatch(/conflict copy/);
  });
  it("does not bring back notes deleted for good", () => {
    const r = mergeNotes([note("a", 5)], [note("a", 5), note("b", 5)], new Map(), { b: Date.now() });
    expect(r.notes.map((n) => n.id)).toEqual(["a"]);
  });
});
