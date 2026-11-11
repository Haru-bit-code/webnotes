"use client";
// "Send & receive": move notes between your own devices, or to a friend, with a QR code or a short code.
// Nothing is stored on any server, and AI keys / settings never leave the device.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { Icon } from "./Icon";
import { fmtSize } from "@/lib/assets";
import {
  Bundle, FrameCollector, Status, applyBundle, buildBundle, cleanCode, codeFromText, newCode, packBundle, receiveLink,
  showCode, startReceiving, startSending, toFrames, unpackBundle,
} from "@/lib/transfer";

type Props = {
  notes: Note[]; folders: string[]; start?: { mode: "send" | "receive"; noteIds?: string[]; code?: string };
  onImport: (n: Note[]) => void; onFolders: (names: string[]) => void; onClose: () => void;
};

export function TransferDialog({ notes, folders, start, onImport, onFolders, onClose }: Props) {
  const [tab, setTab] = useState<"send" | "receive">(start?.mode ?? "send");
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal transfer" role="dialog" aria-modal="true" aria-label="Send and receive notes" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 className="pane-title">Send &amp; receive</h2><button className="btn icon-btn ghost" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "send"} className={tab === "send" ? "on" : ""} onClick={() => setTab("send")}>Send from this device</button>
          <button role="tab" aria-selected={tab === "receive"} className={tab === "receive" ? "on" : ""} onClick={() => setTab("receive")}>Receive here</button>
        </div>
        <div className="modal-body">
          {tab === "send" ? <Send notes={notes} folders={folders} noteIds={start?.noteIds} /> : <Receive initialCode={start?.code} onImport={onImport} onFolders={onFolders} />}
          <p className="transfer-note"><Icon name="lock" /> Encrypted from device to device. Nothing is stored on a server, and your AI keys and settings are never sent.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- send ---------------- */
function Send({ notes, folders, noteIds }: { notes: Note[]; folders: string[]; noteIds?: string[] }) {
  const [what, setWhat] = useState<"these" | "folder" | "all">(noteIds?.length ? "these" : "all");
  const [folder, setFolder] = useState(folders[0] ?? "");
  const [withFiles, setWithFiles] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [optical, setOptical] = useState<string[] | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const live = notes.filter((n) => !n.deletedAt);
  const chosen = useMemo(() => what === "these" ? live.filter((n) => noteIds?.includes(n.id)) : what === "folder" ? live.filter((n) => n.folder === folder) : live.filter((n) => !n.archived), [what, folder, live, noteIds]);
  useEffect(() => () => stopRef.current?.(), []);

  const begin = async () => {
    const c = newCode(); setCode(c); setStatus({ phase: "starting" }); setOptical(null);
    stopRef.current?.();
    stopRef.current = await startSending(c, async () => packBundle(await buildBundle(chosen, withFiles)), setStatus);
  };
  const cancel = () => { stopRef.current?.(); stopRef.current = null; setCode(null); setStatus(null); setOptical(null); };
  const animated = async () => {
    stopRef.current?.(); stopRef.current = null; setCode(null); setStatus(null);
    setOptical(toFrames(await packBundle(await buildBundle(chosen, false))));
  };

  if (optical) return <OpticalSender frames={optical} count={chosen.length} onBack={() => setOptical(null)} />;
  if (code) {
    const pct = status?.total ? Math.round(((status.done ?? 0) / status.total) * 100) : 0;
    return (
      <div className="send-live">
        <QrCanvas text={receiveLink(code, typeof location === "undefined" ? "" : location.origin)} size={232} label="QR code to scan with the other device" />
        <div className="send-side">
          <p className="muted text-xs">On the other device open WebNotes → <b>Send &amp; receive</b> → <b>Receive here</b>, then scan this code or type:</p>
          <div className="big-code" aria-label={`Code ${showCode(code).split("").join(" ")}`}>{showCode(code)}</div>
          <button className="btn ghost text-xs" onClick={() => navigator.clipboard?.writeText(showCode(code))}><Icon name="copy" /> Copy code</button>
          <div className={`status-line ${status?.phase === "error" ? "bad" : ""}`} role="status">
            <span className={`dot ${status?.phase === "done" ? "ok" : status?.phase === "error" ? "" : "warn"}`} />
            {status?.phase === "starting" ? "Getting ready…" : status?.phase === "waiting" ? "Waiting for the other device…" : status?.phase === "connected" ? "Connected. Preparing the notes…"
              : status?.phase === "sending" ? `Sending… ${pct}%` : status?.phase === "done" ? `Sent ${chosen.length} note${chosen.length === 1 ? "" : "s"} ✓` : status?.text}
          </div>
          {status?.phase === "sending" && <progress max={100} value={pct} aria-label="Sending progress" />}
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={cancel}>{status?.phase === "done" ? "Done" : "Cancel"}</button>
            {status?.phase !== "done" && <button className="btn ghost text-xs" onClick={animated}>No internet? Use animated QR</button>}
          </div>
        </div>
      </div>
    );
  }
  const files = withFiles ? new Set(chosen.flatMap((n) => JSON.stringify(n).match(/asset:[A-Za-z0-9_-]+|data-asset="[^"]+"/g) ?? [])).size : 0;
  return (
    <div className="space-y-3 text-sm">
      <fieldset className="space-y-1.5">
        <legend className="section-title mb-1">What to send</legend>
        {!!noteIds?.length && <label className="ink-check"><input type="radio" name="what" checked={what === "these"} onChange={() => setWhat("these")} /> This note</label>}
        {folders.length > 0 && <label className="ink-check"><input type="radio" name="what" checked={what === "folder"} onChange={() => setWhat("folder")} /> A folder
          <select className="field ml-1 w-auto" aria-label="Folder to send" value={folder} onChange={(e) => { setFolder(e.target.value); setWhat("folder"); }}>{folders.map((f) => <option key={f}>{f}</option>)}</select></label>}
        <label className="ink-check"><input type="radio" name="what" checked={what === "all"} onChange={() => setWhat("all")} /> All notes (not archived)</label>
      </fieldset>
      <label className="ink-check"><input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} /> Include pictures and attached files</label>
      <p className="muted text-xs">{chosen.length} note{chosen.length === 1 ? "" : "s"}{withFiles && files ? `, ${files} file${files === 1 ? "" : "s"}` : ""} will be sent.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!chosen.length} onClick={begin}><Icon name="qr" /> Show QR code</button>
        <button className="btn" disabled={!chosen.length} onClick={animated} title="For when one device has no internet: the other phone's camera reads a looping series of QR codes">Animated QR (offline)</button>
      </div>
    </div>
  );
}

function OpticalSender({ frames, count, onBack }: { frames: string[]; count: number; onBack: () => void }) {
  const [i, setI] = useState(0);
  const [fps, setFps] = useState(5);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % frames.length), 1000 / fps); return () => clearInterval(t); }, [frames.length, fps]);
  const secs = Math.ceil(frames.length / fps);
  return (
    <div className="send-live">
      <QrCanvas text={frames[i]} size={300} label={`Animated QR, part ${i + 1} of ${frames.length}`} level="L" />
      <div className="send-side">
        <p className="muted text-xs">On the other device: <b>Receive here</b> → <b>Scan QR code</b>, and hold its camera to this screen until it says it&apos;s complete (about {secs} s per round; missed parts come round again).</p>
        <p className="text-sm">{count} note{count === 1 ? "" : "s"} · {frames.length} parts · part <b>{i + 1}</b></p>
        <p className="muted text-xs">Text only: pictures and files need the QR code with internet.</p>
        <label className="ink-check text-xs">Speed <input type="range" min={2} max={10} value={fps} onChange={(e) => setFps(+e.target.value)} aria-label="Frames per second" /> {fps}/s</label>
        <button className="btn" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function QrCanvas({ text, size, label, level = "M" }: { text: string; size: number; label: string; level?: "L" | "M" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let on = true;
    import("qrcode").then((Q) => { if (on && ref.current) Q.toCanvas(ref.current, text, { errorCorrectionLevel: level, margin: 2, width: size, color: { dark: "#111827", light: "#ffffff" } }); });
    return () => { on = false; };
  }, [text, size, level]);
  return <canvas ref={ref} className="qr-canvas" width={size} height={size} role="img" aria-label={label} data-qr={text} />;
}

/* ---------------- receive ---------------- */
function Receive({ initialCode, onImport, onFolders }: { initialCode?: string; onImport: (n: Note[]) => void; onFolders: (names: string[]) => void }) {
  const [typed, setTyped] = useState(initialCode ? showCode(initialCode) : "");
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [got, setGot] = useState<Bundle | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [frames, setFrames] = useState<{ have: number; n: number } | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const collector = useRef(new FrameCollector());
  useEffect(() => () => stopRef.current?.(), []);

  const connect = async (c: string) => {
    setScanning(false); setGot(null); setAdded(null); setFrames(null); setStatus({ phase: "starting", text: "Connecting…" });
    stopRef.current?.();
    stopRef.current = await startReceiving(c, setStatus, setGot);
  };
  useEffect(() => { if (initialCode) connect(initialCode); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onScan = async (text: string) => {
    const c = codeFromText(text);
    if (c && /receive=/.test(text)) { setTyped(showCode(c)); connect(c); return true; }
    if (text.startsWith("WN1|")) {
      collector.current.add(text);
      const col = collector.current; setFrames({ have: col.parts.size, n: col.n });
      if (col.complete) {
        try { setGot(await unpackBundle(col.bytes())); setStatus({ phase: "done" }); return true; }
        catch { setStatus({ phase: "error", text: "Those QR codes couldn't be read. Try again." }); collector.current = new FrameCollector(); }
      }
    }
    return false;
  };
  const add = async () => {
    if (!got) return;
    const r = await applyBundle(got, onImport, onFolders);
    setAdded(`Added ${r.notes} note${r.notes === 1 ? "" : "s"}${r.files ? ` and ${r.files} file${r.files === 1 ? "" : "s"}` : ""}${r.bad ? ` (${r.bad} damaged file${r.bad === 1 ? "" : "s"} skipped)` : ""}. Notes you already had keep whichever copy was edited last.`);
    setGot(null);
  };

  if (added) return <div className="space-y-3 text-sm"><div className="status-line"><span className="dot ok" />{added}</div><button className="btn" onClick={() => { setAdded(null); setStatus(null); setTyped(""); }}>Receive more</button></div>;
  if (got) {
    const h = got.head, size = got.data.byteLength;
    return (
      <div className="space-y-3 text-sm">
        <b>From {h.from}: {h.notes.length} note{h.notes.length === 1 ? "" : "s"}{h.files.length ? `, ${h.files.length} file${h.files.length === 1 ? "" : "s"} (${fmtSize(size)})` : ""}{h.folders.length ? ` in ${h.folders.length} folder${h.folders.length === 1 ? "" : "s"}` : ""}</b>
        <ul className="received-list">{h.notes.slice(0, 8).map((n) => <li key={n.id}><Icon name={n.kind === "canvas" ? "scribble" : "notes"} />{n.title || "Untitled"}{n.folder ? <span className="muted"> · {n.folder}</span> : null}</li>)}
          {h.notes.length > 8 && <li className="muted">and {h.notes.length - 8} more</li>}</ul>
        <p className="muted text-xs">Nothing has been added yet. Only add notes from someone you trust.</p>
        <div className="flex gap-2"><button className="btn btn-primary" onClick={add}>Add to this device</button><button className="btn" onClick={() => { setGot(null); setStatus(null); }}>Don&apos;t add</button></div>
      </div>
    );
  }
  const pct = status?.total ? Math.round(((status.done ?? 0) / status.total) * 100) : 0;
  return (
    <div className="space-y-3 text-sm">
      {scanning ? <Scanner onText={onScan} onClose={() => setScanning(false)} frames={frames} />
        : <button className="btn btn-primary" onClick={() => { setScanning(true); setStatus(null); }}><Icon name="camera" /> Scan QR code</button>}
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const c = cleanCode(typed); if (c.length === 12) connect(c); else setStatus({ phase: "error", text: "The code has 12 letters and numbers, like K7QF-2XMD-9PRA." }); }}>
        <label className="muted text-xs" htmlFor="recv-code">Or type the code</label>
        <input id="recv-code" className="field code-input" placeholder="XXXX-XXXX-XXXX" value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
        <button className="btn">Connect</button>
      </form>
      {status && status.phase !== "done" && (
        <div className={`status-line ${status.phase === "error" ? "bad" : ""}`} role="status">
          <span className={`dot ${status.phase === "error" ? "" : "warn"}`} />
          {status.phase === "receiving" ? `Receiving… ${pct}%` : status.phase === "connected" ? "Connected. Waiting for the notes…" : status.text ?? "Connecting…"}
        </div>
      )}
      {status?.phase === "receiving" && <progress max={100} value={pct} aria-label="Receiving progress" />}
    </div>
  );
}

/** camera view that reads QR codes (the browser's own reader where there is one, else jsQR) */
function Scanner({ onText, onClose, frames }: { onText: (t: string) => Promise<boolean>; onClose: () => void; frames: { have: number; n: number } | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null, stopped = false, timer: ReturnType<typeof setTimeout> | null = null;
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;
    let jsQR: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;
    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2) {
        let text: string | null = null;
        try {
          if (detector) text = (await detector.detect(v))[0]?.rawValue ?? null;
          else if (ctx) {
            jsQR ??= (await import("jsqr")).default as never;
            const w = v.videoWidth, h = v.videoHeight, k = Math.min(1, 720 / Math.max(w, h));
            canvas.width = w * k; canvas.height = h * k; ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            text = jsQR!(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
          }
        } catch { /* keep trying */ }
        if (text && (await onText(text))) { onClose(); return; }
      }
      timer = setTimeout(tick, 90);
    };
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } tick(); })
      .catch((e: Error) => setErr(e.name === "NotAllowedError" ? "Camera access was blocked. Allow the camera for WebNotes in the browser or phone settings, or type the code instead." : e.name === "NotFoundError" ? "No camera found on this device. Type the code instead." : "The camera couldn't start: " + e.message));
    return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="scanner">
      {err ? <div className="status-line bad"><span className="dot" />{err}</div> : <>
        <video ref={video} playsInline muted aria-label="Camera view for scanning" />
        <div className="scan-frame" aria-hidden="true" />
        <p className="scan-hint">{frames ? `Reading animated QR… ${frames.have} of ${frames.n} parts` : "Point the camera at the QR code on the other device"}</p>
        {frames && <progress max={frames.n} value={frames.have} aria-label="Animated QR progress" />}
      </>}
      <button className="btn" onClick={onClose}>Stop scanning</button>
    </div>
  );
}
