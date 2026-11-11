"use client";
// Spreadsheet notes: a grid of cells with formulas (=SUM(A1:A5), =B2*C2 …) and several sheets.
// Click a cell and type; Enter moves down, Tab moves right, arrows move, Delete clears,
// copy/paste works with other spreadsheet apps (tab-separated).
import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/lib/types";
import { blankSheet, cellName, colName, evaluateSheet } from "@/lib/sheet";
import { Icon } from "./Icon";

export function SheetEditor({ sheets, onChange }: { sheets: Sheet[]; onChange: (s: Sheet[]) => void }) {
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const [edit, setEdit] = useState<string | null>(null); // text being typed into the selected cell
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = sheets.length ? sheets : [blankSheet()];
  const sheet = list[Math.min(tab, list.length - 1)];
  const values = useMemo(() => evaluateSheet(sheet), [sheet]);
  const rows = sheet.rows.length, cols = Math.max(1, ...sheet.rows.map((r) => r.length));
  const raw = (r: number, c: number) => sheet.rows[r]?.[c] ?? "";

  const put = (fn: (s: Sheet) => Sheet) => onChange(list.map((s, i) => (i === Math.min(tab, list.length - 1) ? fn(structuredClone(s)) : s)));
  const setCell = (r: number, c: number, v: string) => put((s) => {
    while (s.rows.length <= r) s.rows.push(Array(cols).fill(""));
    s.rows.forEach((row) => { while (row.length < Math.max(cols, c + 1)) row.push(""); });
    s.rows[r][c] = v; return s;
  });
  const move = (dr: number, dc: number) => setSel(([r, c]) => {
    const nr = Math.max(0, r + dr), nc = Math.max(0, c + dc);
    if (nr >= rows || nc >= cols) put((s) => { while (s.rows.length <= nr) s.rows.push(Array(cols).fill("")); s.rows.forEach((row) => { while (row.length <= nc) row.push(""); }); return s; });
    return [nr, nc];
  });
  const commit = (dr = 0, dc = 0) => { if (edit !== null) setCell(sel[0], sel[1], edit); setEdit(null); if (dr || dc) move(dr, dc); gridRef.current?.focus(); };
  // blur caused by commit() handing focus back to the grid: already saved
  const onInputBlur = (e: React.FocusEvent) => { if (e.relatedTarget !== gridRef.current) commit(); };

  useEffect(() => { if (edit !== null) inputRef.current?.focus(); }, [edit === null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { gridRef.current?.querySelector(`[data-cell="${sel[0]}-${sel[1]}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [sel]);

  const onGridKey = (e: React.KeyboardEvent) => {
    if (edit !== null) { if (e.target === gridRef.current && e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setEdit((t) => (t ?? "") + e.key); } return; } // keys typed before the cell box got focus
    const mod = e.metaKey || e.ctrlKey;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[e.key]) { e.preventDefault(); move(...arrows[e.key]); }
    else if (e.key === "Enter") { e.preventDefault(); setEdit(raw(...sel)); }
    else if (e.key === "Tab") { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setCell(sel[0], sel[1], ""); }
    else if (e.key === "F2") { e.preventDefault(); setEdit(raw(...sel)); }
    else if (!mod && !e.altKey && e.key.length === 1) { e.preventDefault(); setEdit(e.key); }
  };
  const onCopy = (e: React.ClipboardEvent) => { if (edit !== null) return; e.preventDefault(); e.clipboardData.setData("text/plain", raw(...sel)); };
  const onPaste = (e: React.ClipboardEvent) => {
    if (edit !== null) return; e.preventDefault();
    const block = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    put((s) => {
      block.forEach((line, i) => line.forEach((v, j) => {
        const r = sel[0] + i, c = sel[1] + j;
        while (s.rows.length <= r) s.rows.push(Array(cols).fill(""));
        s.rows.forEach((row) => { while (row.length <= c) row.push(""); });
        s.rows[r][c] = v;
      }));
      return s;
    });
  };

  const addRow = () => put((s) => { s.rows.splice(sel[0] + 1, 0, Array(cols).fill("")); return s; });
  const addCol = () => put((s) => { s.rows.forEach((r) => r.splice(sel[1] + 1, 0, "")); return s; });
  const delRow = () => rows > 1 && put((s) => { s.rows.splice(sel[0], 1); return s; });
  const delCol = () => cols > 1 && put((s) => { s.rows.forEach((r) => r.splice(sel[1], 1)); return s; });
  const addSheet = () => { onChange([...list, blankSheet(`Sheet ${list.length + 1}`)]); setTab(list.length); setSel([0, 0]); };
  const renameSheet = (i: number) => { const n = prompt("Sheet name", list[i].name); if (n?.trim()) onChange(list.map((s, j) => (j === i ? { ...s, name: n.trim() } : s))); };
  const delSheet = (i: number) => { if (list.length > 1 && confirm(`Delete the sheet "${list[i].name}"?`)) { onChange(list.filter((_, j) => j !== i)); setTab(0); } };
  const isNum = (v: string) => v !== "" && !isNaN(Number(v));

  return (
    <div className="sheet">
      <div className="sheet-bar">
        <span className="sheet-ref">{cellName(...sel)}</span>
        <input className="field sheet-formula" aria-label={`Contents of ${cellName(...sel)}`} placeholder="Type a value, or a formula like =SUM(A1:A5)"
          value={edit ?? raw(...sel)} onFocus={() => edit === null && setEdit(raw(...sel))} onChange={(e) => setEdit(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(1, 0); } else if (e.key === "Escape") { setEdit(null); gridRef.current?.focus(); } }} onBlur={() => edit !== null && commit()} />
        <button className="btn" onClick={addRow} title="Insert a row below"><Icon name="plus" /> Row</button>
        <button className="btn" onClick={addCol} title="Insert a column to the right"><Icon name="plus" /> Column</button>
        <button className="btn ghost" onClick={delRow} title="Delete this row">− Row</button>
        <button className="btn ghost" onClick={delCol} title="Delete this column">− Column</button>
      </div>
      <div ref={gridRef} className="sheet-grid" tabIndex={0} role="grid" aria-label={sheet.name} onKeyDown={onGridKey} onCopy={onCopy} onPaste={onPaste}
        style={{ gridTemplateColumns: `48px repeat(${cols}, minmax(110px, 1fr))` }}>
        <div className="sheet-corner" />
        {Array.from({ length: cols }, (_, c) => <div key={c} className={`sheet-head ${c === sel[1] ? "on" : ""}`}>{colName(c)}</div>)}
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="contents" role="row">
            <div className={`sheet-head row ${r === sel[0] ? "on" : ""}`}>{r + 1}</div>
            {Array.from({ length: cols }, (_, c) => {
              const on = r === sel[0] && c === sel[1], v = values[r]?.[c] ?? "", err = v.startsWith("#") && raw(r, c).startsWith("=");
              return (
                <div key={c} data-cell={`${r}-${c}`} role="gridcell" aria-selected={on}
                  className={`sheet-cell ${on ? "on" : ""} ${r === 0 ? "first" : ""} ${isNum(v) ? "num" : ""} ${err ? "err" : ""}`}
                  onMouseDown={(e) => { if (on && edit !== null) return; e.preventDefault(); if (edit !== null) commit(); setSel([r, c]); gridRef.current?.focus(); }}
                  onDoubleClick={() => setEdit(raw(r, c))} title={raw(r, c).startsWith("=") ? raw(r, c) : undefined}>
                  {on && edit !== null
                    ? <input ref={inputRef} className="sheet-input" value={edit} aria-label={`Edit ${cellName(r, c)}`} onChange={(e) => setEdit(e.target.value)}
                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey ? -1 : 1, 0); } else if (e.key === "Tab") { e.preventDefault(); commit(0, e.shiftKey ? -1 : 1); } else if (e.key === "Escape") { setEdit(null); gridRef.current?.focus(); } }}
                        onBlur={onInputBlur} />
                    : v}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="sheet-tabs" role="tablist">
        {list.map((s, i) => (
          <button key={i} role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => { setTab(i); setSel([0, 0]); setEdit(null); }}
            onDoubleClick={() => renameSheet(i)} onContextMenu={(e) => { e.preventDefault(); delSheet(i); }} title="Double-click to rename, right-click to delete">{s.name}</button>
        ))}
        <button className="btn icon-btn ghost" aria-label="Add sheet" title="Add sheet" onClick={addSheet}><Icon name="plus" /></button>
        <span className="muted ml-auto hidden text-xs sm:inline">Formulas: =SUM(A1:A5) · =AVERAGE() · =MIN() · =MAX() · =COUNT() · =IF() · + − × ÷</span>
      </div>
    </div>
  );
}
