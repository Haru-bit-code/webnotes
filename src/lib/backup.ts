"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Note } from "./types";

// Auto-backup to a file the user picks (File System Access API: Chrome, Edge, Arc, Brave; not Safari/Firefox).
// Put that file in iCloud Drive / Dropbox / Google Drive and it doubles as sync between your devices:
// "Sync now" merges whichever copy of each note was edited last, then writes the merged result back.
type FileHandle = { name: string; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File>;
  queryPermission(o: { mode: "readwrite" }): Promise<string>; requestPermission(o: { mode: "readwrite" }): Promise<string> };

const DB = "webnotes", STORE = "kv", KEY = "backup-handle";
const idb = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGet = async (): Promise<FileHandle | null> => { try { const db = await idb(); return await new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); } catch { return null; } };
const idbSet = async (v: FileHandle | null) => { try { const db = await idb(); const st = db.transaction(STORE, "readwrite").objectStore(STORE); v ? st.put(v, KEY) : st.delete(KEY); } catch { /* ignore */ } };

export const backupSupported = () => typeof window !== "undefined" && "showSaveFilePicker" in window;
const payload = (notes: Note[]) => JSON.stringify(notes, null, 2);

export type BackupState = { name: string; status: "off" | "ok" | "needs-permission" | "error"; at: number | null; msg: string };

export function useBackup(notes: Note[], ready: boolean, importNotes: (n: Note[]) => void) {
  const handle = useRef<FileHandle | null>(null);
  const [state, setState] = useState<BackupState>({ name: "", status: "off", at: null, msg: "" });
  const latest = useRef(notes); latest.current = notes;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = useCallback(async () => {
    const h = handle.current; if (!h) return;
    try {
      if ((await h.queryPermission({ mode: "readwrite" })) !== "granted") { setState((s) => ({ ...s, status: "needs-permission", msg: "Click Reconnect to let the app write the backup file again." })); return; }
      const w = await h.createWritable(); await w.write(payload(latest.current)); await w.close();
      setState({ name: h.name, status: "ok", at: Date.now(), msg: "" });
    } catch (e) { setState((s) => ({ ...s, status: "error", msg: (e as Error).message })); }
  }, []);

  useEffect(() => { // reconnect to the previously chosen file
    idbGet().then(async (h) => {
      if (!h) return; handle.current = h;
      const p = await h.queryPermission({ mode: "readwrite" }).catch(() => "prompt");
      setState({ name: h.name, status: p === "granted" ? "ok" : "needs-permission", at: null, msg: p === "granted" ? "" : "Click Reconnect to resume automatic backups." });
    });
  }, []);

  useEffect(() => { // debounced auto-write whenever notes change
    if (!ready || !handle.current || state.status === "needs-permission" || state.status === "off") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(write, 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [notes, ready, state.status, write]);

  const choose = async () => {
    try {
      const h: FileHandle = await (window as unknown as { showSaveFilePicker: (o: object) => Promise<FileHandle> }).showSaveFilePicker({ suggestedName: "webnotes-backup.json", types: [{ description: "WebNotes backup", accept: { "application/json": [".json"] } }] });
      handle.current = h; await idbSet(h); await write();
    } catch (e) { if ((e as Error).name !== "AbortError") setState((s) => ({ ...s, status: "error", msg: (e as Error).message })); }
  };
  const reconnect = async () => {
    const h = handle.current; if (!h) return;
    if ((await h.requestPermission({ mode: "readwrite" })) === "granted") await write();
  };
  const stop = async () => { handle.current = null; await idbSet(null); setState({ name: "", status: "off", at: null, msg: "" }); };
  // read the file, merge newer notes into the app, then write the merged set back
  const syncNow = async () => {
    const h = handle.current; if (!h) return;
    try {
      if ((await h.requestPermission({ mode: "readwrite" })) !== "granted") return;
      const data = JSON.parse(await (await h.getFile()).text());
      if (Array.isArray(data)) importNotes(data as Note[]);
      setState((s) => ({ ...s, msg: "Merged the file into your notes; writing the result back…" }));
      setTimeout(write, 500);
    } catch (e) { setState((s) => ({ ...s, status: "error", msg: "Couldn't read the file: " + (e as Error).message })); }
  };
  return { state, choose, reconnect, stop, syncNow, supported: backupSupported() };
}
