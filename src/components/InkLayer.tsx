"use client";
// Scribble layer over a text note (Notability / OneNote "Draw" style).
// Strokes are stored in note.ink, in pixels relative to the top-left of the rendered note.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { El, Pt } from "@/lib/types";
import { Shape } from "./Canvas";
import { Icon } from "./Icon";

type Tool = "pen" | "hl" | "eraser";
const COLORS = ["auto", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#a855f7"];
const SIZES = [2, 3.5, 6];
const uid = () => Math.random().toString(36).slice(2, 10);

export function InkLayer({ ink, active, onChange, toolbarSlot, children }: {
  ink: El[]; active: boolean; onChange: (ink: El[]) => void; toolbarSlot: HTMLElement | null; children: React.ReactNode;
}) {
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("auto");
  const [size, setSize] = useState(1);
  const [penOnly, setPenOnly] = useState(false);
  const [draft, setDraft] = useState<El | null>(null);
  const [els, setEls] = useState(ink);
  const past = useRef<El[][]>([]), future = useRef<El[][]>([]);
  const elsRef = useRef(els); elsRef.current = els;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<null | { mode: "draw" | "erase" | "scroll"; snap: El[]; y?: number }>(null);
  const touches = useRef(new Map<number, number>());
  const stab = useRef<Pt>([0, 0]);

  useEffect(() => { setEls(ink); }, [ink]);

  const commit = (next: El[], prev = elsRef.current) => { past.current.push(prev); future.current = []; setEls(next); onChange(next); };
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(elsRef.current); setEls(p); onChange(p); };
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(elsRef.current); setEls(n); onChange(n); };

  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName; if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });

  const local = (e: React.PointerEvent): Pt => { const r = svgRef.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const scroller = () => svgRef.current?.closest(".reading") as HTMLElement | null;
  const eraseAt = (cx: number, cy: number) => {
    const id = (document.elementFromPoint(cx, cy)?.closest("[data-ink]") as HTMLElement | null)?.dataset.ink;
    if (id) setEls((cur) => cur.filter((x) => x.id !== id));
  };

  const onDown = (e: React.PointerEvent) => {
    if (!active) return;
    if (e.pointerType === "pen" && !penOnly) setPenOnly(true);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, e.clientY);
      // fingers scroll when a stylus is in use, and two fingers always scroll
      if (penOnly || touches.current.size > 1) { setDraft(null); drag.current = { mode: "scroll", snap: elsRef.current, y: e.clientY }; return; }
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (tool === "eraser") { drag.current = { mode: "erase", snap: elsRef.current }; eraseAt(e.clientX, e.clientY); return; }
    const p = local(e); stab.current = p;
    setDraft({ id: uid(), t: tool, x: p[0], y: p[1], pts: [p], c: tool === "hl" && color === "auto" ? "#facc15" : color, w: tool === "hl" ? SIZES[size] * 5 : SIZES[size] });
    drag.current = { mode: "draw", snap: elsRef.current };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (d.mode === "scroll") {
      const sc = scroller(); if (sc && d.y !== undefined) { sc.scrollTop -= e.clientY - d.y; d.y = e.clientY; }
      return;
    }
    if (d.mode === "erase") { eraseAt(e.clientX, e.clientY); return; }
    const p = local(e);
    const q: Pt = [stab.current[0] + (p[0] - stab.current[0]) * 0.55, stab.current[1] + (p[1] - stab.current[1]) * 0.55];
    stab.current = q;
    setDraft((dr) => (dr ? { ...dr, pts: [...dr.pts!, q] } : dr));
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") touches.current.delete(e.pointerId);
    const d = drag.current; drag.current = null; if (!d) return;
    if (d.mode === "erase") { if (elsRef.current.length !== d.snap.length) { past.current.push(d.snap); future.current = []; onChange(elsRef.current); } return; }
    if (d.mode === "draw" && draft) { commit([...elsRef.current, draft]); setDraft(null); }
  };

  const extent = els.reduce((m, e) => Math.max(m, ...(e.pts ?? []).map((p) => p[1])), 0);

  const toolbar = active && toolbarSlot ? createPortal(
    <div className="ink-bar" role="toolbar" aria-label="Scribble tools">
      <div className="seg">
        {([["pen", "pen", "Pen"], ["hl", "highlighter", "Highlighter"], ["eraser", "eraser", "Eraser"]] as [Tool, string, string][]).map(([t, ic, l]) => (
          <button key={t} role="radio" aria-checked={tool === t} className={tool === t ? "on" : ""} onClick={() => setTool(t)} title={l}><Icon name={ic} /><span className="hidden sm:inline">&nbsp;{l}</span></button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {COLORS.map((c) => <button key={c} aria-label={`Colour ${c}`} aria-pressed={color === c} className={`cdot ${color === c ? "on" : ""}`} style={{ background: c === "auto" ? "var(--text)" : c }} onClick={() => { setColor(c); if (tool === "eraser") setTool("pen"); }} />)}
      </div>
      <div className="seg" aria-label="Size">
        {SIZES.map((s, i) => <button key={s} role="radio" aria-checked={size === i} aria-label={["Fine", "Medium", "Bold"][i]} className={size === i ? "on" : ""} onClick={() => setSize(i)}><span className="size-dot" style={{ width: 3 + i * 3, height: 3 + i * 3 }} /></button>)}
      </div>
      <span className="flex-1" />
      <label className="ink-check" title="Fingers scroll; only a stylus draws. Turns on by itself when a stylus is used."><input type="checkbox" checked={penOnly} onChange={() => setPenOnly((v) => !v)} /> Stylus only</label>
      <button className="btn icon-btn ghost" aria-label="Undo" title="Undo" onClick={undo}><Icon name="undo" /></button>
      <button className="btn icon-btn ghost" aria-label="Redo" title="Redo" onClick={redo}><Icon name="redo" /></button>
      <button className="btn ghost" disabled={!els.length} onClick={() => confirm("Remove all scribbles from this note?") && commit([])}>Clear</button>
    </div>, toolbarSlot) : null;

  return (
    <div className={`ink-wrap ${active ? "inking" : ""}`} style={{ minHeight: active ? `max(${extent + 240}px, calc(100dvh - 260px))` : extent + 24 }}>
      {children}
      {(active || els.length > 0) && (
        <svg ref={svgRef} className="ink-svg" style={{ pointerEvents: active ? "auto" : "none", cursor: active ? (tool === "eraser" ? "cell" : "crosshair") : undefined }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {els.map((e) => <g key={e.id} data-ink={e.id}><Shape e={e} /></g>)}
          {draft && <Shape e={draft} />}
        </svg>
      )}
      {toolbar}
    </div>
  );
}
