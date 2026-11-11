"use client";
// Send notes straight from one device to another, with no account and no server keeping anything.
//
//  1. The sender makes a one-time code (K7QF-2XMD-9PRA) and shows it as text and as a QR code.
//  2. From that code both devices work out the same two things:
//       - a meeting address (a hash of the code) used to find each other through a small public
//         "introduction" service (PeerJS), and
//       - an AES-256 key (PBKDF2 of the code), which never leaves either device.
//  3. They connect directly (WebRTC). The sender compresses and encrypts the notes and their files and sends
//     them in pieces. The introduction service only ever sees the meeting address, never the notes.
//  4. The receiver decrypts, shows what arrived, and adds it only when the person says so.
//
// Offline fallback: the same notes (text only) can be shown as a looping series of QR codes that the other
// device's camera reads one by one ("animated QR").
//
// What is sent: notes, the pictures/files they use, folder names. NEVER AI keys or any settings.
import type { Note } from "./types";
import { assetRefs } from "./fullBackup";
import { getAsset, putAssetWithId, type Asset } from "./assets";

/* ---------------- what gets sent ---------------- */
export type BundleFile = { id: string; name: string; type: string; size: number; createdAt: number; sha256: string; offset: number };
export type BundleHead = { format: "webnotes-transfer"; v: 1; createdAt: number; from: string; notes: Note[]; folders: string[]; files: BundleFile[] };
export type Bundle = { head: BundleHead; data: Uint8Array }; // data = all file bytes, one after another

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (d: BufferSource | string) => hex(await crypto.subtle.digest("SHA-256", typeof d === "string" ? new TextEncoder().encode(d) : d));

export function deviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Android/i.test(ua) ? "Android device" : /iPhone|iPad/i.test(ua) ? "iPhone or iPad" : /Mac/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows PC" : /Linux/i.test(ua) ? "Linux computer" : "another device";
}

/** collect the chosen notes (and, if asked, the files they use) — nothing else from this device */
export async function buildBundle(notes: Note[], withFiles: boolean): Promise<Bundle> {
  // a clean copy of each note: only note fields, so nothing else from this browser can ride along
  const clean = notes.map((n) => JSON.parse(JSON.stringify(n)) as Note);
  const folders = [...new Set(clean.map((n) => n.folder).filter(Boolean))];
  const files: BundleFile[] = []; const parts: Uint8Array[] = []; let offset = 0;
  if (withFiles) {
    for (const id of [...new Set(clean.flatMap(assetRefs))]) {
      const a = await getAsset(id).catch(() => undefined); if (!a) continue;
      const buf = new Uint8Array(await a.blob.arrayBuffer());
      files.push({ id: a.id, name: a.name, type: a.type, size: buf.byteLength, createdAt: a.createdAt, sha256: await sha256(buf), offset });
      parts.push(buf); offset += buf.byteLength;
    }
  }
  const data = new Uint8Array(offset); let o = 0; for (const p of parts) { data.set(p, o); o += p.byteLength; }
  return { head: { format: "webnotes-transfer", v: 1, createdAt: Date.now(), from: deviceName(), notes: clean, folders, files }, data };
}

/* bundle <-> bytes: [4-byte header length][header JSON][file bytes], then gzip */
async function gzip(b: Uint8Array, mode: "compress" | "decompress") {
  const t = mode === "compress" ? new CompressionStream("gzip") : new DecompressionStream("gzip");
  const w = t.writable.getWriter(); w.write(b as BufferSource).catch(() => {}); w.close().catch(() => {});
  const parts: Uint8Array[] = []; const r = t.readable.getReader(); let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.byteLength; }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}
export async function packBundle(b: Bundle) {
  const head = new TextEncoder().encode(JSON.stringify(b.head));
  const out = new Uint8Array(4 + head.byteLength + b.data.byteLength);
  new DataView(out.buffer).setUint32(0, head.byteLength); out.set(head, 4); out.set(b.data, 4 + head.byteLength);
  return gzip(out, "compress");
}
export async function unpackBundle(bytes: Uint8Array): Promise<Bundle> {
  const raw = await gzip(bytes, "decompress");
  const n = new DataView(raw.buffer, raw.byteOffset).getUint32(0);
  const head = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + n))) as BundleHead;
  if (head.format !== "webnotes-transfer" || !Array.isArray(head.notes)) throw new Error("That isn't a WebNotes transfer.");
  return { head, data: raw.subarray(4 + n) };
}

/** add what arrived to this device: files (checked against their fingerprints), then notes and folder names */
export async function applyBundle(b: Bundle, importNotes: (n: Note[]) => void, addFolders: (names: string[]) => void) {
  let files = 0, bad = 0;
  for (const f of b.head.files) {
    const bytes = b.data.slice(f.offset, f.offset + f.size);
    if ((await sha256(bytes)) !== f.sha256) { bad++; continue; }
    await putAssetWithId({ id: f.id, blob: new Blob([bytes], { type: f.type }), name: f.name, type: f.type, size: f.size, createdAt: f.createdAt } as Asset);
    files++;
  }
  importNotes(b.head.notes.filter((n) => n && typeof n.id === "string"));
  if (b.head.folders.length) addFolders(b.head.folders);
  return { notes: b.head.notes.length, files, bad };
}

/* ---------------- the one-time code ---------------- */
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  return [...r].map((x) => ALPHA[x % ALPHA.length]).join("");
}
export const showCode = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-");
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").split("").filter((ch) => ALPHA.includes(ch)).join("");
export const SITE = "https://notes-flax-ten-86.vercel.app";
/** link inside the QR code: opening it (even with a normal camera app) starts receiving on the website */
export const receiveLink = (code: string, origin: string) => `${origin.startsWith("http") && !/localhost|capacitor/.test(origin) ? origin : SITE}/#receive=${code}`;
export const codeFromText = (t: string) => {
  const m = /[#&?]receive=([0-9A-Za-z-]{12,16})/.exec(t);
  const c = cleanCode(m ? m[1] : t);
  return c.length === 12 ? c : null;
};

async function keyFor(code: string) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("webnotes-transfer-v1"), iterations: 150_000 },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export const meetingId = async (code: string) => "webnotes-" + (await sha256("meet:" + code)).slice(0, 24);
export async function encrypt(code: string, plain: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, await keyFor(code), plain as BufferSource));
  const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(ct, 12); return out;
}
export async function decrypt(code: string, data: Uint8Array) {
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) as BufferSource }, await keyFor(code), data.subarray(12) as BufferSource)); }
  catch { throw new Error("The data couldn't be unlocked. Check the code and try again."); }
}

/* ---------------- direct connection (WebRTC through PeerJS) ---------------- */
// The introduction service: the free public PeerJS server by default. To use your own (for example on your
// VM: `npx peer --port 9000`), set localStorage "webnotes:peerServer" to {"host":"…","port":443,"path":"/","secure":true}.
type PeerServer = { host: string; port: number; path: string; secure: boolean; key?: string };
export function peerOptions() {
  let s: Partial<PeerServer> = {};
  try { s = JSON.parse(localStorage.getItem("webnotes:peerServer") || "{}"); } catch { /* default */ }
  return {
    host: s.host ?? "0.peerjs.com", port: s.port ?? 443, path: s.path ?? "/", secure: s.secure ?? true, key: s.key ?? "peerjs", debug: 0,
    config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] },
  };
}

const CHUNK = 64 * 1024;
type Msg = { t: "hello"; size: number; chunks: number } | { t: "c"; i: number; d: ArrayBuffer | Uint8Array } | { t: "ok" };
export type Status = { phase: "starting" | "waiting" | "connected" | "sending" | "receiving" | "done" | "error"; done?: number; total?: number; text?: string };

/** sender: wait for the other device, then send. Returns a stop function. */
export async function startSending(code: string, payload: () => Promise<Uint8Array>, on: (s: Status) => void) {
  const { default: Peer } = await import("peerjs");
  const peer = new Peer(await meetingId(code), peerOptions());
  let busy = false, finished = false;
  const stop = () => { finished = true; try { peer.destroy(); } catch { /* ignore */ } };
  peer.on("open", () => on({ phase: "waiting" }));
  peer.on("error", (e: { type?: string; message?: string }) => { if (!finished) on({ phase: "error", text: e.type === "network" || e.type === "server-error" || e.type === "socket-error" ? "Can't reach the connection service. Check the internet, or use the animated QR instead." : e.type === "unavailable-id" ? "That code is already in use. Start again." : e.message || "Connection failed." }); });
  peer.on("connection", (conn) => {
    if (busy) { conn.on("open", () => conn.close()); return; } // one receiver per code
    busy = true;
    conn.on("open", async () => {
      try {
        on({ phase: "connected" });
        const data = await encrypt(code, await payload());
        const chunks = Math.ceil(data.byteLength / CHUNK);
        conn.send({ t: "hello", size: data.byteLength, chunks } satisfies Msg);
        for (let i = 0; i < chunks; i++) {
          const dc = conn.dataChannel as RTCDataChannel | undefined;
          while (dc && dc.bufferedAmount > 4 * 1024 * 1024) await new Promise((r) => setTimeout(r, 20)); // don't flood the channel
          conn.send({ t: "c", i, d: data.slice(i * CHUNK, (i + 1) * CHUNK).buffer } satisfies Msg);
          on({ phase: "sending", done: i + 1, total: chunks });
        }
      } catch (e) { on({ phase: "error", text: (e as Error).message }); }
    });
    conn.on("data", (m) => { if ((m as Msg).t === "ok") { on({ phase: "done" }); setTimeout(stop, 500); } });
    conn.on("close", () => { if (!finished) { busy = false; } });
  });
  return stop;
}

/** receiver: connect with the code, collect the pieces, unlock them */
export async function startReceiving(code: string, on: (s: Status) => void, got: (b: Bundle) => void) {
  const { default: Peer } = await import("peerjs");
  const peer = new Peer(peerOptions());
  let finished = false;
  const stop = () => { finished = true; try { peer.destroy(); } catch { /* ignore */ } };
  const fail = (text: string) => { if (!finished) { on({ phase: "error", text }); stop(); } };
  peer.on("error", (e: { type?: string; message?: string }) => fail(e.type === "peer-unavailable" ? "No device is sending with that code. Check the code, or ask for a new one." : e.type === "network" || e.type === "server-error" || e.type === "socket-error" ? "Can't reach the connection service. Check the internet, or use the animated QR instead." : e.message || "Connection failed."));
  peer.on("open", async () => {
    on({ phase: "starting", text: "Connecting…" });
    const conn = peer.connect(await meetingId(code), { reliable: true, serialization: "binary" });
    const timer = setTimeout(() => fail("The other device didn't answer. Make sure it is still showing the code."), 25000);
    let buf: Uint8Array | null = null, have = 0, chunks = 0;
    conn.on("open", () => { clearTimeout(timer); on({ phase: "connected" }); });
    conn.on("data", async (raw) => {
      const m = raw as Msg;
      if (m.t === "hello") { buf = new Uint8Array(m.size); chunks = m.chunks; have = 0; return; }
      if (m.t === "c" && buf) {
        const d = new Uint8Array(m.d instanceof ArrayBuffer ? m.d : (m.d as Uint8Array).buffer.slice((m.d as Uint8Array).byteOffset, (m.d as Uint8Array).byteOffset + (m.d as Uint8Array).byteLength));
        buf.set(d, m.i * CHUNK); have++;
        on({ phase: "receiving", done: have, total: chunks });
        if (have === chunks) {
          try { const b = await unpackBundle(await decrypt(code, buf)); conn.send({ t: "ok" } satisfies Msg); got(b); on({ phase: "done" }); setTimeout(stop, 800); }
          catch (e) { fail((e as Error).message); }
        }
      }
    });
    conn.on("error", (e) => fail(e.message || "Connection failed."));
  });
  return stop;
}

/* ---------------- animated QR (offline) ---------------- */
// Each QR frame carries "WN1|<session>|<part>|<parts>|<base64 piece>". The sender loops through the parts;
// the receiver keeps whatever it reads until it has them all, so a missed frame just comes round again.
export const FRAME_CHARS = 600;
export function toFrames(bytes: Uint8Array) {
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin), sid = Math.random().toString(36).slice(2, 6), n = Math.max(1, Math.ceil(b64.length / FRAME_CHARS));
  return Array.from({ length: n }, (_, i) => `WN1|${sid}|${i}|${n}|${b64.slice(i * FRAME_CHARS, (i + 1) * FRAME_CHARS)}`);
}
export class FrameCollector {
  sid = ""; n = 0; parts = new Map<number, string>();
  /** add one scanned frame; returns true when it was new */
  add(text: string) {
    const m = /^WN1\|([a-z0-9]{1,8})\|(\d+)\|(\d+)\|([A-Za-z0-9+/=]*)$/.exec(text); if (!m) return false;
    const [, sid, i, n] = m;
    if (sid !== this.sid) { this.sid = sid; this.n = +n; this.parts.clear(); }
    if (this.parts.has(+i)) return false;
    this.parts.set(+i, m[4]); return true;
  }
  get complete() { return this.n > 0 && this.parts.size === this.n; }
  bytes() {
    const b64 = Array.from({ length: this.n }, (_, i) => this.parts.get(i) ?? "").join("");
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}
