"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Note, Settings, defaultSettings } from "./types";

const NOTES_KEY = "webnotes:notes";
const SETTINGS_KEY = "webnotes:settings";

export const TRASH_DAYS = 30;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---- keeping several tabs / windows in step ----
// Every tab keeps its own copy of the notes. Saving the whole copy would let one tab wipe out what another
// tab just wrote, so each save merges note-by-note with what is actually stored:
//  - the newer copy of a note wins;
//  - if both sides changed the same note since they last agreed, the other version is kept as a "conflict copy";
//  - notes deleted for good are remembered (PURGED_KEY) so another tab can't bring them back.
const PURGED_KEY = "webnotes:purged";
let warned = false; // "storage full" is shown once, not on every keystroke
const REV_KEY = "webnotes:rev";
const sameContent = (a: Note, b: Note) =>
  a.title === b.title && a.body === b.body && a.html === b.html && JSON.stringify(a.sheets ?? null) === JSON.stringify(b.sheets ?? null)
  && JSON.stringify(a.drawing ?? null) === JSON.stringify(b.drawing ?? null) && JSON.stringify(a.ink ?? null) === JSON.stringify(b.ink ?? null);

/** merge another copy of the notes into ours; `base` = the version of each note both sides last agreed on */
export function mergeNotes(mine: Note[], theirs: Note[], base: Map<string, number>, purged: Record<string, number>) {
  const theirsById = new Map(theirs.map((n) => [n.id, n]));
  const out: Note[] = []; const copies: Note[] = []; const seen = new Set<string>();
  for (const m of mine) {
    if (purged[m.id]) continue;
    seen.add(m.id);
    const t = theirsById.get(m.id);
    if (!t || t.updatedAt === m.updatedAt) { out.push(m); continue; }
    const b = base.get(m.id) ?? 0;
    const bothChanged = m.updatedAt > b && t.updatedAt > b && b > 0 && !sameContent(m, t);
    const [win, lose] = t.updatedAt > m.updatedAt ? [t, m] : [m, t];
    out.push(win);
    if (bothChanged && !(lose.deletedAt || win.deletedAt)) {
      copies.push({ ...lose, id: uid(), title: `${lose.title || "Untitled"} (conflict copy)`, pinned: false, updatedAt: Date.now(), createdAt: Date.now() });
    }
  }
  for (const t of theirs) if (!seen.has(t.id) && !purged[t.id]) out.push(t);
  return { notes: copies.length ? [...copies, ...out] : out, conflicts: copies.length };
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const base = useRef(new Map<string, number>()); // updatedAt of each note as last read from / written to storage
  const rev = useRef<string | null>(null);         // storage revision this tab last saw
  const [conflicts, setConflicts] = useState(0);
  const remember = (list: Note[]) => { base.current = new Map(list.map((n) => [n.id, n.updatedAt])); };

  useEffect(() => {
    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    const list = load<Note[]>(NOTES_KEY, []).map((n) => ({ ...n, kind: n.kind ?? "doc" })).filter((n) => !n.deletedAt || n.deletedAt > cutoff);
    remember(list); rev.current = localStorage.getItem(REV_KEY);
    setNotes(list);
    setSettings({ ...defaultSettings, ...load<Partial<Settings>>(SETTINGS_KEY, {}) });
    setReady(true);
  }, []);

  // save: if another tab wrote since we last looked, merge with it first
  useEffect(() => {
    if (!ready) return;
    let list = notes;
    const stored = localStorage.getItem(REV_KEY);
    if (stored !== rev.current) {
      const r = mergeNotes(notes, load<Note[]>(NOTES_KEY, []), base.current, load<Record<string, number>>(PURGED_KEY, {}));
      list = r.notes; if (r.conflicts) setConflicts((c) => c + r.conflicts);
    }
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(list));
      rev.current = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      localStorage.setItem(REV_KEY, rev.current);
      remember(list);
    } catch (e) {
      if (!warned) { warned = true; alert("Your latest changes couldn't be saved: this browser's storage is full. Make a full backup (Settings → Backup), then delete large notes or files. (" + (e as Error).message + ")"); }
    }
    if (list !== notes) setNotes(list);
  }, [notes, ready]);

  // another tab saved: bring its changes in
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === NOTES_KEY && e.newValue) {
        let theirs: Note[]; try { theirs = JSON.parse(e.newValue); } catch { return; }
        setNotes((mine) => {
          const r = mergeNotes(mine, theirs, base.current, load<Record<string, number>>(PURGED_KEY, {}));
          if (r.conflicts) setConflicts((c) => c + r.conflicts);
          rev.current = localStorage.getItem(REV_KEY); remember(theirs);
          return r.notes;
        });
      }
      if (e.key === SETTINGS_KEY && e.newValue) { try { setSettings({ ...defaultSettings, ...JSON.parse(e.newValue) }); } catch { /* ignore */ } }
    };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, []);
  useEffect(() => { if (ready) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings, ready]);

  const forget = (ids: string[]) => { // deleted for good: remember for 90 days so other tabs drop them too
    const p = load<Record<string, number>>(PURGED_KEY, {}), now = Date.now(), old = now - 90 * 86400000;
    for (const id of ids) p[id] = now;
    for (const [k, t] of Object.entries(p)) if (t < old) delete p[k];
    try { localStorage.setItem(PURGED_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  };

  const create = useCallback((init: Partial<Note> = {}): string => {
    const now = Date.now();
    const n: Note = { id: uid(), kind: "doc", title: "", body: "", folder: "", tags: [], pinned: false, archived: false, createdAt: now, updatedAt: now, ...init };
    setNotes((p) => [n, ...p]);
    return n.id;
  }, []);

  const update = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((p) => p.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
  }, []);

  // delete = move to the trash; restore brings it back; purge removes it for good
  const remove = useCallback((id: string) => setNotes((p) => p.map((n) => (n.id === id ? { ...n, deletedAt: Date.now() } : n))), []);
  const restore = useCallback((id: string) => setNotes((p) => p.map((n) => { if (n.id !== id) return n; const { deletedAt, ...rest } = n; void deletedAt; return { ...rest, updatedAt: Date.now() }; })), []);
  const purge = useCallback((id: string) => { forget([id]); setNotes((p) => p.filter((n) => n.id !== id)); }, []);
  const emptyTrash = useCallback(() => setNotes((p) => { forget(p.filter((n) => n.deletedAt).map((n) => n.id)); return p.filter((n) => !n.deletedAt); }), []);

  // merge notes from a file: unknown ids are added, known ids take whichever copy was edited last
  const importNotes = useCallback((incoming: Note[]) => {
    setNotes((p) => {
      const byId = new Map(p.map((n) => [n.id, n]));
      const out = [...p];
      for (const n of incoming) {
        if (!n?.id) continue;
        const cur = byId.get(n.id);
        if (!cur) out.unshift({ ...n, kind: n.kind ?? "doc" });
        else if ((n.updatedAt ?? 0) > cur.updatedAt) out[out.indexOf(cur)] = { ...n, kind: n.kind ?? "doc" };
      }
      return out;
    });
  }, []);

  return { notes, settings, setSettings, ready, create, update, remove, restore, purge, emptyTrash, importNotes, conflicts, clearConflicts: () => setConflicts(0) };
}
