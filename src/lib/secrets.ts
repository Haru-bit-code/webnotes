"use client";
// Finds API keys written inside notes, so Send & receive can hide them (or leave those notes out) before
// anything leaves the device. Two checks:
//  1. well-known key formats (Anthropic, OpenAI, OpenRouter, Google, Groq, Hugging Face, GitHub, AWS, xAI, Slack);
//  2. the exact keys saved in this device's AI settings, whatever their format.
import type { Note } from "./types";

const PATTERNS: [string, RegExp][] = [
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{20,}/g],
  ["OpenRouter key", /sk-or-v1-[A-Za-z0-9]{32,}/g],
  ["OpenAI key", /sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g],
  ["Google key", /AIza[0-9A-Za-z_-]{35}/g],
  ["Groq key", /gsk_[A-Za-z0-9]{40,}/g],
  ["xAI key", /xai-[A-Za-z0-9]{40,}/g],
  ["Hugging Face token", /hf_[A-Za-z0-9]{30,}/g],
  ["GitHub token", /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["Slack token", /xox[abprs]-[A-Za-z0-9-]{20,}/g],
];
export const REMOVED = "[API key removed]";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** keys saved in this device's AI settings (only used to recognise them in notes; never sent anywhere) */
function savedKeys(): string[] {
  try {
    const ai = JSON.parse(localStorage.getItem("webnotes:ai") || "{}") as { apiKey?: string; providers?: Record<string, { apiKey?: string }> };
    return [ai.apiKey, ...Object.values(ai.providers ?? {}).map((p) => p?.apiKey)].filter((k): k is string => typeof k === "string" && k.trim().length >= 12).map((k) => k.trim());
  } catch { return []; }
}

export type Found = { noteId: string; title: string; kinds: string[]; preview: string[] };
const hint = (k: string) => `${k.slice(0, 6)}…${k.slice(-3)}`;

function matchesIn(text: string, saved: string[]) {
  const out: { kind: string; key: string }[] = [];
  for (const k of saved) if (text.includes(k)) out.push({ kind: "Your saved AI key", key: k });
  for (const [kind, re] of PATTERNS) for (const m of text.matchAll(re)) if (!out.some((o) => o.key.includes(m[0]) || m[0].includes(o.key))) out.push({ kind, key: m[0] });
  return out;
}

/** notes that contain something that looks like an API key */
export function findSecrets(notes: Note[]): Found[] {
  const saved = savedKeys(), found: Found[] = [];
  for (const n of notes) {
    const m = matchesIn(JSON.stringify(n), saved);
    if (m.length) found.push({ noteId: n.id, title: n.title || "Untitled", kinds: [...new Set(m.map((x) => x.kind))], preview: [...new Set(m.map((x) => hint(x.key)))] });
  }
  return found;
}

/** a copy of the note with every key replaced by "[API key removed]" (title, text, documents, sheets, drawings) */
export function hideSecrets(n: Note): Note {
  let s = JSON.stringify(n);
  for (const k of savedKeys()) s = s.replace(new RegExp(esc(JSON.stringify(k).slice(1, -1)), "g"), REMOVED);
  for (const [, re] of PATTERNS) s = s.replace(re, REMOVED);
  return JSON.parse(s) as Note;
}
