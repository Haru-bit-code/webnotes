"use client";
// Complete backups: one .webnotes file (a zip) with everything needed to rebuild WebNotes on another
// browser or device: notes, every stored file (images, PDF pages, attachments), your own templates and
// your settings. AI keys are deliberately left out.
//
//   manifest.json   what's inside + a SHA-256 fingerprint of every part, used to check the file on restore
//   notes.json      all notes (including archived and trashed ones)
//   templates.json  templates you saved
//   settings.json   appearance settings
//   files/<id>      each stored file
import { Note, Settings } from "./types";
import { Asset, getAsset, listAssets, putAssetWithId, fmtSize } from "./assets";

export const BACKUP_EXT = ".webnotes";
type FileEntry = { id: string; name: string; type: string; size: number; createdAt: number; sha256: string };
export type Manifest = {
  format: "webnotes-backup"; version: 1; createdAt: number; app: string;
  counts: { notes: number; files: number; templates: number; bytes: number };
  notesSha256: string; templatesSha256: string; files: FileEntry[]; missing: string[];
};

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (data: ArrayBuffer | string) => hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? new TextEncoder().encode(data) : data));

/** every stored-file id a note points to */
export function assetRefs(n: Note): string[] {
  const s = JSON.stringify(n), out = new Set<string>();
  for (const m of s.matchAll(/asset:([A-Za-z0-9_-]+)/g)) out.add(m[1]);
  for (const m of s.matchAll(/data-asset(?:-file)?=\\?"([A-Za-z0-9_-]+)/g)) out.add(m[1]);
  return [...out];
}

export async function makeBackup(notes: Note[], settings: Settings) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const notesJson = JSON.stringify(notes);
  const templatesJson = localStorage.getItem("webnotes:templates") || "[]";
  const assets = await listAssets();
  const have = new Set(assets.map((a) => a.id));
  const missing = [...new Set(notes.flatMap(assetRefs))].filter((id) => !have.has(id));
  const files: FileEntry[] = [];
  let bytes = 0;
  for (const a of assets) {
    const buf = await a.blob.arrayBuffer();
    files.push({ id: a.id, name: a.name, type: a.type, size: a.size, createdAt: a.createdAt, sha256: await sha256(buf) });
    zip.file(`files/${a.id}`, buf, { binary: true }); bytes += buf.byteLength;
  }
  const manifest: Manifest = {
    format: "webnotes-backup", version: 1, createdAt: Date.now(), app: "WebNotes",
    counts: { notes: notes.length, files: files.length, templates: (JSON.parse(templatesJson) as unknown[]).length, bytes },
    notesSha256: await sha256(notesJson), templatesSha256: await sha256(templatesJson), files, missing,
  };
  zip.file("notes.json", notesJson); zip.file("templates.json", templatesJson); zip.file("settings.json", JSON.stringify(settings));
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  try { localStorage.setItem("webnotes:lastFullBackup", String(Date.now())); } catch { /* ignore */ }
  return { blob, manifest, name: `webnotes-backup-${new Date().toISOString().slice(0, 10)}${BACKUP_EXT}` };
}

export type Check = { ok: boolean; text: string };
export type Inspected = {
  kind: "full" | "notes-only"; createdAt: number | null; notes: Note[]; templates: unknown[]; settings: Partial<Settings> | null;
  files: { entry: FileEntry; data: ArrayBuffer | null; intact: boolean }[]; checks: Check[]; canRestore: boolean; summary: string;
};

/** open a backup and check it, without changing anything yet */
export async function inspectBackup(f: File): Promise<Inspected> {
  const checks: Check[] = [];
  const head = new Uint8Array(await f.slice(0, 2).arrayBuffer());
  if (!(head[0] === 0x50 && head[1] === 0x4b)) { // not a zip: older notes-only JSON export
    let notes: Note[] = [];
    try { const d = JSON.parse(await f.text()); if (Array.isArray(d)) notes = d; } catch { /* handled below */ }
    const ok = notes.length > 0 && notes.every((n) => n && typeof n.id === "string");
    checks.push({ ok, text: ok ? `${notes.length} notes read correctly` : "This isn't a WebNotes backup or the file is damaged" });
    const refs = new Set(notes.flatMap(assetRefs)), present = new Set((await listAssets()).map((a) => a.id));
    const absent = [...refs].filter((id) => !present.has(id));
    if (ok) checks.push({ ok: absent.length === 0, text: absent.length ? `Notes-only backup: ${absent.length} picture(s) or file(s) it refers to are not included and not in this browser` : "Notes-only backup (no files needed, or they are already here)" });
    return { kind: "notes-only", createdAt: null, notes, templates: [], settings: null, files: [], checks, canRestore: ok, summary: `${notes.length} notes (notes only, no files)` };
  }
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try { zip = await JSZip.loadAsync(f); } catch { return { kind: "full", createdAt: null, notes: [], templates: [], settings: null, files: [], checks: [{ ok: false, text: "The backup file is damaged and can't be opened" }], canRestore: false, summary: "" }; }
  const text = (p: string) => zip.file(p)?.async("string") ?? Promise.resolve(null);
  let man: Manifest | null = null;
  try { man = JSON.parse((await text("manifest.json")) ?? "null"); } catch { /* checked below */ }
  if (!man || man.format !== "webnotes-backup") return { kind: "full", createdAt: null, notes: [], templates: [], settings: null, files: [], checks: [{ ok: false, text: "This isn't a WebNotes backup (no manifest)" }], canRestore: false, summary: "" };
  const notesJson = (await text("notes.json")) ?? "";
  const notesOk = !!notesJson && (await sha256(notesJson)) === man.notesSha256;
  let notes: Note[] = []; try { notes = JSON.parse(notesJson); } catch { /* ignore */ }
  checks.push({ ok: notesOk && notes.length === man.counts.notes, text: notesOk ? `${notes.length} notes intact` : "The notes part of the backup is damaged" });
  const tJson = (await text("templates.json")) ?? "[]";
  const tOk = (await sha256(tJson)) === man.templatesSha256;
  let templates: unknown[] = []; try { templates = JSON.parse(tJson); } catch { /* ignore */ }
  checks.push({ ok: tOk, text: tOk ? `${templates.length} saved template(s) intact` : "Saved templates are damaged and will be skipped" });
  let settings: Partial<Settings> | null = null; try { settings = JSON.parse((await text("settings.json")) ?? "null"); } catch { /* ignore */ }
  const files: Inspected["files"] = [];
  for (const entry of man.files) {
    const data = (await zip.file(`files/${entry.id}`)?.async("arraybuffer")) ?? null;
    files.push({ entry, data, intact: !!data && (await sha256(data)) === entry.sha256 });
  }
  const bad = files.filter((x) => !x.intact);
  checks.push({ ok: bad.length === 0, text: bad.length ? `${bad.length} of ${files.length} file(s) are damaged and will be skipped: ${bad.slice(0, 3).map((x) => x.entry.name).join(", ")}${bad.length > 3 ? "…" : ""}` : `${files.length} file(s) intact (${fmtSize(man.counts.bytes)})` });
  if (man.missing?.length) checks.push({ ok: false, text: `${man.missing.length} picture(s) or file(s) were already missing when this backup was made` });
  return { kind: "full", createdAt: man.createdAt, notes, templates: tOk ? templates : [], settings, files, checks, canRestore: notesOk, summary: `${notes.length} notes, ${files.length} files, ${templates.length} templates` };
}

/** put a checked backup into this browser, then read everything back to confirm it */
export async function restoreBackup(b: Inspected, importNotes: (n: Note[]) => void, opts: { settings?: (s: Partial<Settings>) => void } = {}) {
  let written = 0, skipped = 0;
  for (const x of b.files) {
    if (!x.intact || !x.data) { skipped++; continue; }
    const e = x.entry;
    await putAssetWithId({ id: e.id, blob: new Blob([x.data], { type: e.type }), name: e.name, type: e.type, size: e.size, createdAt: e.createdAt } as Asset);
    written++;
  }
  importNotes(b.notes);
  if (b.templates.length) {
    try {
      const cur = JSON.parse(localStorage.getItem("webnotes:templates") || "[]") as { id: string }[];
      const ids = new Set(cur.map((t) => t.id));
      const merged = [...cur, ...(b.templates as { id: string }[]).filter((t) => t && !ids.has(t.id))];
      localStorage.setItem("webnotes:templates", JSON.stringify(merged));
      window.dispatchEvent(new Event("webnotes:templates"));
    } catch { /* ignore */ }
  }
  if (b.settings && opts.settings) opts.settings(b.settings);
  // verify: every restored file can be read back with the right fingerprint
  let verified = 0;
  for (const x of b.files) {
    if (!x.intact) continue;
    const a = await getAsset(x.entry.id);
    if (a && (await sha256(await a.blob.arrayBuffer())) === x.entry.sha256) verified++;
  }
  return { notes: b.notes.length, files: written, skipped, verified, allVerified: verified === written };
}
