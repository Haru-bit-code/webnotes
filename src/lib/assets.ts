"use client";
// Binary files (images, PDF pages, attachments) live in IndexedDB, not in the notes JSON,
// because browser localStorage only holds a few MB. Notes refer to them as "asset:<id>".
import { useEffect, useState } from "react";
import { saveFile } from "./save";

const DB = "webnotes-assets", STORE = "files";
export type Asset = { id: string; blob: Blob; name: string; type: string; size: number; createdAt: number };

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  if (!dbp) dbp = new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; fail(r.error); };
  });
  return dbp;
}
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
  const d = await db();
  return new Promise<T>((ok, fail) => { const q = f(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => ok(q.result); q.onerror = () => fail(q.error); });
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export async function putAsset(blob: Blob, name = "file", type = blob.type): Promise<string> {
  const id = uid();
  try { await tx("readwrite", (s) => s.put({ id, blob, name, type, size: blob.size, createdAt: Date.now() } as Asset)); }
  catch { throw new Error("Couldn't save the file in this browser (storage may be full or blocked in private browsing)."); }
  return id;
}
export const getAsset = (id: string) => tx<Asset | undefined>("readonly", (s) => s.get(id));
export const listAssets = () => tx<Asset[]>("readonly", (s) => s.getAll());
/** store a file under a known id (used when restoring a backup) */
export async function putAssetWithId(a: Asset) {
  try { await tx("readwrite", (s) => s.put(a)); urls.delete(a.id); }
  catch { throw new Error("Couldn't save a file from the backup (browser storage may be full)."); }
}

// one object URL per asset for the whole session
const urls = new Map<string, Promise<string | null>>();
export function assetUrl(id: string) {
  if (!urls.has(id)) urls.set(id, getAsset(id).then((a) => (a ? URL.createObjectURL(a.blob) : null)).catch(() => null));
  return urls.get(id)!;
}
export function useAssetUrl(id?: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; if (id) assetUrl(id).then((u) => on && setUrl(u)); return () => { on = false; }; }, [id]);
  return url;
}
export async function assetDataUrl(id: string) {
  const a = await getAsset(id); if (!a) return null;
  return new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(a.blob); });
}
export async function downloadAsset(id: string, fallbackName = "file") {
  const a = await getAsset(id); if (!a) { alert("This file isn't stored in this browser. It may have been imported on another device."); return; }
  await saveFile(a.blob, a.name || fallbackName);
}
export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
