"use client";
import { useCallback, useEffect, useState } from "react";
import { Note, Settings, defaultSettings } from "./types";

const NOTES_KEY = "webnotes:notes";
const SETTINGS_KEY = "webnotes:settings";

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
    setNotes(load<Note[]>(NOTES_KEY, []).map((n) => ({ ...n, kind: n.kind ?? "doc" })));
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

  const remove = useCallback((id: string) => setNotes((p) => p.filter((n) => n.id !== id)), []);

  const importNotes = useCallback((incoming: Note[]) => {
    setNotes((p) => {
      const ids = new Set(p.map((n) => n.id));
      return [...incoming.filter((n) => !ids.has(n.id)), ...p];
    });
  }, []);

  return { notes, settings, setSettings, ready, create, update, remove, importNotes };
}
