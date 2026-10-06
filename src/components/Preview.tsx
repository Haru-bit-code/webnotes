"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { Note } from "@/lib/types";

const mermaidCache = new Map<string, string>(); // theme + source → rendered SVG
const lastSvg = new Map<string, string>(); // theme + diagram position → last good SVG
let mermaidQueue: Promise<void> = Promise.resolve();
const srcOf = (n: HTMLElement) => (n.dataset.src ? decodeURIComponent(n.dataset.src) : n.textContent || "");

export function Preview({ body, notes = [], onOpenNote, onWikiLink, onToggleTask, className = "" }: { body: string; notes?: Note[]; onOpenNote?: (id: string) => void; onWikiLink?: (title: string) => void; onToggleTask?: (index: number) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(body, notes) || '<p class="muted">Nothing to preview</p>', [body, notes]);

  // Edits (and mode switches) can replace the preview's DOM, which resets diagrams to their raw source until mermaid has
  // re-rendered them. So after every commit: find diagram nodes we haven't handled yet, put back cached SVGs before paint,
  // show the previous diagram while a changed one re-renders, and render the rest one at a time.
  const handled = useRef(new WeakSet<HTMLElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<HTMLElement[]>([]);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLInputElement>("input[data-task]").forEach((c) => { c.disabled = !onToggleTask; });
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>("pre.mermaid") ?? []).filter((n) => !handled.current.has(n));
    if (!nodes.length) return;
    const dark = document.documentElement.classList.contains("dark"), th = dark ? "d" : "l";
    const all = Array.from(ref.current!.querySelectorAll<HTMLElement>("pre.mermaid"));
    nodes.forEach((n) => {
      handled.current.add(n);
      const src = srcOf(n), hit = mermaidCache.get(th + ":" + src);
      if (hit) { n.innerHTML = hit; n.classList.add("rendered"); return; }
      const stale = lastSvg.get(all.indexOf(n) + th);
      if (stale) { n.innerHTML = stale; n.classList.add("rendered", "stale"); }
      n.dataset.pending = "1"; pending.current.push(n);
    });
    if (!pending.current.length) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { // debounce while typing
      const todo = pending.current.filter((n) => n.isConnected); pending.current = [];
      mermaidQueue = mermaidQueue.then(async () => {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict", suppressErrorRendering: true });
        for (const n of todo) {
          if (!n.isConnected) continue;
          const src = srcOf(n);
          let id = "";
          try {
            id = "m" + Math.random().toString(36).slice(2);
            const { svg } = await mermaid.render(id, src);
            if (mermaidCache.size > 60) mermaidCache.delete(mermaidCache.keys().next().value!);
            mermaidCache.set(th + ":" + src, svg);
            const idx = Array.from(ref.current?.querySelectorAll("pre.mermaid") ?? []).indexOf(n); if (idx >= 0) lastSvg.set(idx + th, svg);
            if (n.isConnected) { n.innerHTML = svg; n.classList.add("rendered"); n.classList.remove("stale"); }
          } catch (e) {
            // mermaid may leave a stray error graphic in <body>; remove it
            document.getElementById("d" + id)?.remove(); document.getElementById(id)?.remove();
            const l = (e as Error).message.split("\n").filter(Boolean), msg = "Diagram error: " + (l.length > 1 ? l[0] + " " + l.at(-1) : l[0]);
            if (n.isConnected) {
              if (n.classList.contains("rendered")) { const err = document.createElement("div"); err.className = "blk-err"; err.textContent = msg; n.prepend(err); } // keep the last good diagram visible underneath
              else { n.classList.add("blk-err"); n.textContent = msg; }
            }
          }
        }
      }).catch(() => {}); // a failed import must not wedge the queue
    }, 400);
  });

  return <div ref={ref} className={`md ${className}`}
    onClick={(e) => {
      const el = e.target as HTMLElement;
      const wiki = el.closest<HTMLElement>("[data-wiki]")?.dataset.wiki;
      if (wiki) { e.preventDefault(); onWikiLink?.(decodeURIComponent(wiki)); return; }
      if (el instanceof HTMLInputElement && el.hasAttribute("data-task") && onToggleTask) {
        onToggleTask(Array.from(ref.current!.querySelectorAll("input[data-task]")).indexOf(el)); return;
      }
      const id = el.closest<HTMLElement>("[data-sketch-id]")?.dataset.sketchId; if (id) onOpenNote?.(id);
    }} dangerouslySetInnerHTML={{ __html: html }} />;
}
