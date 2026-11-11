"use client";
// Templates the user saves from their own pages. Kept in this browser (localStorage) and
// shared between open components with a window event. Export/Import moves them between devices.
import { useCallback, useEffect, useState } from "react";
import { El, Paper } from "./types";
import { saveFile } from "./save";

export type CustomTemplate = { id: string; name: string; cat: string; kind: "block" | "page"; paper?: Paper; els: El[]; createdAt: number };
const KEY = "webnotes:templates", EVT = "webnotes:templates";
const uid = () => Math.random().toString(36).slice(2, 10);

function read(): CustomTemplate[] { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function write(list: CustomTemplate[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { alert("Couldn't save the template: browser storage is full."); return; }
  window.dispatchEvent(new Event(EVT));
}

export function useCustomTemplates() {
  const [list, setList] = useState<CustomTemplate[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync(); window.addEventListener(EVT, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const add = useCallback((t: Omit<CustomTemplate, "id" | "createdAt">) => write([{ ...t, id: uid(), createdAt: Date.now() }, ...read()]), []);
  const remove = useCallback((id: string) => write(read().filter((t) => t.id !== id)), []);
  const exportFile = useCallback(() => {
    saveFile(new Blob([JSON.stringify({ webnotesTemplates: 1, templates: read() }, null, 2)], { type: "application/json" }), `webnotes-templates-${new Date().toISOString().slice(0, 10)}.json`);
  }, []);
  const importFile = useCallback(async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      const incoming: CustomTemplate[] = (Array.isArray(data) ? data : data.templates ?? []).filter((t: CustomTemplate) => t && Array.isArray(t.els) && t.name);
      const have = read(), ids = new Set(have.map((t) => t.id));
      const fresh = incoming.filter((t) => !ids.has(t.id)).map((t) => ({ ...t, kind: t.kind === "page" ? "page" : "block", cat: t.cat || "My templates" } as CustomTemplate));
      write([...fresh, ...have]); return fresh.length;
    } catch { return 0; }
  }, []);
  const cats = [...new Set(list.filter((t) => t.kind === "block").map((t) => t.cat))];
  return { list, cats, pages: list.filter((t) => t.kind === "page"), add, remove, exportFile, importFile };
}
