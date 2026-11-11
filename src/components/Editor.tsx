"use client";
import { useMemo, useRef, useState } from "react";
import { Note } from "@/lib/types";
import { Preview } from "./Preview";
import { Canvas } from "./Canvas";
import { InkLayer } from "./InkLayer";
import { putAsset, fmtSize } from "@/lib/assets";
import { download, noteToDocx, noteToHtml } from "@/lib/exporters";
import { SNIPPETS } from "@/lib/templates";
import { backlinksTo, toggleTask } from "@/lib/markdown";
import { Icon } from "./Icon";

type Mode = "edit" | "split" | "preview";

export function Editor({ note, folders, notes, leading, extra, onChange, onDelete, onRestore, onPurge, onWikiLink, onOpenNote, onNewSketch }: {
  note: Note; folders: string[]; notes: Note[]; leading?: React.ReactNode; extra?: React.ReactNode;
  onOpenNote: (id: string) => void; onNewSketch: () => string;
  onChange: (patch: Partial<Note>) => void; onDelete: () => void; onRestore: () => void; onPurge: () => void; onWikiLink: (title: string) => void;
}) {
  const [mode, setModeRaw] = useState<Mode>("split");
  const [scribble, setScribble] = useState(false);
  const [inkSlot, setInkSlot] = useState<HTMLDivElement | null>(null);
  const setMode = (m: Mode) => { setModeRaw(m); if (m === "edit") setScribble(false); };
  const toggleScribble = () => { const on = !scribble; setScribble(on); if (on && mode === "edit") setModeRaw("preview"); };
  const [tagInput, setTagInput] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);

  const back = useMemo(() => backlinksTo(note.title, note.id, notes), [note.title, note.id, notes]);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").toLowerCase();
    if (t && !note.tags.includes(t)) onChange({ tags: [...note.tags, t] });
    setTagInput("");
  };

  const insert = (text: string) => {
    const el = ta.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    onChange({ body: note.body.slice(0, s) + text + note.body.slice(e) });
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + text.length; });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") { e.preventDefault(); insert("  "); }
  };

  const [showExport, setShowExport] = useState(false);
  const fileName = (ext: string) => (note.title.trim() || "note").replace(/[^\w-]+/g, "_") + "." + ext;
  const doExport = async (kind: "md" | "docx" | "html") => {
    setShowExport(false);
    try {
      if (kind === "md") exportMd();
      else download(kind === "docx" ? await noteToDocx(note.title, note.body) : await noteToHtml(note.title, note.body), fileName(kind));
    } catch (e) { alert("Export failed: " + (e as Error).message); }
  };
  // images pasted or dropped into the text: saved in this browser, linked as ![](asset:id); other files attached
  const insertFiles = async (files: File[]) => {
    const parts: string[] = [];
    for (const f of files) {
      try {
        const id = await putAsset(f, f.name);
        parts.push(f.type.startsWith("image/") ? `![${f.name.replace(/\.[^.]+$/, "")}](asset:${id})` : `📎 [${f.name}](asset:${id}) · ${fmtSize(f.size)}`);
      } catch (e) { alert((e as Error).message); }
    }
    if (!parts.length) return;
    const el = ta.current, at = el ? el.selectionStart : note.body.length, text = "\n" + parts.join("\n") + "\n";
    onChange({ body: note.body.slice(0, at) + text + note.body.slice(at) });
  };
  const exportMd = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`# ${note.title}\n\n${note.body}`], { type: "text/markdown" }));
    a.download = (note.title.trim() || "note").replace(/[^\w-]+/g, "_") + ".md";
    a.click();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="toolbar">
        {leading}
        {note.kind === "doc" && <div className="seg" role="radiogroup" aria-label="View mode">{(["edit", "split", "preview"] as Mode[]).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
        ))}</div>}
        {note.kind === "doc" && !note.deletedAt && (
          <button role="switch" aria-checked={scribble} className={`switch-btn ${scribble ? "on" : ""}`} onClick={toggleScribble}
            title="Scribble: write, circle and highlight on top of this note with a pen or finger">
            <Icon name="scribble" /><span className="hidden sm:inline">Scribble</span><span className="switch" aria-hidden="true" />
          </button>
        )}
        <span className="flex-1" />
        {note.kind === "doc" && <span className="relative">
          <button className="btn icon-btn ghost" title="Download as…" aria-label="Download as" aria-expanded={showExport} onClick={() => setShowExport((v) => !v)}><Icon name="download" /></button>
          {showExport && <>
            <div className="fixed inset-0 z-30" onClick={() => setShowExport(false)} />
            <div className="menu right-0 w-56">
              <button className="menu-item" onClick={() => doExport("docx")}><Icon name="notes" /><span><b>Word (.docx)</b><small>Headings, lists, tables, images</small></span></button>
              <button className="menu-item" onClick={() => doExport("md")}><Icon name="text" /><span><b>Markdown (.md)</b><small>Plain text with formatting marks</small></span></button>
              <button className="menu-item" onClick={() => doExport("html")}><Icon name="download" /><span><b>Web page (.html)</b><small>Opens in any browser</small></span></button>
            </div>
          </>}
        </span>}
        <button className={`btn icon-btn ghost ${note.pinned ? "accent-text" : ""}`} title={note.pinned ? "Unpin" : "Pin to top"} aria-pressed={note.pinned} onClick={() => onChange({ pinned: !note.pinned })}><Icon name="pin" /></button>
        <button className="btn icon-btn ghost" title={note.archived ? "Unarchive" : "Archive"} aria-label={note.archived ? "Unarchive" : "Archive"} onClick={() => onChange({ archived: !note.archived })}><Icon name="archive" /></button>
        {note.deletedAt
          ? <><button className="btn btn-primary" onClick={onRestore}>Restore</button><button className="btn btn-danger" onClick={() => confirm("Delete this note permanently? This cannot be undone.") && onPurge()}>Delete forever</button></>
          : <button className="btn icon-btn ghost" title="Move to trash" aria-label="Move to trash" onClick={onDelete}><Icon name="trash" /></button>}
        {extra}
      </div>
      {note.deletedAt && <div className="notice">This note is in the trash. Restore it to edit.</div>}
      <div className="note-head">
        <input className="note-title w-full" placeholder="Untitled" value={note.title} aria-label="Note title"
          onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="meta-bar">
        <input list="folders" className="field w-36" placeholder="Folder"
          value={note.folder} onChange={(e) => onChange({ folder: e.target.value })} />
        <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        {note.tags.map((t) => (
          <span key={t} className="pill pill-tag cursor-pointer"
            onClick={() => onChange({ tags: note.tags.filter((x) => x !== t) })} title="Click to remove">#{t} ×</span>
        ))}
        <input className="tag-input w-28" placeholder="Add tag" value={tagInput}
          onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} onBlur={addTag} />
        {note.kind === "doc" && mode !== "preview" && (
          <select className="field ml-auto w-auto" value="" onChange={(e) => {
            const v = e.target.value; if (!v) return;
            if (v === "__new") insert(`\n\`\`\`sketch\n${onNewSketch()}\n\`\`\`\n`);
            else if (v.startsWith("__wl:")) insert(`[[${v.slice(5)}]]`);
            else if (v.startsWith("__sk:")) insert(`\n\`\`\`sketch\n${v.slice(5)}\n\`\`\`\n`);
            else insert(SNIPPETS[v]);
          }}>
            <option value="">＋ Insert…</option>
            <option value="__new">🎨 New sketch (embed)</option>
            {notes.filter((n) => n.kind === "canvas").map((n) => <option key={n.id} value={"__sk:" + n.id}>🎨 Embed: {n.title || "Untitled sketch"}</option>)}
            {notes.some((n) => n.id !== note.id && n.title.trim()) && <optgroup label="Link to note ([[…]])">
              {notes.filter((n) => n.id !== note.id && n.title.trim()).map((n) => <option key={n.id} value={"__wl:" + n.title.trim()}>🔗 {n.title.trim()}</option>)}
            </optgroup>}
            <optgroup label="Diagrams (Mermaid)">
              {Object.keys(SNIPPETS).filter((k) => k.startsWith("Mermaid")).map((k) => <option key={k} value={k}>{k.replace("Mermaid · ", "")}</option>)}
            </optgroup>
            <optgroup label="Other blocks">
              {Object.keys(SNIPPETS).filter((k) => !k.startsWith("Mermaid")).map((k) => <option key={k} value={k}>{k}</option>)}
            </optgroup>
          </select>
        )}
      </div>
      <div ref={setInkSlot} />
      <div className={`flex min-h-0 flex-1 ${note.deletedAt ? "pointer-events-none opacity-60" : ""}`}>
        {note.kind === "canvas" ? (
          <Canvas initial={note.drawing ?? []} title={note.title} onChange={(drawing) => onChange({ drawing })} paper={note.paper ?? "dots"} onPaper={(paper) => onChange({ paper })} />
        ) : (<>
          {mode !== "preview" && (
            <textarea ref={ta} className={`source h-full resize-none ${mode === "split" ? "w-1/2 border-r bd" : "w-full"}`}
              placeholder="Write in Markdown… use ＋ Insert for math, flowcharts, charts, plots" value={note.body}
              onKeyDown={onKey} onChange={(e) => onChange({ body: e.target.value })}
              onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); insertFiles(fs); } }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); } }}
              onDrop={(e) => { const fs = Array.from(e.dataTransfer.files); if (fs.length) { e.preventDefault(); e.stopPropagation(); insertFiles(fs); } }} />
          )}
          {mode !== "edit" && (
            <div className={`reading h-full overflow-y-auto ${mode === "split" ? "w-1/2" : "w-full"} ${scribble ? "scribbling" : ""}`}>
              <InkLayer ink={note.ink ?? []} active={scribble} toolbarSlot={inkSlot} onChange={(ink) => onChange({ ink })}>
                <Preview body={note.body} notes={notes} onOpenNote={onOpenNote} onWikiLink={onWikiLink} onToggleTask={(i) => onChange({ body: toggleTask(note.body, i) })} />
              </InkLayer>
            </div>
          )}
        </>)}
      </div>
      {back.length > 0 && (
        <div className="backlinks">
          <span className="muted">Linked from</span>
          {back.map((n) => <button key={n.id} className="pill pill-tag" onClick={() => onOpenNote(n.id)}>{n.title || "Untitled"}</button>)}
        </div>
      )}
    </div>
  );
}
