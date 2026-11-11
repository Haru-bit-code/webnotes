"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNotes, TRASH_DAYS } from "@/lib/store";
import { Note } from "@/lib/types";
import { Editor } from "@/components/Editor";
import { SettingsPanel } from "@/components/Settings";
import { TEMPLATES } from "@/lib/templates";
import { useBackup } from "@/lib/backup";
import { AIPanel } from "@/components/AIPanel";
import { AISettings, defaultAI, normalizeAI } from "@/lib/ai";
import { Icon } from "@/components/Icon";
import { NewPageDialog } from "@/components/NewPage";
import { ImportDialog } from "@/components/ImportDialog";
import { FORMATS, appendText, formatLabel, newNoteOf } from "@/lib/formats";
import { setAllowRemote } from "@/lib/remote";
import { DEFAULT_THEME, textOn } from "@/lib/themes";
import { TransferDialog } from "@/components/TransferDialog";
import { codeFromText } from "@/lib/transfer";

type View = { kind: "all" } | { kind: "scribbles" } | { kind: "archive" } | { kind: "trash" } | { kind: "folder"; name: string } | { kind: "tag"; name: string };

const FONTS = {
  sans: "\"Hanken Grotesk\", ui-sans-serif, system-ui, sans-serif",
  serif: "Newsreader, ui-serif, Georgia, serif",
  mono: "\"JetBrains Mono\", ui-monospace, SFMono-Regular, monospace",
  hand: "Kalam, \"Comic Sans MS\", cursive",
};

export default function Home() {
  const { notes, settings, setSettings, ready, create, update, remove, restore, purge, emptyTrash, importNotes, conflicts, clearConflicts } = useNotes();
  const backup = useBackup(notes, ready, importNotes);
  setAllowRemote(!!settings.remoteImages); // read while notes render, so it must be set before them
  const live = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]); // everything except the trash
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showNav, setShowNav] = useState(false); // phones: the sidebar as a slide-in drawer
  const [transfer, setTransfer] = useState<null | { mode: "send" | "receive"; noteIds?: string[]; code?: string }>(null);
  // a scanned QR code opens the website at #receive=CODE: go straight to receiving (nothing is added without asking)
  useEffect(() => {
    const check = () => {
      const c = codeFromText(location.hash);
      if (c && /receive=/.test(location.hash)) { setTransfer({ mode: "receive", code: c }); history.replaceState(null, "", location.pathname + location.search); }
    };
    check(); // opened from the link
    window.addEventListener("hashchange", check); // or the link was opened while WebNotes was already open in this tab
    return () => window.removeEventListener("hashchange", check);
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [hideSide, setHideSide] = useState(false);
  const [hideList, setHideList] = useState(false);
  const [back, setBack] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const [ai, setAI] = useState<AISettings>(defaultAI);
  useEffect(() => { try { setAI(normalizeAI(JSON.parse(localStorage.getItem("webnotes:ai") || "{}"))); setShowAI(localStorage.getItem("webnotes:showAI") === "1"); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("webnotes:ai", JSON.stringify(ai)); } catch {} }, [ai]);
  useEffect(() => { try { localStorage.setItem("webnotes:showAI", showAI ? "1" : "0"); } catch {} }, [showAI]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setShowAI((v) => !v); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("webnotes:layout") || "{}"); setHideSide(!!v.hideSide); setHideList(!!v.hideList); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem("webnotes:layout", JSON.stringify({ hideSide, hideList })); } catch {} }, [hideSide, hideList]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); const f = !(hideSide && hideList); setHideSide(f); setHideList(f); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [hideSide, hideList]);

  // Apply theme settings to <html>
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    root.style.setProperty("--accent", settings.accent);
    root.style.setProperty("--on-accent", textOn(settings.accent)); // button text stays readable on any accent
    const glow = settings.glow ?? DEFAULT_THEME.glow;
    root.style.setProperty("--accent-2", glow[0]); root.style.setProperty("--accent-3", glow[1]);
    root.classList.toggle("no-glass", settings.glass === false);
    root.style.setProperty("--font-body", FONTS[settings.font]);
    root.style.setProperty("--font-size", settings.fontSize + "px");
    return () => mq.removeEventListener("change", apply);
  }, [settings]);

  // folders = the ones made with "New folder" plus any a note names; a folder exists even while it is empty
  const folders = useMemo(() => [...new Set([...(settings.folders ?? []), ...live.filter((n) => !n.archived && n.folder).map((n) => n.folder)])].sort((a, b) => a.localeCompare(b)), [live, settings.folders]);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({}); // folders expanded in the sidebar
  const [naming, setNaming] = useState<null | { old?: string }>(null);        // the "New folder" / rename box
  const [folderMenu, setFolderMenu] = useState<string | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);         // folder a dragged note is over
  const saveFolder = (name: string) => {
    const nm = name.trim().replace(/\s+/g, " ").slice(0, 60); const old = naming?.old; setNaming(null);
    if (!nm || nm === old) return;
    const list = new Set(settings.folders ?? []); if (old) list.delete(old); list.add(nm);
    setSettings({ ...settings, folders: [...list] });
    if (old) { for (const n of notes) if (n.folder === old) update(n.id, { folder: nm }); }
    setView({ kind: "folder", name: nm }); setSelected(null);
  };
  const deleteFolder = (name: string) => {
    const inside = notes.filter((n) => n.folder === name);
    if (!confirm(inside.length ? `Delete the folder "${name}"? Its ${inside.length} note(s) are kept and move out of the folder.` : `Delete the empty folder "${name}"?`)) return;
    for (const n of inside) update(n.id, { folder: "" });
    setSettings({ ...settings, folders: (settings.folders ?? []).filter((f) => f !== name) });
    if (view.kind === "folder" && view.name === name) setView({ kind: "all" });
  };
  const moveToFolder = (id: string, name: string) => update(id, { folder: name });
  const tags = useMemo(() => [...new Set(live.filter((n) => !n.archived).flatMap((n) => n.tags))].sort(), [live]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (view.kind === "trash") return !!n.deletedAt;
        if (n.deletedAt) return false;
        if (view.kind === "archive") return n.archived;
        if (n.archived) return false;
        if (view.kind === "folder") return n.folder === view.name;
        if (view.kind === "tag") return n.tags.includes(view.name);
        if (view.kind === "scribbles") return n.kind === "canvas" || !!n.ink?.length;
        return true;
      })
      .filter((n) => !q || (n.title + " " + n.body + " " + n.tags.join(" ") + " " + (n.drawing ?? []).map((e) => e.text ?? "").join(" ")).toLowerCase().includes(q))
      .sort((a, b) => (view.kind === "trash" ? (b.deletedAt ?? 0) - (a.deletedAt ?? 0) : Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt));
  }, [notes, view, query]);

  const current = notes.find((n) => n.id === selected) ?? null;
  const isView = (v: View) => JSON.stringify(v) === JSON.stringify(view);
  const navItem = (v: View, label: string, icon: string, count?: number) => (
    <button key={label} onClick={() => { setView(v); setSelected(null); setShowNav(false); }} aria-current={isView(v) ? "page" : undefined}
      className={`nav-item ${isView(v) ? "on" : ""}`}>
      <Icon name={icon} /><span className="flex-1 truncate">{label}</span>{count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  );

  const [showNew, setShowNew] = useState(false);
  const [pickPaper, setPickPaper] = useState(false);
  const [importing, setImporting] = useState<File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  // Android app: the back button closes what's on top (dialog, menu, panel, open note) before leaving the app
  const onBack = useRef<() => boolean>(() => false);
  onBack.current = () => {
    if (showNav) { setShowNav(false); return true; }
    if (transfer) { setTransfer(null); return true; }
    if (importing) { setImporting(null); return true; }
    if (pickPaper) { setPickPaper(false); return true; }
    if (showSettings) { setShowSettings(false); return true; }
    if (showNew) { setShowNew(false); return true; }
    if (document.querySelector(".modal-scrim, .pop")) { document.activeElement instanceof HTMLElement && document.activeElement.blur(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); (document.querySelector(".modal-scrim") as HTMLElement | null)?.click(); return true; }
    if (showAI && innerWidth < 768) { setShowAI(false); return true; }
    if (selected) { setSelected(null); return true; }
    return false;
  };
  useEffect(() => {
    let off: (() => void) | undefined;
    import("@/lib/save").then(({ isApp }) => {
      if (!isApp()) return;
      import("@capacitor/app").then(({ App }) => App.addListener("backButton", () => { if (!onBack.current()) App.minimizeApp(); }).then((h) => { off = () => h.remove(); }));
    });
    return () => off?.();
  }, []);
  useEffect(() => {
    const off = () => setDragging(false);
    window.addEventListener("drop", off, true); window.addEventListener("dragend", off, true);
    return () => { window.removeEventListener("drop", off, true); window.removeEventListener("dragend", off, true); };
  }, []);
  const pickFiles = () => { const i = document.createElement("input"); i.type = "file"; i.multiple = true; i.onchange = () => { const fs = Array.from(i.files ?? []); if (fs.length) setImporting(fs); }; i.click(); };
  const imported = (list: Partial<Note>[]) => {
    let first = "";
    for (const n of [...list].reverse()) first = create({ folder: view.kind === "folder" ? view.name : "", ...n });
    if (view.kind !== "folder") setView({ kind: "all" }); // imported into a folder: stay in it
    setSelected(first);
  };
  const newScribble = (p: Pick<Note, "paper" | "drawing" | "title">) => { setPickPaper(false); newNote({ kind: "canvas", ...p }); };
  const newNote = (init: Partial<Note> = {}) => {
    setShowNew(false);
    const id = create({ folder: view.kind === "folder" ? view.name : "", tags: view.kind === "tag" ? [view.name] : [], ...init });
    if (view.kind === "archive" || view.kind === "trash" || (view.kind === "scribbles" && init.kind !== "canvas")) setView({ kind: "all" });
    setSelected(id);
  };

  const viewTitle = view.kind === "all" ? "All notes" : view.kind === "archive" ? "Archive" : view.kind === "trash" ? "Trash" : view.kind === "scribbles" ? "Scribbles" : view.kind === "folder" ? view.name : "#" + view.name;
  const ago = (t: number) => { const d = (Date.now() - t) / 60000; return d < 1 ? "just now" : d < 60 ? `${Math.floor(d)} min ago` : d < 1440 ? `${Math.floor(d / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
  const toggles = <span className="hidden gap-1 md:flex">
    <button className="btn icon-btn ghost" title="Toggle sidebar" aria-label="Toggle sidebar" onClick={() => setHideSide((v) => !v)}><Icon name="sidebar" /></button>
    <button className="btn icon-btn ghost" title="Toggle note list (⌘\\ hides both)" aria-label="Toggle note list" onClick={() => setHideList((v) => !v)}><Icon name="list" /></button>
  </span>;

  if (!ready) return null;

  return (
    <div className="app app-shell flex h-[100dvh]"
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false); }}
      onDrop={(e) => { setDragging(false); const fs = Array.from(e.dataTransfer.files); if (fs.length) { e.preventDefault(); setImporting(fs); } }}>
      {dragging && <div className="drop-overlay" aria-hidden="true"><div><Icon name="upload" /><b>Drop to import</b><span>PDF, images, Word, PowerPoint, Excel, CSV, text and more</span></div></div>}
      {showNav && <div className="drawer-scrim md:hidden" onClick={() => setShowNav(false)} aria-hidden="true" />}
      <aside id="main-nav" className={`sidebar pane pane-1 w-60 shrink-0 flex-col ${showNav ? "drawer flex" : "hidden"} ${hideSide ? "" : "md:flex"}`} aria-label="Notebooks">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="pen" /></span>
          <span className="brand-name">WebNotes</span>
          <button className="btn icon-btn ghost ml-auto" aria-label="Settings" title="Settings" onClick={() => { setShowNav(false); setShowSettings(true); }}><Icon name="settings" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {navItem({ kind: "all" }, "All notes", "notes", live.filter((n) => !n.archived).length)}
          {navItem({ kind: "scribbles" }, "Scribbles", "scribble", live.filter((n) => !n.archived && (n.kind === "canvas" || !!n.ink?.length)).length)}
          {navItem({ kind: "archive" }, "Archive", "archive", live.filter((n) => n.archived).length)}
          {navItem({ kind: "trash" }, "Trash", "trash", notes.length - live.length)}
          <div className="nav-group flex items-center">Folders
            <button className="btn icon-btn ghost ml-auto nav-add" aria-label="New folder" title="New folder" onClick={() => setNaming({})}><Icon name="plus" /></button></div>
          {naming && !naming.old && <FolderNameBox onDone={saveFolder} onCancel={() => setNaming(null)} />}
          {folders.length === 0 && !naming && <button className="nav-hint" onClick={() => setNaming({})}>Group notes into folders: press +</button>}
          {folders.map((f) => {
            const inside = live.filter((n) => !n.archived && n.folder === f), open = !!openFolders[f];
            if (naming?.old === f) return <FolderNameBox key={f} initial={f} onDone={saveFolder} onCancel={() => setNaming(null)} />;
            return (
              <div key={f} className={`folder-row ${dropFolder === f ? "drop" : ""}`}
                onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-webnotes-note")) { e.preventDefault(); setDropFolder(f); } }}
                onDragLeave={() => setDropFolder((d) => (d === f ? null : d))}
                onDrop={(e) => { const id = e.dataTransfer.getData("text/x-webnotes-note"); setDropFolder(null); if (id) { e.preventDefault(); moveToFolder(id, f); } }}>
                <div className="flex items-center">
                  <button className="folder-toggle" aria-label={`${open ? "Hide" : "Show"} notes in ${f}`} aria-expanded={open} onClick={() => setOpenFolders((o) => ({ ...o, [f]: !open }))}><Icon name="chevron" className={open ? "" : "-rotate-90"} /></button>
                  <div className="min-w-0 flex-1">{navItem({ kind: "folder", name: f }, f, "folder", inside.length)}</div>
                  <span className="relative">
                    <button className="btn icon-btn ghost folder-more" aria-label={`Folder options for ${f}`} aria-expanded={folderMenu === f} onClick={() => setFolderMenu(folderMenu === f ? null : f)}><Icon name="more" /></button>
                    {folderMenu === f && <>
                      <div className="fixed inset-0 z-30" onClick={() => setFolderMenu(null)} />
                      <div className="menu right-0 w-44" role="menu">
                        <button role="menuitem" className="menu-item compact" onClick={() => { setFolderMenu(null); setNaming({ old: f }); }}><Icon name="text" /><span>Rename</span></button>
                        <button role="menuitem" className="menu-item compact" onClick={() => { setFolderMenu(null); deleteFolder(f); }}><Icon name="trash" /><span>Delete folder</span></button>
                      </div></>}
                  </span>
                </div>
                {open && (
                  <ul className="folder-notes">
                    {inside.length === 0 && <li className="muted">Empty</li>}
                    {inside.slice(0, 12).map((n) => (
                      <li key={n.id}><button className={n.id === selected ? "on" : ""} onClick={() => { setView({ kind: "folder", name: f }); setSelected(n.id); setShowNav(false); }}>
                        <Icon name={n.kind === "canvas" ? "scribble" : "notes"} /><span className="truncate">{n.title || "Untitled"}</span></button></li>
                    ))}
                    {inside.length > 12 && <li><button onClick={() => { setView({ kind: "folder", name: f }); setShowNav(false); }}>{inside.length - 12} more…</button></li>}
                  </ul>
                )}
              </div>
            );
          })}
          {tags.length > 0 && <div className="nav-group">Tags</div>}
          {tags.map((t) => navItem({ kind: "tag", name: t }, t, "tag", live.filter((n) => !n.archived && n.tags.includes(t)).length))}
        </nav>
        <div className="side-foot">
          <button className="nav-item" onClick={() => { setShowNav(false); setTransfer({ mode: "send" }); }} title="Move notes to another device or a friend with a QR code"><Icon name="qr" /><span className="flex-1">Send &amp; receive</span></button>
        </div>
      </aside>

      <section className={`list-pane pane pane-2 w-full shrink-0 flex-col md:w-80 ${current ? "hidden" : "flex"} ${hideList ? "" : "md:flex"}`}>
        <div className="list-head">
          <div className="flex items-center gap-2">
            {hideSide && <button className="btn icon-btn ghost hidden md:inline-flex" title="Show sidebar" aria-label="Show sidebar" onClick={() => setHideSide(false)}><Icon name="sidebar" /></button>}
            <button className="btn icon-btn ghost md:hidden" aria-label="Open menu: Scribbles, folders, tags, Archive, Trash" aria-controls="main-nav" aria-expanded={showNav} onClick={() => setShowNav(true)}><Icon name="menu" /></button>
            <h1 className="list-title flex-1 truncate">{viewTitle}</h1>
            <button className="btn icon-btn ghost md:hidden" aria-label="Settings" onClick={() => setShowSettings(true)}><Icon name="settings" /></button>
            <div className="relative">
              <button className="btn btn-primary" aria-expanded={showNew} onClick={() => setShowNew((v) => !v)}><Icon name="plus" /> New</button>
              {showNew && (<>
                <div className="fixed inset-0 z-30" onClick={() => setShowNew(false)} />
                <div className="menu new-menu right-0 w-72">
                  <div className="nav-group">New</div>
                  {FORMATS.map((f) => (
                    <button key={f.id} className="menu-item" onClick={() => (f.id === "scribble" ? (setShowNew(false), setPickPaper(true)) : newNote(newNoteOf(f.id)))}>
                      <Icon name={f.icon} /><span><b>{f.label}{(settings.newFormat ?? "markdown") === f.id ? <em className="default-tag">default</em> : null}</b><small>{f.hint}</small></span></button>
                  ))}
                  <button className="menu-item" onClick={() => { setShowNew(false); pickFiles(); }}><Icon name="upload" /><span><b>Import file…</b><small>PDF, image, Word, PowerPoint, Excel, CSV, text…</small></span></button>
                  <div className="nav-group">Markdown templates</div>
                  {Object.entries(TEMPLATES).map(([k, t]) => (
                    <button key={k} className="menu-item compact" onClick={() => newNote({ title: t.title, body: t.body })}>{k}</button>
                  ))}
                </div>
              </>)}
            </div>
          </div>
          <label className="search">
            <Icon name="search" />
            <input placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notes" />
            {query && <button aria-label="Clear search" onClick={() => setQuery("")}><Icon name="close" /></button>}
          </label>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {conflicts > 0 && (
            <div className="notice my-2 rounded-lg text-xs" role="status">
              <span className="flex-1">{conflicts === 1 ? "A note was" : `${conflicts} notes were`} changed in another tab or window at the same time. Both versions are kept: look for “(conflict copy)”.</span>
              <button className="btn" onClick={clearConflicts}>OK</button>
            </div>
          )}
          {view.kind === "trash" && (
            <div className="notice my-2 rounded-lg text-xs">
              <span className="flex-1">Deleted notes are kept {TRASH_DAYS} days.</span>
              {visible.length > 0 && <button className="btn" onClick={() => confirm(`Permanently delete ${visible.length} note(s)?`) && (emptyTrash(), setSelected(null))}>Empty trash</button>}
            </div>)}
          {visible.length === 0 && <div className="empty-list">{query ? `No notes match “${query}”.` : view.kind === "trash" ? "Trash is empty." : view.kind === "archive" ? "Archived notes appear here." : view.kind === "scribbles" ? "Scribble pages, and notes you have written on, appear here." : view.kind === "folder" ? "This folder is empty. Press New to add a note here, or drag notes onto the folder." : "No notes yet. Press New to write one."}</div>}
          {visible.map((n) => (
            <button key={n.id} onClick={() => setSelected(n.id)} className={`note-card ${n.id === selected ? "on" : ""}`}
              draggable={!n.deletedAt} onDragStart={(e) => { e.dataTransfer.setData("text/x-webnotes-note", n.id); e.dataTransfer.effectAllowed = "move"; }}>
              <div className="flex items-center gap-1.5">
                {(n.kind === "canvas" || !!n.ink?.length) && <Icon name="scribble" className="muted" />}
                <span className="note-card-title flex-1 truncate">{n.title || "Untitled"}</span>
                {n.pinned && <Icon name="pin" className="accent-text" />}
              </div>
              <div className="note-card-body">{n.kind === "canvas" ? (n.drawing?.length ? `Scribble page · ${n.drawing.length} strokes and shapes` : "Empty scribble page") : n.body.replace(/!?\[([^\]]*)\]\((?:asset:)?[^)]*\)/g, "$1").replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "").replace(/[#*`>|\[\]$]|(^|\s)-(?=\s)/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Empty note"}</div>
              <div className="note-card-meta">
                <span>{n.deletedAt ? `Deleted ${ago(n.deletedAt)}` : ago(n.updatedAt)}</span>
                {(n.kind === "canvas" || (n.format && n.format !== "markdown")) && <span className="pill">{formatLabel(n)}</span>}
                {n.folder && <span className="pill"><Icon name="folder" />{n.folder}</span>}
                {n.tags.slice(0, 3).map((t) => <span key={t} className="pill">#{t}</span>)}
              </div>
            </button>
          ))}
        </div>
      </section>

      <main className={`main-pane pane pane-strong pane-3 min-w-0 flex-1 ${current ? "block" : "hidden md:block"}`}>
        {current ? (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
              <Editor key={current.id} note={current} folders={folders} notes={live}
                extra={<button className={`btn ${showAI ? "btn-primary" : ""}`} title="AI assistant (⌘J)" aria-label="AI assistant" onClick={() => setShowAI((v) => !v)}><Icon name="sparkle" /><span className="hidden sm:inline">AI</span></button>}
                onOpenNote={(id) => { setBack(current.id); setSelected(id); }} onNewSketch={() => { const id = create({ kind: "canvas", drawing: [], title: "Sketch" }); return id; }}
                onSend={() => setTransfer({ mode: "send", noteIds: [current.id] })}
                leading={<>
                  <button className="btn icon-btn ghost md:hidden" aria-label="Back to list" onClick={() => setSelected(null)}><Icon name="back" /></button>
                  {toggles}
                  {back && notes.some((n) => n.id === back) && <button className="btn ghost" onClick={() => { setSelected(back); setBack(null); }}><Icon name="back" /> Back</button>}
                </>}
                onChange={(p) => update(current.id, p)} onDelete={() => { remove(current.id); setSelected(null); }}
                onRestore={() => { restore(current.id); setView({ kind: "all" }); }} onPurge={() => { purge(current.id); setSelected(null); }}
                onWikiLink={(title) => { const hit = live.find((n) => n.title.trim().toLowerCase() === title.trim().toLowerCase()); if (hit) { setBack(current.id); setSelected(hit.id); } else if (confirm(`Create a new note called "${title}"?`)) { const id = create({ title }); setBack(current.id); setSelected(id); } }} />
            </div>
          </div>
        ) : (
          <div className="empty-main">
            <div className="empty-sheet">
              <p className="empty-title">Pick a note, or start something new.</p>
              <div className="type-tiles" role="list" aria-label="New note type">
                {FORMATS.map((f) => {
                  const def = f.id === (settings.newFormat ?? "markdown");
                  return (
                    <button key={f.id} role="listitem" className={`type-tile ${def ? "on" : ""}`} title={f.hint}
                      onClick={() => (f.id === "scribble" ? setPickPaper(true) : newNote(newNoteOf(f.id)))}>
                      <Icon name={f.icon} />
                      <b>{f.label}{def && <span className="default-tag">default</span>}</b>
                      <small>{f.hint}</small>
                    </button>
                  );
                })}
              </div>
              <button className="btn mt-3" onClick={pickFiles}><Icon name="upload" /> Import a file</button>
              <p className="empty-note">Word, PDF, Excel, PowerPoint, images, code and more. Each opens as its own type.</p>
              <dl className="shortcuts">
                <div><dt><kbd>⌘</kbd><kbd>J</kbd></dt><dd>AI assistant</dd></div>
                <div><dt><kbd>⌘</kbd><kbd>\</kbd></dt><dd>Focus mode</dd></div>
                <div><dt><kbd>[[</kbd></dt><dd>Link a note</dd></div>
              </dl>
            </div>
          </div>
        )}
      </main>

      {showAI && (
        <aside className="ai-pane pane fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-96 md:shrink-0">
          <AIPanel ai={ai} setAI={setAI} notes={live} note={current} onClose={() => setShowAI(false)}
            onInsert={(text) => current && current.kind === "doc" && update(current.id, appendText(current, text))} />
        </aside>
      )}
      {!showAI && !current && <button className="btn fab" title="AI assistant (⌘J)" onClick={() => setShowAI(true)}><Icon name="sparkle" /> AI</button>}

      {importing && <ImportDialog files={importing} onDone={imported} onClose={() => setImporting(null)} />}
      {transfer && <TransferDialog notes={notes} folders={folders} start={transfer} onImport={importNotes} onClose={() => setTransfer(null)}
        onFolders={(names) => setSettings((s) => ({ ...s, folders: [...new Set([...(s.folders ?? []), ...names])] }))} />}
      {pickPaper && <NewPageDialog onCreate={newScribble} onClose={() => setPickPaper(false)} />}
      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} notes={notes} onImport={importNotes} backup={backup} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/** the little box for typing a folder name (new folder or rename) */
function FolderNameBox({ initial = "", onDone, onCancel }: { initial?: string; onDone: (name: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  return (
    <form className="folder-name" onSubmit={(e) => { e.preventDefault(); onDone(v); }}>
      <Icon name="folder" />
      <input autoFocus className="field" aria-label="Folder name" placeholder="Folder name" value={v} maxLength={60}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }} onBlur={() => (v.trim() ? onDone(v) : onCancel())} />
    </form>
  );
}
