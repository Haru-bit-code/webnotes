"use client";
import { useEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { Note } from "@/lib/types";

export function Preview({ body, notes = [], onOpenNote, className = "" }: { body: string; notes?: Note[]; onOpenNote?: (id: string) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(body, notes) || '<p class="muted">Nothing to preview</p>', [body, notes]);

  useEffect(() => {
    const nodes = ref.current?.querySelectorAll<HTMLElement>("pre.mermaid");
    if (!nodes?.length) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const mermaid = (await import("mermaid")).default;
      if (cancelled) return;
      const dark = document.documentElement.classList.contains("dark");
      mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict", suppressErrorRendering: true });
      for (const n of Array.from(nodes)) {
        let id = "";
        try {
          id = "m" + Math.random().toString(36).slice(2);
          const { svg } = await mermaid.render(id, n.textContent || "");
          if (!cancelled) { n.innerHTML = svg; n.classList.add("rendered"); }
        } catch (e) {
          // mermaid may leave a stray error graphic in <body>; remove it
          document.getElementById("d" + id)?.remove(); document.getElementById(id)?.remove();
          n.classList.add("blk-err"); n.textContent = "Diagram error: " + (() => { const l = (e as Error).message.split("\n").filter(Boolean); return l.length > 1 ? l[0] + " " + l.at(-1) : l[0]; })();
        }
      }
    }, 400); // debounce while typing
    return () => { cancelled = true; clearTimeout(t); };
  }, [html]);

  return <div ref={ref} className={`md ${className}`}
    onClick={(e) => { const id = (e.target as HTMLElement).closest<HTMLElement>("[data-sketch-id]")?.dataset.sketchId; if (id) onOpenNote?.(id); }} dangerouslySetInnerHTML={{ __html: html }} />;
}
