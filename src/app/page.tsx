"use client";
import { useEffect, useMemo, useState } from "react";
import { useNotes } from "@/lib/store";
import { Note } from "@/lib/types";
import { Editor } from "@/components/Editor";
import { SettingsPanel } from "@/components/Settings";
import { TEMPLATES } from "@/lib/templates";
import { AIPanel } from "@/components/AIPanel";
import { AISettings, defaultAI, normalizeAI } from "@/lib/ai";

type View = { kind: "all" } | { kind: "archive" } | { kind: "folder"; name: string } | { kind: "tag"; name: string };

const FONTS = {
  sans: "ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, serif",
  mono: "ui-monospace, SFMono-Regular, monospace",
};

export default function Home() {
  const { notes, settings, setSettings, ready, create, update, remove, importNotes } = useNotes();
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

  const folders = useMemo(() => [...new Set(notes.filter((n) => !n.archived && n.folder).map((n) => n.folder))].sort(), [notes]);
  const tags = useMemo(() => [...new Set(notes.filter((n) => !n.archived).flatMap((n) => n.tags))].sort(), [notes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (view.kind === "archive") return n.archived;
        if (n.archived) return false;
        if (view.kind === "folder") return n.folder === view.name;
        if (view.kind === "tag") return n.tags.includes(view.name);
        return true;
      })
      .filter((n) => !q || (n.title + " " + n.body + " " + n.tags.join(" ") + " " + (n.drawing ?? []).map((e) => e.text ?? "").join(" ")).toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [notes, view, query]);

  const current = notes.find((n) => n.id === selected) ?? null;
  const isView = (v: View) => JSON.stringify(v) === JSON.stringify(view);
  const navItem = (v: View, label: string, count?: number) => (
    <button key={label} onClick={() => { setView(v); setSelected(null); }}
      className={`hover-row flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${isView(v) ? "active-row" : ""}`}>
      <span className="truncate">{label}</span>{count !== undefined && <span className="muted text-xs">{count}</span>}
    </button>
  );

  const [showNew, setShowNew] = useState(false);
  const newNote = (init: Partial<Note> = {}) => {
    setShowNew(false);
    const id = create({ folder: view.kind === "folder" ? view.name : "", tags: view.kind === "tag" ? [view.name] : [], ...init });
    if (view.kind === "archive") setView({ kind: "all" });
    setSelected(id);
  };

  if (!ready) return null;

  return (
    <div className="flex h-screen">
      <aside className={`bg-panel bd hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3 ${hideSide ? "" : "md:flex"}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="accent-text text-lg font-bold">WebNotes</span>
          <button className="btn" onClick={() => setShowSettings(true)}>⚙</button>
        </div>
        {navItem({ kind: "all" }, "All notes", notes.filter((n) => !n.archived).length)}
        {navItem({ kind: "archive" }, "Archive", notes.filter((n) => n.archived).length)}
        {folders.length > 0 && <div className="muted mt-3 text-xs uppercase">Folders</div>}
        {folders.map((f) => navItem({ kind: "folder", name: f }, "📁 " + f, notes.filter((n) => !n.archived && n.folder === f).length))}
        {tags.length > 0 && <div className="muted mt-3 text-xs uppercase">Tags</div>}
        {tags.map((t) => navItem({ kind: "tag", name: t }, "# " + t, notes.filter((n) => !n.archived && n.tags.includes(t)).length))}
      </aside>

      <section className={`bd w-full shrink-0 flex-col border-r md:w-72 ${current ? "hidden" : "flex"} ${hideList ? "" : "md:flex"} ${hideList && current ? "" : ""}`}>
        <div className="bd flex gap-2 border-b p-3">
          <button className="btn hidden md:block" title="Toggle sidebar" onClick={() => setHideSide((v) => !v)}>{hideSide ? "☰" : "⇤"}</button>
          <input className="bd min-w-0 flex-1 rounded border px-2 py-1 text-sm" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="relative">
            <button className="btn accent-bg" onClick={() => setShowNew((v) => !v)}>+ New</button>
            {showNew && (
              <div className="bg-panel bd absolute left-0 top-full z-40 mt-1 w-52 rounded-lg border p-1 text-sm shadow-lg">
                <button className="hover-row block w-full rounded px-2 py-1.5 text-left" onClick={() => newNote()}>📝 Markdown note</button>
                <button className="hover-row block w-full rounded px-2 py-1.5 text-left" onClick={() => newNote({ kind: "canvas", drawing: [] })}>🎨 Canvas / sketch</button>
                <div className="muted px-2 pt-2 text-xs uppercase">Templates</div>
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <button key={k} className="hover-row block w-full rounded px-2 py-1.5 text-left" onClick={() => newNote({ title: t.title, body: t.body })}>{k}</button>
                ))}
              </div>
            )}
          </div>
          <button className="btn md:hidden" onClick={() => setShowSettings(true)}>⚙</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && <p className="muted p-4 text-sm">No notes here yet.</p>}
          {visible.map((n) => (
            <button key={n.id} onClick={() => setSelected(n.id)}
              className={`hover-row bd block w-full border-b px-3 py-2 text-left ${n.id === selected ? "active-row" : ""}`}>
              <div className="truncate font-medium">{n.pinned && "📌 "}{n.kind === "canvas" && "🎨 "}{n.title || "Untitled"}</div>
              <div className="muted truncate text-xs">{n.kind === "canvas" ? `Canvas · ${n.drawing?.length ?? 0} objects` : n.body.replace(/[#*`>\-\[\]$]/g, "").slice(0, 80) || "Empty note"}</div>
              <div className="muted mt-0.5 text-[11px]">{new Date(n.updatedAt).toLocaleDateString()}{n.folder && ` · ${n.folder}`}{n.tags.map((t) => ` #${t}`)}</div>
            </button>
          ))}
        </div>
      </section>

      <main className={`min-w-0 flex-1 ${current ? "block" : "hidden md:block"}`}>
        {current ? (
          <div className="flex h-full flex-col">
            <button className="btn m-2 self-start md:hidden" onClick={() => setSelected(null)}>← Back</button>
            <div className="min-h-0 flex-1">
              <Editor key={current.id} note={current} folders={folders} notes={notes}
                extra={<button className={`btn ${showAI ? "accent-bg" : ""}`} title="AI assistant (⌘J)" onClick={() => setShowAI((v) => !v)}>✨ AI</button>}
                onOpenNote={(id) => { setBack(current.id); setSelected(id); }} onNewSketch={() => { const id = create({ kind: "canvas", drawing: [], title: "Sketch" }); return id; }}
                leading={<span className="hidden gap-1 md:flex">
                  <button className="btn" title="Toggle sidebar" onClick={() => setHideSide((v) => !v)}>{hideSide ? "☰" : "⇤"}</button>
                  <button className="btn" title="Toggle note list (⌘\\ hides both)" onClick={() => setHideList((v) => !v)}>{hideList ? "▤" : "⇤"}</button>
                  {back && notes.some((n) => n.id === back) && <button className="btn" onClick={() => { setSelected(back); setBack(null); }}>← back</button>}
                </span>}
                onChange={(p) => update(current.id, p)} onDelete={() => { remove(current.id); setSelected(null); }} />
            </div>
          </div>
        ) : (
          <div className="muted flex h-full items-center justify-center">Select a note or create a new one</div>
        )}
      </main>

      {showAI && (
        <aside className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto md:w-96 md:shrink-0">
          <AIPanel ai={ai} setAI={setAI} notes={notes} note={current} onClose={() => setShowAI(false)}
            onInsert={(text) => current && update(current.id, { body: current.body.replace(/\s*$/, "") + "\n\n" + text + "\n" })} />
        </aside>
      )}
      {!showAI && !current && <button className="btn fixed bottom-4 right-4 z-30 shadow" title="AI assistant (⌘J)" onClick={() => setShowAI(true)}>✨ AI</button>}

      {showSettings && <SettingsPanel settings={settings} onChange={setSettings} notes={notes} onImport={importNotes} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
