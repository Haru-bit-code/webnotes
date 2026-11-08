"use client";
import { useEffect, useMemo, useState } from "react";
import { useNotes, TRASH_DAYS } from "@/lib/store";
import { Note } from "@/lib/types";
import { Editor } from "@/components/Editor";
import { SettingsPanel } from "@/components/Settings";
import { TEMPLATES } from "@/lib/templates";
import { useBackup } from "@/lib/backup";
import { AIPanel } from "@/components/AIPanel";
import { AISettings, defaultAI, normalizeAI } from "@/lib/ai";
import { Icon } from "@/components/Icon";

type View = { kind: "all" } | { kind: "archive" } | { kind: "trash" } | { kind: "folder"; name: string } | { kind: "tag"; name: string };

const FONTS = {
  sans: "\"Hanken Grotesk\", ui-sans-serif, system-ui, sans-serif",
  serif: "Newsreader, ui-serif, Georgia, serif",
  mono: "\"JetBrains Mono\", ui-monospace, SFMono-Regular, monospace",
};

export default function Home() {
  const { notes, settings, setSettings, ready, create, update, remove, restore, purge, emptyTrash, importNotes } = useNotes();
  const backup = useBackup(notes, ready, importNotes);
  const live = useMemo(() => notes.filter((n) => !n.deletedAt), [notes]); // everything except the trash
  const [view, setView] = useState<View>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
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
    root.style.setProperty("--font-body", FONTS[settings.font]);
    root.style.setProperty("--font-size", settings.fontSize + "px");
    return () => mq.removeEventListener("change", apply);
  }, [settings]);

  const folders = useMemo(() => [...new Set(live.filter((n) => !n.archived && n.folder).map((n) => n.folder))].sort(), [live]);
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
        return true;
      })
      .filter((n) => !q || (n.title + " " + n.body + " " + n.tags.join(" ") + " " + (n.drawing ?? []).map((e) => e.text ?? "").join(" ")).toLowerCase().includes(q))
      .sort((a, b) => (view.kind === "trash" ? (b.deletedAt ?? 0) - (a.deletedAt ?? 0) : Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt));
  }, [notes, view, query]);

  const current = notes.find((n) => n.id === selected) ?? null;
  const isView = (v: View) => JSON.stringify(v) === JSON.stringify(view);
  const navItem = (v: View, label: string, icon: string, count?: number) => (
    <button key={label} onClick={() => { setView(v); setSelected(null); }} aria-current={isView(v) ? "page" : undefined}
      className={`nav-item ${isView(v) ? "on" : ""}`}>
      <Icon name={icon} /><span className="flex-1 truncate">{label}</span>{count !== undefined && count > 0 && <span className="count">{count}</span>}
    </button>
  );

  const [showNew, setShowNew] = useState(false);
  const newNote = (init: Partial<Note> = {}) => {
    setShowNew(false);
    const id = create({ folder: view.kind === "folder" ? view.name : "", tags: view.kind === "tag" ? [view.name] : [], ...init });
    if (view.kind === "archive" || view.kind === "trash") setView({ kind: "all" });
    setSelected(id);
  };

  const viewTitle = view.kind === "all" ? "All notes" : view.kind === "archive" ? "Archive" : view.kind === "trash" ? "Trash" : view.kind === "folder" ? view.name : "#" + view.name;
  const ago = (t: number) => { const d = (Date.now() - t) / 60000; return d < 1 ? "just now" : d < 60 ? `${Math.floor(d)} min ago` : d < 1440 ? `${Math.floor(d / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" }); };
  const toggles = <span className="hidden gap-1 md:flex">
    <button className="btn icon-btn ghost" title="Toggle sidebar" aria-label="Toggle sidebar" onClick={() => setHideSide((v) => !v)}><Icon name="sidebar" /></button>
    <button className="btn icon-btn ghost" title="Toggle note list (⌘\\ hides both)" aria-label="Toggle note list" onClick={() => setHideList((v) => !v)}><Icon name="list" /></button>
  </span>;

  if (!ready) return null;

  return (
    <div className="app flex h-[100dvh]">
      <aside className={`sidebar hidden w-60 shrink-0 flex-col ${hideSide ? "" : "md:flex"}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="pen" /></span>
          <span className="brand-name">WebNotes</span>
          <button className="btn icon-btn ghost ml-auto" aria-label="Settings" title="Settings" onClick={() => setShowSettings(true)}><Icon name="settings" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {navItem({ kind: "all" }, "All notes", "notes", live.filter((n) => !n.archived).length)}
          {navItem({ kind: "archive" }, "Archive", "archive", live.filter((n) => n.archived).length)}
          {navItem({ kind: "trash" }, "Trash", "trash", notes.length - live.length)}
          {folders.length > 0 && <div className="nav-group">Folders</div>}
          {folders.map((f) => navItem({ kind: "folder", name: f }, f, "folder", live.filter((n) => !n.archived && n.folder === f).length))}
          {tags.length > 0 && <div className="nav-group">Tags</div>}
          {tags.map((t) => navItem({ kind: "tag", name: t }, t, "tag", live.filter((n) => !n.archived && n.tags.includes(t)).length))}
        </nav>
      </aside>

      <section className={`list-pane w-full shrink-0 flex-col md:w-80 ${current ? "hidden" : "flex"} ${hideList ? "" : "md:flex"}`}>
        <div className="list-head">
          <div className="flex items-center gap-2">
            {hideSide && <button className="btn icon-btn ghost hidden md:inline-flex" title="Show sidebar" aria-label="Show sidebar" onClick={() => setHideSide(false)}><Icon name="sidebar" /></button>}
            <h1 className="list-title flex-1 truncate">{viewTitle}</h1>
            <button className="btn icon-btn ghost md:hidden" aria-label="Settings" onClick={() => setShowSettings(true)}><Icon name="settings" /></button>
            <div className="relative">
              <button className="btn btn-primary" aria-expanded={showNew} onClick={() => setShowNew((v) => !v)}><Icon name="plus" /> New</button>
              {showNew && (<>
                <div className="fixed inset-0 z-30" onClick={() => setShowNew(false)} />
                <div className="menu right-0 w-60">
                  <button className="menu-item" onClick={() => newNote()}><Icon name="notes" /><span><b>Markdown note</b><small>Text, maths, code, diagrams</small></span></button>
                  <button className="menu-item" onClick={() => newNote({ kind: "canvas", drawing: [] })}><Icon name="pen" /><span><b>Canvas</b><small>Freehand sketch and shapes</small></span></button>
                  <div className="nav-group">Templates</div>
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
          {view.kind === "trash" && (
            <div className="notice my-2 rounded-lg text-xs">
              <span className="flex-1">Deleted notes are kept {TRASH_DAYS} days.</span>
              {visible.length > 0 && <button className="btn" onClick={() => confirm(`Permanently delete ${visible.length} note(s)?`) && (emptyTrash(), setSelected(null))}>Empty trash</button>}
            </div>)}
          {visible.length === 0 && <div className="empty-list">{query ? `No notes match “${query}”.` : view.kind === "trash" ? "Trash is empty." : view.kind === "archive" ? "Archived notes appear here." : "No notes yet. Press New to write one."}</div>}
          {visible.map((n) => (
            <button key={n.id} onClick={() => setSelected(n.id)} className={`note-card ${n.id === selected ? "on" : ""}`}>
              <div className="flex items-center gap-1.5">
                {n.kind === "canvas" && <Icon name="pen" className="muted" />}
                <span className="note-card-title flex-1 truncate">{n.title || "Untitled"}</span>
                {n.pinned && <Icon name="pin" className="accent-text" />}
              </div>
              <div className="note-card-body">{n.kind === "canvas" ? `Canvas with ${n.drawing?.length ?? 0} objects` : n.body.replace(/[#*`>\-\[\]$]/g, "").slice(0, 120) || "Empty note"}</div>
              <div className="note-card-meta">
                <span>{n.deletedAt ? `Deleted ${ago(n.deletedAt)}` : ago(n.updatedAt)}</span>
                {n.folder && <span className="pill"><Icon name="folder" />{n.folder}</span>}
                {n.tags.slice(0, 3).map((t) => <span key={t} className="pill">#{t}</span>)}
              </div>
            </button>
          ))}
        </div>
      </section>

      <main className={`min-w-0 flex-1 ${current ? "block" : "hidden md:block"}`}>
        {current ? (
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
              <Editor key={current.id} note={current} folders={folders} notes={live}
                extra={<button className={`btn ${showAI ? "btn-primary" : ""}`} title="AI assistant (⌘J)" onClick={() => setShowAI((v) => !v)}><Icon name="sparkle" /> AI</button>}
                onOpenNote={(id) => { setBack(current.id); setSelected(id); }} onNewSketch={() => { const id = create({ kind: "canvas", drawing: [], title: "Sketch" }); return id; }}
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
              <p className="empty-title">Pick a note, or start a new page.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn btn-primary" onClick={() => newNote()}><Icon name="notes" /> New note</button>
                <button className="btn" onClick={() => newNote({ kind: "canvas", drawing: [] })}><Icon name="pen" /> New canvas</button>
              </div>
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
        <aside className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-96 md:shrink-0">
          <AIPanel ai={ai} setAI={setAI} notes={live} note={current} onClose={() => setShowAI(false)}
            onInsert={(text) => current && update(current.id, { body: (() => { const b = current.body.replace(/\s*$/, ""); const task = /^- \[[ x]\] /.test(text) && /(^|\n)- \[[ x]\] [^\n]*$/.test(b); return b + (task ? "\n" : "\n\n") + text + "\n"; })() })} />
        </aside>
      )}
      {!showAI && !current && <button className="btn fab" title="AI assistant (⌘J)" onClick={() => setShowAI(true)}><Icon name="sparkle" /> AI</button>}

      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} notes={notes} onImport={importNotes} backup={backup} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
