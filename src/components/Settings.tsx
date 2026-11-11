"use client";
import { useState } from "react";
import { Note, Settings } from "@/lib/types";
import { useBackup } from "@/lib/backup";
import { Icon } from "./Icon";
import { FORMATS } from "@/lib/formats";
import { saveFile } from "@/lib/save";

type Tab = "appearance" | "backup";
const ACCENTS = ["#6366f1", "#2b59c3", "#0f7b6c", "#7a4fd6", "#c2410c", "#be185d", "#4d7c0f"];

export function SettingsPanel({ settings, onChange, notes, onImport, backup, onClose }: {
  settings: Settings; onChange: (s: Settings) => void; notes: Note[];
  onImport: (n: Note[]) => void; backup: ReturnType<typeof useBackup>; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("appearance");
  const exportJson = () => {
    saveFile(new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" }), `webnotes-${new Date().toISOString().slice(0, 10)}.json`);
    try { localStorage.setItem("webnotes:lastExport", String(Date.now())); } catch { /* ignore */ }
  };
  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (Array.isArray(data)) onImport(data);
      else alert("Invalid file");
    } catch { alert("Invalid file"); }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="pane-title">Settings</h2>
          <button className="btn icon-btn ghost" aria-label="Close settings" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="tabs" role="tablist">
          {([["appearance", "Appearance"], ["backup", "Backup"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "appearance" && <>
            <Row label="Theme"><Seg value={settings.theme} options={[["system", "Auto"], ["light", "Light"], ["dark", "Dark"]]} onChange={(v) => onChange({ ...settings, theme: v as Settings["theme"] })} /></Row>
            <Row label="Accent">
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((c) => <button key={c} aria-label={`Accent ${c}`} className={`swatch ${settings.accent.toLowerCase() === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ ...settings, accent: c })} />)}
                <label className="swatch swatch-custom" title="Custom colour"><input type="color" value={settings.accent} onChange={(e) => onChange({ ...settings, accent: e.target.value })} /></label>
              </div>
            </Row>
            <Row label="Glass effects"><Seg value={settings.glass === false ? "off" : "on"} options={[["on", "On"], ["off", "Solid"]]} onChange={(v) => onChange({ ...settings, glass: v === "on" })} /></Row>
            <Row label="New notes are"><select className="field w-auto" aria-label="Type for new notes" value={settings.newFormat ?? "markdown"} onChange={(e) => onChange({ ...settings, newFormat: e.target.value as Settings["newFormat"] })}>
              {FORMATS.filter((f) => f.id !== "scribble").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Row>
            <Row label="Note font"><Seg value={settings.font} options={[["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"], ["hand", "Hand"]]} onChange={(v) => onChange({ ...settings, font: v as Settings["font"] })} /></Row>
            <Row label={`Text size · ${settings.fontSize}px`}>
              <input type="range" className="range" min={13} max={22} value={settings.fontSize} onChange={(e) => onChange({ ...settings, fontSize: +e.target.value })} />
            </Row>
          </>}

          {tab === "backup" && <>
            <section className="space-y-2 text-sm">
              <h3 className="section-title">Auto-save to a file</h3>
              {backup.supported ? (<>
                <p className="muted text-xs leading-relaxed">Pick a backup file and the app saves to it a few seconds after every change. Put it in iCloud Drive, Dropbox or Google Drive to sync between devices: on the other device pick the same file and press Sync now. The most recently edited copy of a note wins.</p>
                {backup.state.status === "off" ? <button className="btn btn-primary" onClick={backup.choose}>Choose backup file…</button> : (
                  <div className="space-y-2">
                    <div className="status-line"><span className={`dot ${backup.state.status === "ok" ? "ok" : "warn"}`} /><b>{backup.state.name}</b>
                      <span className="muted">{backup.state.status === "ok" ? (backup.state.at ? `saved ${new Date(backup.state.at).toLocaleTimeString()}` : "connected") : backup.state.status === "needs-permission" ? "needs permission" : "error"}</span></div>
                    {backup.state.msg && <div className="text-xs text-amber-600">{backup.state.msg}</div>}
                    <div className="flex flex-wrap gap-2">
                      {backup.state.status === "needs-permission" && <button className="btn btn-primary" onClick={backup.reconnect}>Reconnect</button>}
                      <button className="btn" onClick={backup.syncNow}>Sync now</button>
                      <button className="btn" onClick={backup.choose}>Change file…</button>
                      <button className="btn" onClick={backup.stop}>Stop</button>
                    </div>
                  </div>)}
              </>) : <p className="muted text-xs">This browser can&apos;t save to a file automatically (Chrome, Edge, Brave and Arc can). Export JSON regularly{(() => { try { const t = +(localStorage.getItem("webnotes:lastExport") || 0); return t ? ` – last export ${new Date(t).toLocaleDateString()}` : " – you haven't exported yet"; } catch { return ""; } })()}.</p>}
            </section>
            <section className="mt-5 space-y-2 text-sm">
              <h3 className="section-title">Export and import</h3>
              <p className="muted text-xs leading-relaxed">Imported files (images, PDF pages, attachments) are kept in this browser and are not inside the JSON backup. Download important ones from the note, or export pages as PDF.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={exportJson}><Icon name="download" /> Export JSON</button>
                <label className="btn cursor-pointer">Import JSON
                  <input type="file" accept="application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} /></label>
              </div>
            </section>
          </>}

        </div>

        <div className="modal-foot"><button className="btn btn-primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="setting-row"><span>{label}</span>{children}</div>;
}
function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return <div className="seg" role="radiogroup">{options.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
