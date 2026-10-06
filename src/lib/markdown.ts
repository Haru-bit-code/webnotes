import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";
import { renderChart, renderPlot } from "./charts";
import { sketchHtml } from "./sketch";
import { Note } from "./types";

let ctxNotes: Note[] = [];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const marked = new Marked(
  markedKatex({ throwOnError: false, nonStandard: true }),
  {
    gfm: true,
    breaks: true,
    renderer: {
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
      if (n.tagName === "A") { n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener noreferrer"); }
    });
    hooked = true;
  }
  const html = marked.parse(src) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }, ADD_TAGS: ["clipPath"], ADD_ATTR: ["target", "clip-path", "data-sketch-id", "data-src"] });
}
