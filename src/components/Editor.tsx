"use client";
import { useMemo, useRef, useState } from "react";
import { Note } from "@/lib/types";
import { Preview } from "./Preview";
import { Canvas, bbox } from "./Canvas";
import { putAsset, fmtSize } from "@/lib/assets";
import { download, noteToDocx, noteToHtml } from "@/lib/exporters";
import { SNIPPETS } from "@/lib/templates";
import { backlinksTo, toggleTask } from "@/lib/markdown";
import { Icon } from "./Icon";
import { RichEditor } from "./RichEditor";
import { SheetEditor } from "./SheetEditor";
import { FORMATS, LANGS, LANG_EXT, convertNote, formatOf } from "@/lib/formats";
import { sheetsText } from "@/lib/sheet";
import { NoteFormat } from "@/lib/types";
import hljs from "highlight.js/lib/common";
import { saveFile } from "@/lib/save";

type Mode = "edit" | "split" | "preview";

export function Editor({ note, folders, notes, leading, extra, onChange, onDelete, onRestore, onPurge, onWikiLink, onOpenNote, onNewSketch }: {
  note: Note; folders: string[]; notes: Note[]; leading?: React.ReactNode; extra?: React.ReactNode;
  onOpenNote: (id: string) => void; onNewSketch: () => string;
  onChange: (patch: Partial<Note>) => void; onDelete: () => void; onRestore: () => void; onPurge: () => void; onWikiLink: (title: string) => void;
}) {
  // notes with scribbles open in Preview, where the scribbles are shown
  const fmt = formatOf(note);
  const md = fmt === "markdown";
  // phones get one pane at a time; notes with scribbles open in Preview, where the scribbles are shown
  const [mode, setModeRaw] = useState<Mode>(() => ((note.ink?.length ?? 0) > 0 ? "preview" : typeof window !== "undefined" && window.innerWidth < 768 ? "edit" : "split"));
  const [codeView, setCodeView] = useState(false);
  const [showType, setShowType] = useState(false);
  const changeType = async (to: NoteFormat) => {
    setShowType(false);
    if (to === (note.format ?? "markdown")) return;
    const { patch, lossy } = await convertNote(note, to);
    const label = FORMATS.find((f) => f.id === to)!.label;
    if (lossy && !confirm(`Change this note to ${label}?\n\n${lossy}\n\nTip: download a copy first if you might want the old version.`)) return;
    setScribble(false); onChange(patch);
  };
  const [scribble, setScribble] = useState(false);
  const [inkSlot, setInkSlot] = useState<HTMLDivElement | null>(null);
  const inkBottom = (note.ink ?? []).reduce((m, e) => { const q = bbox(e); return Math.max(m, q.y + q.h); }, 0);
  // scribbles are placed on the full-width preview, so Scribble always uses Preview mode
  const setMode = (m: Mode) => { setModeRaw(m); if (m !== "preview") setScribble(false); };
  const toggleScribble = () => { const on = !scribble; setScribble(on); if (on) setModeRaw("preview"); };
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
  const doExport = async (kind: "md" | "docx" | "html" | "txt" | "code" | "xlsx" | "csv") => {
    setShowExport(false);
    try {
      // documents and spreadsheets go through Markdown/HTML for Word and web export
      const asMd = async () => fmt === "rich" ? (await import("@/lib/importers")).htmlToMd(note.html ?? "") : fmt === "sheet" ? (await import("@/lib/formats")).sheetsToMd(note.sheets ?? []) : fmt === "code" ? "```" + (note.lang ?? "") + "\n" + note.body + "\n```" : note.body;
      if (kind === "md") download(new Blob([(fmt === "markdown" ? `# ${note.title}\n\n` : "") + await asMd()], { type: "text/markdown" }), fileName("md"));
      else if (kind === "txt") download(new Blob([fmt === "sheet" ? sheetsText(note.sheets ?? []) : note.body], { type: "text/plain" }), fileName("txt"));
      else if (kind === "code") download(new Blob([note.body], { type: "text/plain" }), fileName(LANG_EXT[note.lang ?? ""] ?? "txt"));
      else if (kind === "docx") download(await noteToDocx(note.title, await asMd()), fileName("docx"));
      else if (kind === "html") download(fmt === "rich" ? new Blob([`<!doctype html><meta charset="utf-8"><title>${note.title}</title><style>body{font:16px/1.6 system-ui;max-width:46rem;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:4px 8px}</style><h1>${note.title}</h1>${note.html ?? ""}`], { type: "text/html" }) : await noteToHtml(note.title, await asMd()), fileName("html"));
      else if (kind === "xlsx" || kind === "csv") {
        const XLSX = await import("xlsx"); const { evaluateSheet } = await import("@/lib/sheet");
        const wb = XLSX.utils.book_new();
        for (const sh of note.sheets ?? []) {
          const vals = evaluateSheet(sh);
          const ws = XLSX.utils.aoa_to_sheet(sh.rows.map((row, r) => row.map((v, c) => { const out = vals[r][c]; return v.startsWith("=") ? { t: isNaN(Number(out)) ? "s" : "n", v: isNaN(Number(out)) ? out : Number(out), f: v.slice(1) } : v !== "" && !isNaN(Number(v)) ? Number(v) : v; })));
          XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31) || "Sheet");
        }
        if (kind === "xlsx") download(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName("xlsx"));
        else download(new Blob([XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])], { type: "text/csv" }), fileName("csv"));
      }
    } catch (e) { alert("Export failed: " + (e as Error).message); }
  };
  const exportsFor: [Parameters<typeof doExport>[0], string, string][] =
    fmt === "sheet" ? [["xlsx", "Excel (.xlsx)", "Keeps formulas and every sheet"], ["csv", "CSV (.csv)", "First sheet, values only"], ["md", "Markdown table (.md)", "Values as text tables"], ["html", "Web page (.html)", "Opens in any browser"]]
    : fmt === "code" ? [["code", `Code file (.${LANG_EXT[note.lang ?? ""] ?? "txt"})`, "Ready to run or open in an editor"], ["txt", "Text (.txt)", "Plain text"], ["md", "Markdown (.md)", "As a code block"]]
    : fmt === "text" ? [["txt", "Text (.txt)", "Plain text"], ["docx", "Word (.docx)", "Opens in Word or Google Docs"], ["md", "Markdown (.md)", "Plain text"]]
    : [["docx", "Word (.docx)", "Headings, lists, tables, images"], ["md", "Markdown (.md)", "Plain text with formatting marks"], ["html", "Web page (.html)", "Opens in any browser"], ["txt", "Text (.txt)", "Just the words"]];
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
    saveFile(new Blob([`# ${note.title}\n\n${note.body}`], { type: "text/markdown" }), (note.title.trim() || "note").replace(/[^\w-]+/g, "_") + ".md");
  };

  return (
    <div className="editor-in flex h-full flex-col">
      <div className="toolbar">
        {leading}
        {note.kind === "doc" && <span className="relative">
          <button className="btn type-btn" aria-haspopup="menu" aria-expanded={showType} title="Note type: choose what kind of note this is" onClick={() => setShowType((v) => !v)}>
            <Icon name={FORMATS.find((f) => f.id === fmt)!.icon} /><span className="hidden sm:inline">{FORMATS.find((f) => f.id === fmt)!.label}</span><span aria-hidden="true">▾</span></button>
          {showType && <>
            <div className="fixed inset-0 z-30" onClick={() => setShowType(false)} />
            <div className="menu left-0 w-72" role="menu">
              <div className="nav-group">Change this note to</div>
              {FORMATS.filter((f) => f.id !== "scribble").map((f) => (
                <button key={f.id} role="menuitemradio" aria-checked={f.id === fmt} className={`menu-item ${f.id === fmt ? "on" : ""}`} onClick={() => changeType(f.id as NoteFormat)}>
                  <Icon name={f.icon} /><span><b>{f.label}{f.id === fmt ? " ✓" : ""}</b><small>{f.hint}</small></span></button>
              ))}
            </div>
          </>}
        </span>}
        {md && <div className="seg" role="radiogroup" aria-label="View mode">{(["edit", "split", "preview"] as Mode[]).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
        ))}</div>}
        {fmt === "code" && <>
          <select className="field w-auto" aria-label="Language" value={note.lang ?? "plaintext"} onChange={(e) => onChange({ lang: e.target.value })}>
            {LANGS.map((l) => <option key={l} value={l}>{l === "plaintext" ? "Plain" : l}</option>)}</select>
          <div className="seg" role="radiogroup" aria-label="Code view"><button role="radio" aria-checked={!codeView} className={!codeView ? "on" : ""} onClick={() => setCodeView(false)}>Edit</button><button role="radio" aria-checked={codeView} className={codeView ? "on" : ""} onClick={() => setCodeView(true)}>Highlighted</button></div>
        </>}
        {(md || fmt === "rich") && !note.deletedAt && (
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
              {exportsFor.map(([k, label, hint]) => <button key={k} className="menu-item" onClick={() => doExport(k)}><Icon name="download" /><span><b>{label}</b><small>{hint}</small></span></button>)}
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
        {md && mode !== "preview" && (
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
      <div ref={setInkSlot} className="ink-slot" />
      <div className={`flex min-h-0 flex-1 ${note.deletedAt ? "pointer-events-none opacity-60" : ""}`}>
        {note.kind === "canvas" ? (
          <Canvas initial={note.drawing ?? []} title={note.title} onChange={(drawing) => onChange({ drawing })} paper={note.paper ?? "dots"} onPaper={(paper) => onChange({ paper })} />
        ) : fmt === "rich" ? (
          <RichEditor html={note.html ?? ""} readOnly={!!note.deletedAt || scribble} toolbarless={scribble} onChange={(html, text) => onChange({ html, body: text })}
            wrapStyle={{ minHeight: scribble ? `max(${inkBottom + 280}px, calc(100dvh - 300px))` : inkBottom + 24 }}>
            {(scribble || (note.ink?.length ?? 0) > 0) && <Canvas initial={note.ink ?? []} title={note.title} onChange={(ink) => onChange({ ink })} overlay={{ active: scribble, slot: inkSlot }} />}
          </RichEditor>
        ) : fmt === "sheet" ? (
          <SheetEditor sheets={note.sheets ?? []} onChange={(sheets) => onChange({ sheets, body: sheetsText(sheets) })} />
        ) : fmt === "text" ? (
          <textarea className="plain-edit h-full w-full resize-none" placeholder="Start typing…" value={note.body} aria-label="Text"
            onChange={(e) => onChange({ body: e.target.value })} spellCheck />
        ) : fmt === "code" ? (
          codeView
            ? <pre className="code-view h-full w-full overflow-auto"><code className="hljs" dangerouslySetInnerHTML={{ __html: note.lang && note.lang !== "plaintext" && hljs.getLanguage(note.lang) ? hljs.highlight(note.body, { language: note.lang }).value : hljs.highlightAuto(note.body).value }} /></pre>
            : <textarea ref={ta} className="source code-edit h-full w-full resize-none" placeholder="// paste or type code" value={note.body} aria-label="Code" spellCheck={false}
                onKeyDown={onKey} onChange={(e) => onChange({ body: e.target.value })} />
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
              <div className="ink-wrap" style={{ minHeight: scribble ? `max(${inkBottom + 280}px, calc(100dvh - 260px))` : inkBottom + 24 }}>
                <Preview body={note.body} notes={notes} onOpenNote={onOpenNote} onWikiLink={onWikiLink} onToggleTask={(i) => onChange({ body: toggleTask(note.body, i) })} />
                {mode === "preview" && (scribble || (note.ink?.length ?? 0) > 0) && (
                  <Canvas initial={note.ink ?? []} title={note.title} onChange={(ink) => onChange({ ink })} overlay={{ active: scribble, slot: inkSlot }} />
                )}
              </div>
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
