import { describe, expect, it } from "vitest";
import { findSecrets, hideSecrets, REMOVED } from "@/lib/secrets";
import type { Note } from "@/lib/types";

const note = (body: string, extra: Partial<Note> = {}) => ({ id: "n" + Math.random(), kind: "doc", title: "T", body, folder: "", tags: [], pinned: false, archived: false, createdAt: 1, updatedAt: 1, ...extra } as Note);
const KEYS = {
  anthropic: "sk-ant-api03-" + "A".repeat(40),
  openai: "sk-proj-" + "b1".repeat(24),
  google: "AIza" + "C".repeat(35),
  groq: "gsk_" + "d".repeat(52),
  github: "ghp_" + "E".repeat(36),
  hf: "hf_" + "f".repeat(34),
};

describe("API keys written in notes", () => {
  it("are found in every common format", () => {
    for (const [name, k] of Object.entries(KEYS)) expect(findSecrets([note(`my key is ${k} ok`)]), name).toHaveLength(1);
  });
  it("are found in documents, spreadsheets, drawings and titles", () => {
    expect(findSecrets([note("", { format: "rich", html: `<p>${KEYS.anthropic}</p>` })])).toHaveLength(1);
    expect(findSecrets([note("", { format: "sheet", sheets: [{ name: "S", rows: [["key", KEYS.openai]] }] })])).toHaveLength(1);
    expect(findSecrets([note("", { kind: "canvas", drawing: [{ id: "e", t: "text", x: 0, y: 0, c: "auto", w: 1, text: KEYS.google }] })])).toHaveLength(1);
    expect(findSecrets([note("x", { title: KEYS.groq })])).toHaveLength(1);
  });
  it("include the exact keys saved in this device's AI settings, whatever they look like", () => {
    localStorage.setItem("webnotes:ai", JSON.stringify({ providers: { openai: { apiKey: "custom-local-key-12345" } } }));
    expect(findSecrets([note("ollama uses custom-local-key-12345")])).toHaveLength(1);
    localStorage.removeItem("webnotes:ai");
  });
  it("leave ordinary writing alone", () => {
    expect(findSecrets([note("I use sk-learn for risk-assessment; my AIza note; ghp_short; task-ant-colony")])).toHaveLength(0);
  });
  it("are replaced in the copy that is sent, everything else unchanged", () => {
    const n = note(`before ${KEYS.anthropic} after`, { html: `<b>${KEYS.openai}</b>` });
    const h = hideSecrets(n);
    expect(h.body).toBe(`before ${REMOVED} after`); expect(h.html).toBe(`<b>${REMOVED}</b>`);
    expect(n.body).toContain(KEYS.anthropic); // the original note is untouched
    expect(JSON.stringify(h)).not.toMatch(/sk-ant|sk-proj/);
  });
});
