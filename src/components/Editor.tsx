"use client";
import { useMemo, useRef, useState } from "react";
import { Note } from "@/lib/types";
import { Preview } from "./Preview";
import { Canvas } from "./Canvas";
import { SNIPPETS } from "@/lib/templates";
import { backlinksTo, toggleTask } from "@/lib/markdown";

type Mode = "edit" | "split" | "preview";

export function Editor({ note, folders, notes, leading, extra, onChange, onDelete, onRestore, onPurge, onWikiLink, onOpenNote, onNewSketch }: {
  note: Note; folders: string[]; notes: Note[]; leading?: React.ReactNode; extra?: React.ReactNode;
  onOpenNote: (id: string) => void; onNewSketch: () => string;
  onChange: (patch: Partial<Note>) => void; onDelete: () => void; onRestore: () => void; onPurge: () => void; onWikiLink: (title: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("split");
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

  const exportMd = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`# ${note.title}\n\n${note.body}`], { type: "text/markdown" }));
    a.download = (note.title.trim() || "note").replace(/[^\w-]+/g, "_") + ".md";
    a.click();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="bd flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {leading}
        <input className="min-w-0 flex-1 text-xl font-semibold" placeholder="Untitled" value={note.title}
          onChange={(e) => onChange({ title: e.target.value })} />
        {note.kind === "doc" && (["edit", "split", "preview"] as Mode[]).map((m) => (
          <button key={m} className={`btn ${mode === m ? "accent-bg" : ""}`} onClick={() => setMode(m)}>{m}</button>
        ))}
        {note.kind === "doc" && <button className="btn" onClick={exportMd}>.md</button>}
        {extra}
        <button className="btn" onClick={() => onChange({ pinned: !note.pinned })}>{note.pinned ? "Unpin" : "Pin"}</button>
        <button className="btn" onClick={() => onChange({ archived: !note.archived })}>{note.archived ? "Unarchive" : "Archive"}</button>
        {note.deletedAt
          ? <><button className="btn accent-bg" onClick={onRestore}>Restore</button><button className="btn" onClick={() => confirm("Delete this note permanently? This cannot be undone.") && onPurge()}>Delete forever</button></>
          : <button className="btn" title="Moves the note to the trash" onClick={onDelete}>Delete</button>}
      </div>
      {note.deletedAt && <div className="muted bd border-b px-4 py-1.5 text-xs">🗑 This note is in the trash. Restore it to edit.</div>}
      <div className="bd flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
        <input list="folders" className="bd w-36 rounded border px-2 py-1" placeholder="Folder"
          value={note.folder} onChange={(e) => onChange({ folder: e.target.value })} />
        <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
        {note.tags.map((t) => (
          <span key={t} className="active-row cursor-pointer rounded-full px-2 py-0.5"
            onClick={() => onChange({ tags: note.tags.filter((x) => x !== t) })} title="Click to remove">#{t} ×</span>
        ))}
        <input className="w-28" placeholder="+ add tag" value={tagInput}
          onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} onBlur={addTag} />
        {note.kind === "doc" && mode !== "preview" && (
          <select className="bd ml-auto rounded border px-2 py-1" value="" onChange={(e) => {
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
      <div className={`flex min-h-0 flex-1 ${note.deletedAt ? "pointer-events-none opacity-60" : ""}`}>
        {note.kind === "canvas" ? (
          <Canvas initial={note.drawing ?? []} title={note.title} onChange={(drawing) => onChange({ drawing })} />
        ) : (<>
          {mode !== "preview" && (
            <textarea ref={ta} className={`h-full resize-none p-4 font-mono text-[0.95em] ${mode === "split" ? "w-1/2 border-r bd" : "w-full"}`}
              placeholder="Write in Markdown… use ＋ Insert for math, flowcharts, charts, plots" value={note.body}
              onKeyDown={onKey} onChange={(e) => onChange({ body: e.target.value })} />
          )}
          {mode !== "edit" && <Preview body={note.body} notes={notes} onOpenNote={onOpenNote} onWikiLink={onWikiLink} onToggleTask={(i) => onChange({ body: toggleTask(note.body, i) })} className={`h-full overflow-y-auto p-4 ${mode === "split" ? "w-1/2" : "w-full"}`} />}
        </>)}
      </div>
      {back.length > 0 && (
        <div className="bd flex flex-wrap items-center gap-2 border-t px-4 py-1.5 text-xs">
          <span className="muted">↩ Linked from</span>
          {back.map((n) => <button key={n.id} className="active-row rounded-full px-2 py-0.5" onClick={() => onOpenNote(n.id)}>{n.title || "Untitled"}</button>)}
        </div>
      )}
    </div>
  );
}
