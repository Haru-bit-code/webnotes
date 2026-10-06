"use client";
import { useCallback, useEffect, useState } from "react";
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

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cutoff = Date.now() - TRASH_DAYS * 86400000;
    setNotes(load<Note[]>(NOTES_KEY, []).map((n) => ({ ...n, kind: n.kind ?? "doc" })).filter((n) => !n.deletedAt || n.deletedAt > cutoff));
    setSettings({ ...defaultSettings, ...load<Partial<Settings>>(SETTINGS_KEY, {}) });
    setReady(true);
  }, []);

  useEffect(() => { if (ready) localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }, [notes, ready]);
  useEffect(() => { if (ready) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings, ready]);

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
  const purge = useCallback((id: string) => setNotes((p) => p.filter((n) => n.id !== id)), []);
  const emptyTrash = useCallback(() => setNotes((p) => p.filter((n) => !n.deletedAt)), []);

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

  return { notes, settings, setSettings, ready, create, update, remove, restore, purge, emptyTrash, importNotes };
}
