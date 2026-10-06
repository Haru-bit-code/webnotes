import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";
import { renderChart, renderPlot } from "./charts";
import { sketchHtml } from "./sketch";
import { Note } from "./types";

let ctxNotes: Note[] = [];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// [[Note title]] or [[Note title|shown text]] → link to another note (resolved by title when clicked)
const wikilink = {
  name: "wikilink", level: "inline" as const,
  start: (src: string) => src.indexOf("[["),
  tokenizer(src: string) {
    const m = /^\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/.exec(src);
    if (m) return { type: "wikilink", raw: m[0], target: m[1].trim(), text: (m[2] ?? m[1]).trim() };
  },
  renderer(t: { target: string; text: string }) {
    const found = ctxNotes.some((n) => n.title.trim().toLowerCase() === t.target.toLowerCase());
    return `<a href="#" class="wikilink${found ? "" : " missing"}" data-wiki="${encodeURIComponent(t.target)}" title="${found ? "Open note" : "No such note yet – click to create it"}">${esc(t.text)}</a>`;
  },
};

const marked = new Marked(
  markedKatex({ throwOnError: false, nonStandard: true }),
  { extensions: [wikilink] },
  {
    gfm: true,
    breaks: true,
    renderer: {
      checkbox({ checked }: { checked: boolean }) { return `<input type="checkbox" data-task${checked ? " checked" : ""}> `; },
      code({ text, lang }) {
        const l = (lang || "").trim().toLowerCase();
        if (l === "chart") return renderChart(text);
        if (l === "plot") return renderPlot(text);
        if (l === "sketch") return sketchHtml(text, ctxNotes);
        if (l === "mermaid") return `<pre class="mermaid" data-src="${encodeURIComponent(text)}">${esc(text)}</pre>`;
        const html = l && hljs.getLanguage(l) ? hljs.highlight(text, { language: l }).value : esc(text);
        return `<pre><code class="hljs">${html}</code></pre>`;
      },
    },
  }
);

let hooked = false;
export function renderMarkdown(src: string, notes: Note[] = []): string {
  ctxNotes = notes;
  if (!hooked) {
    DOMPurify.addHook("afterSanitizeAttributes", (n) => {
      if (n.tagName === "A" && n.hasAttribute("data-wiki")) return;
      if (n.tagName === "A") { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener noreferrer"); }
    });
    hooked = true;
  }
  const html = marked.parse(src) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }, ADD_TAGS: ["clipPath"], ADD_ATTR: ["target", "clip-path", "data-sketch-id", "data-src", "data-wiki", "data-task"] });
}

// Flip the n-th task-list checkbox ("- [ ]" / "- [x]") in the source, skipping fenced code blocks.
export function toggleTask(body: string, n: number): string {
  const lines = body.split("\n");
  let k = 0, fence = "";
  for (let i = 0; i < lines.length; i++) {
    const f = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (f) { fence = fence ? (lines[i].trim().startsWith(fence) ? "" : fence) : f[1]; continue; }
    if (fence) continue;
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(lines[i]);
    if (m && k++ === n) { lines[i] = m[1] + (m[2] === " " ? "x" : " ") + m[3] + lines[i].slice(m[0].length); break; }
  }
  return lines.join("\n");
}

// Notes whose text links to `title` with [[title]] or [[title|alias]]
export function backlinksTo(title: string, id: string, notes: Note[]): Note[] {
  const t = title.trim().toLowerCase();
  if (!t) return [];
  return notes.filter((n) => n.id !== id && n.kind === "doc" && !n.deletedAt &&
    [...n.body.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)].some((m) => m[1].trim().toLowerCase() === t));
}
