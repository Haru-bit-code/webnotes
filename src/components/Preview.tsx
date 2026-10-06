"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { Note } from "@/lib/types";

const mermaidCache = new Map<string, string>(); // theme + source → rendered SVG
const lastSvg = new Map<string, string>(); // theme + diagram position → last good SVG
let mermaidQueue: Promise<void> = Promise.resolve();

export function Preview({ body, notes = [], onOpenNote, className = "" }: { body: string; notes?: Note[]; onOpenNote?: (id: string) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(body, notes) || '<p class="muted">Nothing to preview</p>', [body, notes]);

  // Every edit replaces the preview's HTML, which resets diagrams to their raw source until mermaid has re-rendered them.
  // So: put back cached SVGs before paint, show the previous diagram while a changed one re-renders, and serialise renders.
  useLayoutEffect(() => {
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>("pre.mermaid") ?? []);
    if (!nodes.length) return;
    const dark = document.documentElement.classList.contains("dark");
    const todo: { n: HTMLElement; src: string; i: number }[] = [];
    nodes.forEach((n, i) => {
      const src = n.textContent || "", hit = mermaidCache.get((dark ? "d:" : "l:") + src);
      if (hit) { n.innerHTML = hit; n.classList.add("rendered"); }
      else {
        const stale = lastSvg.get(i + (dark ? "d" : "l"));
        if (stale) { n.innerHTML = stale; n.classList.add("rendered", "stale"); }
        todo.push({ n, src, i });
      }
    });
    if (!todo.length) return;
    let cancelled = false;
    const t = setTimeout(() => {
      mermaidQueue = mermaidQueue.then(async () => {
        if (cancelled) return;
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict", suppressErrorRendering: true });
        for (const { n, src, i } of todo) {
          if (cancelled) return;
          let id = "";
          try {
            id = "m" + Math.random().toString(36).slice(2);
            const { svg } = await mermaid.render(id, src);
            if (mermaidCache.size > 60) mermaidCache.delete(mermaidCache.keys().next().value!); mermaidCache.set((dark ? "d:" : "l:") + src, svg); lastSvg.set(i + (dark ? "d" : "l"), svg);
            if (!cancelled) { n.innerHTML = svg; n.classList.add("rendered"); n.classList.remove("stale"); }
          } catch (e) {
            // mermaid may leave a stray error graphic in <body>; remove it
            document.getElementById("d" + id)?.remove(); document.getElementById(id)?.remove();
            const l = (e as Error).message.split("\n").filter(Boolean), msg = l.length > 1 ? l[0] + " " + l.at(-1) : l[0];
            if (!cancelled) {
              const err = document.createElement("div"); err.className = "blk-err"; err.textContent = "Diagram error: " + msg;
              if (n.classList.contains("rendered")) n.prepend(err); // keep the last good diagram visible underneath
              else { n.classList.add("blk-err"); n.textContent = err.textContent; }
            }
          }
        }
      });
    }, 400); // debounce while typing
    return () => { cancelled = true; clearTimeout(t); };
  }, [html]);

  return <div ref={ref} className={`md ${className}`}
    onClick={(e) => { const id = (e.target as HTMLElement).closest<HTMLElement>("[data-sketch-id]")?.dataset.sketchId; if (id) onOpenNote?.(id); }} dangerouslySetInnerHTML={{ __html: html }} />;
}
