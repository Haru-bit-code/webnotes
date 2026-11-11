"use client";
// Import files: choose, for each file, whether it becomes a page to write on or an editable note.
import { useState } from "react";
import { Note } from "@/lib/types";
import { Mode, importFile, kindOf } from "@/lib/importers";
import { fmtSize } from "@/lib/assets";
import { Icon } from "./Icon";

const MODE_LABEL: Record<Mode, string> = { page: "Page to write and draw on", text: "Editable text note" };

export function ImportDialog({ files, onDone, onClose }: { files: File[]; onDone: (notes: Partial<Note>[]) => void; onClose: () => void }) {
  const [modes, setModes] = useState<Mode[]>(() => files.map((f) => kindOf(f).modes[0]));
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const run = async () => {
    const out: Partial<Note>[] = [], errs: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`${f.name}: starting…`);
      try { out.push(await importFile(f, modes[i], (m) => setBusy(`${f.name}: ${m}`))); }
      catch (e) { errs.push(`${f.name}: ${(e as Error).message}`); }
    }
    setBusy(null);
    if (out.length) onDone(out);
    if (errs.length) setErrors(errs); else onClose();
  };
  return (
    <div className="modal-scrim" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import files" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 className="pane-title">Import {files.length === 1 ? "file" : `${files.length} files`}</h2>
          <button className="btn icon-btn ghost" aria-label="Close" disabled={!!busy} onClick={onClose}><Icon name="close" /></button></div>
        <div className="modal-body space-y-2">
          {files.map((f, i) => { const k = kindOf(f); return (
            <div key={i} className="import-row">
              <Icon name={k.label === "Image" || k.label === "PDF" ? "image" : "file"} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className="muted text-xs">{k.label} · {fmtSize(f.size)}</div>
              </div>
              {k.modes.length > 1
                ? <select className="field w-auto" value={modes[i]} disabled={!!busy} aria-label={`Open ${f.name} as`} onChange={(e) => setModes(modes.map((m, j) => (j === i ? (e.target.value as Mode) : m)))}>
                    {k.modes.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}</select>
                : <span className="muted text-xs">{k.label === "Attachment" ? "Note with the file attached" : MODE_LABEL[k.modes[0]]}</span>}
            </div>
          ); })}
          {busy && <p className="text-sm" role="status">{busy}</p>}
          {errors.length > 0 && <div className="notice-inline" role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
          <p className="muted text-xs leading-relaxed">PDFs and images become pages you can write, draw and highlight on, and export back to PDF. Word, PowerPoint, Excel, CSV, Markdown, text, HTML and code become notes you can edit and download as Word, Markdown or HTML. Other files are attached to a note.</p>
        </div>
        <div className="modal-foot gap-2">
          <button className="btn" disabled={!!busy} onClick={onClose}>{errors.length ? "Close" : "Cancel"}</button>
          {!errors.length && <button className="btn btn-primary" disabled={!!busy} onClick={run}>{busy ? "Importing…" : "Import"}</button>}
        </div>
      </div>
    </div>
  );
}
