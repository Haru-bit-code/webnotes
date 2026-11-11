import { describe, expect, it } from "vitest";
import { FrameCollector, buildBundle, cleanCode, codeFromText, decrypt, encrypt, meetingId, newCode, packBundle, receiveLink, showCode, toFrames, unpackBundle } from "@/lib/transfer";
import type { Note } from "@/lib/types";

const note = (id: string, extra: Partial<Note> = {}) => ({ id, kind: "doc", title: "T " + id, body: "Body " + id, folder: "Physics", tags: [], pinned: false, archived: false, createdAt: 1, updatedAt: 2, ...extra } as Note);

describe("one-time codes", () => {
  it("are 12 easy-to-read characters, shown in groups of four", () => {
    const c = newCode(); expect(c).toMatch(/^[2-9A-HJKMNP-Z]{12}$/); expect(showCode(c)).toMatch(/^.{4}-.{4}-.{4}$/);
  });
  it("forgive typing: lower case, spaces, dashes", () => { expect(cleanCode("k7qf 2xmd-9pra")).toBe("K7QF2XMD9PRA"); });
  it("come back out of the QR link", () => {
    const c = newCode(), link = receiveLink(c, "https://notes-flax-ten-86.vercel.app");
    expect(link).toBe(`https://notes-flax-ten-86.vercel.app/#receive=${c}`); expect(codeFromText(link)).toBe(c);
    expect(receiveLink(c, "https://localhost")).toContain("notes-flax-ten-86.vercel.app"); // inside the Android app the link points at the website
  });
  it("give the same meeting address on both devices, unrelated to the code itself", async () => {
    const c = newCode(); expect(await meetingId(c)).toBe(await meetingId(c)); expect(await meetingId(c)).not.toContain(c);
  });
});

describe("encryption", () => {
  it("only the right code unlocks the data", async () => {
    const c = newCode(), data = new TextEncoder().encode("secret notes");
    const box = await encrypt(c, data);
    expect(new TextDecoder().decode(await decrypt(c, box))).toBe("secret notes");
    await expect(decrypt(newCode(), box)).rejects.toThrow(/couldn't be unlocked/);
  });
});

describe("what is sent", () => {
  it("carries the notes and folder names, and never AI keys or settings", async () => {
    localStorage.setItem("webnotes:ai", JSON.stringify({ providers: { anthropic: { apiKey: "sk-ant-SECRET-KEY" } } }));
    localStorage.setItem("webnotes:settings", JSON.stringify({ accent: "#123456" }));
    const b = await buildBundle([note("a"), note("b", { folder: "" })], true);
    const wire = new TextDecoder().decode(await unpackBundle(await packBundle(b)).then((x) => new TextEncoder().encode(JSON.stringify(x.head))));
    expect(wire).toContain("Body a"); expect(b.head.folders).toEqual(["Physics"]);
    expect(wire).not.toContain("sk-ant-SECRET-KEY"); expect(wire).not.toContain("apiKey"); expect(wire).not.toContain("#123456");
  });
});

describe("animated QR", () => {
  it("rebuilds the data from frames read in any order, with repeats", async () => {
    const big = new TextEncoder().encode("x".repeat(5000) + JSON.stringify([note("a"), note("b")]));
    const frames = toFrames(big); expect(frames.length).toBeGreaterThan(5);
    const col = new FrameCollector();
    const shuffled = [...frames, ...frames.slice(0, 3)].sort(() => Math.random() - 0.5);
    for (const f of shuffled) col.add(f);
    expect(col.complete).toBe(true); expect(Array.from(col.bytes())).toEqual(Array.from(big));
  });
  it("ignores QR codes that aren't part of a transfer", () => { expect(new FrameCollector().add("https://example.com")).toBe(false); });
});
