"use client";
// Note types and the conversions between them.
import DOMPurify from "dompurify";
import { Note, NoteFormat, Sheet } from "./types";
import { renderMarkdown } from "./markdown";
import { blankSheet, evaluateSheet, sheetsText } from "./sheet";

export const FORMATS: { id: NoteFormat | "scribble"; label: string; hint: string; icon: string }[] = [
  { id: "rich", label: "Document", hint: "Rich text like Word: headings, bold, lists, tables, images", icon: "notes" },
  { id: "markdown", label: "Markdown", hint: "Text with # and ** marks, maths, diagrams, charts", icon: "text" },
  { id: "text", label: "Plain text", hint: "Just text, no formatting", icon: "file" },
  { id: "code", label: "Code", hint: "Source code with syntax highlighting", icon: "code" },
  { id: "sheet", label: "Spreadsheet", hint: "Rows and columns with formulas like =SUM(A1:A5)", icon: "grid" },
  { id: "scribble", label: "Scribble page", hint: "Draw, write by hand, templates", icon: "scribble" },
];
export const formatOf = (n: Pick<Note, "kind" | "format">): NoteFormat | "scribble" => (n.kind === "canvas" ? "scribble" : n.format ?? "markdown");
export const formatLabel = (n: Pick<Note, "kind" | "format" | "lang">) => {
  const f = formatOf(n); const l = FORMATS.find((x) => x.id === f)!.label;
  return f === "code" && n.lang ? `${l} · ${n.lang}` : l;
};

export const LANGS = ["plaintext", "javascript", "typescript", "python", "java", "c", "cpp", "csharp", "go", "rust", "ruby", "php", "bash", "sql", "html", "css", "json", "yaml", "xml", "markdown", "kotlin", "swift", "r"];
export const LANG_EXT: Record<string, string> = { plaintext: "txt", javascript: "js", typescript: "ts", python: "py", java: "java", c: "c", cpp: "cpp", csharp: "cs", go: "go", rust: "rs", ruby: "rb", php: "php", bash: "sh", sql: "sql", html: "html", css: "css", json: "json", yaml: "yaml", xml: "xml", markdown: "md", kotlin: "kt", swift: "swift", r: "r", tsx: "tsx", jsx: "jsx", scss: "scss", toml: "toml", ini: "ini", lua: "lua", dart: "dart", matlab: "m" };

/** rich text: keep safe formatting only (alignment and colours survive); stored images keep their asset id */
let richMode = false, hooked = false;
const KEEP_CSS = /^(text-align|color|background-color)$/;
export function cleanHtml(html: string) {
  if (!hooked) {
    DOMPurify.addHook("uponSanitizeAttribute", (_n, data) => {
      if (!richMode || data.attrName !== "style") return;
      data.attrValue = data.attrValue.split(";").map((d) => d.trim()).filter((d) => KEEP_CSS.test(d.split(":")[0]?.trim().toLowerCase() ?? "")).join("; ");
      if (!data.attrValue) data.keepAttr = false;
    });
    hooked = true;
  }
  richMode = true;
  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button", "object", "embed", "meta", "link"],
      FORBID_ATTR: ["class", "id"], ADD_ATTR: ["data-asset", "data-checked", "target"],
    }).replace(/<p>\s*<\/p>/g, "");
  } finally { richMode = false; }
}
export function htmlText(html: string) {
  const d = document.createElement("div"); d.innerHTML = html;
  d.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  d.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre").forEach((b) => b.append("\n"));
  d.querySelectorAll("td,th").forEach((c) => c.append("\t"));
  return (d.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---- tables in other formats → sheet rows ---- */
function mdTables(md: string): string[][][] {
  const out: string[][][] = []; let cur: string[][] | null = null;
  for (const line of md.split("\n")) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-")) continue; // separator row
      (cur ??= []).push(line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\\\|/g, "|")));
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}
function htmlTables(html: string): string[][][] {
  const d = document.createElement("div"); d.innerHTML = html;
  return Array.from(d.querySelectorAll("table")).map((t) => Array.from(t.querySelectorAll("tr")).map((tr) => Array.from(tr.querySelectorAll("td,th")).map((c) => (c.textContent ?? "").trim())));
}
const pad = (rows: string[][], minRows = 20, minCols = 8) => {
  const w = Math.max(minCols, ...rows.map((r) => r.length)), h = Math.max(minRows, rows.length + 5);
  return Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, c) => rows[r]?.[c] ?? ""));
};

export function sheetsToMd(sheets: Sheet[]) {
  return sheets.map((s) => {
    const vals = evaluateSheet(s).filter((r) => r.some((c) => c.trim()));
    const w = Math.max(1, ...vals.map((r) => r.reduceRight((n, c, i) => (n || !c.trim() ? n : i + 1), 0)));
    if (!vals.length) return sheets.length > 1 ? `## ${s.name}\n\n_Empty sheet._` : "";
    const row = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => (r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
    return (sheets.length > 1 ? `## ${s.name}\n\n` : "") + [row(vals[0]), `| ${Array(w).fill("---").join(" | ")} |`, ...vals.slice(1).map(row)].join("\n");
  }).join("\n\n");
}
export function sheetsToHtml(sheets: Sheet[]) {
  return sheets.map((s) => {
    const vals = evaluateSheet(s).filter((r) => r.some((c) => c.trim()));
    if (!vals.length) return "";
    const w = Math.max(1, ...vals.map((r) => r.reduceRight((n, c, i) => (n || !c.trim() ? n : i + 1), 0)));
    const cells = (r: string[], tag: string) => Array.from({ length: w }, (_, i) => `<${tag}>${esc(r[i] ?? "")}</${tag}>`).join("");
    return (sheets.length > 1 ? `<h2>${esc(s.name)}</h2>` : "") + `<table><thead><tr>${cells(vals[0], "th")}</tr></thead><tbody>${vals.slice(1).map((r) => `<tr>${cells(r, "td")}</tr>`).join("")}</tbody></table>`;
  }).join("");
}

/** what changes when a note switches type; `lossy` explains anything that won't carry over */
export async function convertNote(n: Note, to: NoteFormat): Promise<{ patch: Partial<Note>; lossy?: string }> {
  const from = n.format ?? "markdown";
  if (from === to) return { patch: {} };
  const md = async () => {
    if (from === "rich") { const { htmlToMd } = await import("./importers"); return htmlToMd(n.html ?? ""); }
    if (from === "sheet") return sheetsToMd(n.sheets ?? []);
    if (from === "code") return "```" + (n.lang && n.lang !== "plaintext" ? n.lang : "") + "\n" + n.body + "\n```\n";
    return n.body;
  };
  const clear = { html: undefined, sheets: undefined } as Partial<Note>;
  switch (to) {
    case "markdown": return { patch: { ...clear, format: "markdown", body: await md() }, lossy: from === "rich" ? "Colours, underline and alignment are not kept in Markdown." : from === "sheet" ? "Formulas are replaced by their results." : undefined };
    case "rich": {
      if (from === "sheet") { const html = sheetsToHtml(n.sheets ?? []); return { patch: { ...clear, format: "rich", html, body: htmlText(html) }, lossy: "Formulas are replaced by their results." }; }
      const html = from === "markdown" ? cleanHtml(renderMarkdown(n.body)) : `<pre><code>${esc(n.body)}</code></pre>`;
      const asText = from === "text" ? n.body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") : html;
      return { patch: { ...clear, format: "rich", html: asText, body: htmlText(asText) }, lossy: from === "markdown" ? "Diagrams, charts and maths become fixed pictures and text." : undefined };
    }
    case "text": case "code": {
      const text = from === "rich" ? htmlText(n.html ?? "") : from === "sheet" ? sheetsText(n.sheets ?? []) : n.body;
      return { patch: { ...clear, format: to, body: text, ...(to === "code" ? { lang: n.lang ?? "plaintext" } : {}) }, lossy: from === "rich" || from === "markdown" ? "Formatting is removed." : from === "sheet" ? "The table becomes tab-separated text." : undefined };
    }
    case "sheet": {
      const tables = from === "rich" ? htmlTables(n.html ?? "") : from === "markdown" ? mdTables(n.body) : [];
      const sheets: Sheet[] = tables.length
        ? tables.map((t, i) => ({ name: `Sheet ${i + 1}`, rows: pad(t) }))
        : [{ name: "Sheet 1", rows: pad((from === "rich" ? htmlText(n.html ?? "") : n.body).split("\n").map((l) => l.includes("\t") ? l.split("\t") : l.includes(",") && from !== "markdown" ? l.split(",") : [l])) }];
      return { patch: { ...clear, format: "sheet", sheets, body: sheetsText(sheets) }, lossy: tables.length ? "Only the tables are kept; other text is dropped." : "Each line becomes a row." };
    }
  }
}

/** blank content for a new note of a type */
export function newNoteOf(f: NoteFormat): Partial<Note> {
  if (f === "sheet") { const s = [blankSheet()]; return { kind: "doc", format: "sheet", sheets: s, body: "" }; }
  if (f === "rich") return { kind: "doc", format: "rich", html: "", body: "" };
  if (f === "code") return { kind: "doc", format: "code", lang: "plaintext", body: "" };
  return { kind: "doc", format: f, body: "" };
}

/** add text (e.g. from the AI panel) to the end of a note of any type */
export function appendText(n: Note, text: string): Partial<Note> {
  const f = n.format ?? "markdown";
  if (f === "rich") { const html = (n.html ?? "") + cleanHtml(renderMarkdown(text)); return { html, body: htmlText(html) }; }
  if (f === "sheet") {
    const sheets = structuredClone(n.sheets ?? [blankSheet()]); const s = sheets[0];
    let r = s.rows.findLastIndex((row) => row.some((c) => c.trim())) + 1;
    for (const line of text.split("\n").filter((l) => l.trim())) { if (r >= s.rows.length) s.rows.push(Array(s.rows[0]?.length ?? 8).fill("")); s.rows[r++][0] = line.replace(/^[-*]\s+(\[[ x]\]\s+)?/, ""); }
    return { sheets, body: sheetsText(sheets) };
  }
  const b = n.body.replace(/\s*$/, ""), task = /^- \[[ x]\] /.test(text) && /(^|\n)- \[[ x]\] [^\n]*$/.test(b);
  return { body: b + (b ? (task ? "\n" : "\n\n") : "") + text + "\n" };
}
