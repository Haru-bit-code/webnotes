"use client";
import { useState } from "react";
import { Note, Settings } from "@/lib/types";
import { useBackup } from "@/lib/backup";
import { Icon } from "./Icon";
import { FORMATS } from "@/lib/formats";
import { saveFile } from "@/lib/save";
import { BACKUP_EXT, Inspected, inspectBackup, makeBackup, restoreBackup } from "@/lib/fullBackup";
import { fmtSize } from "@/lib/assets";
import { DEFAULT_THEME, THEMES } from "@/lib/themes";

type Tab = "appearance" | "backup";
const ACCENTS = ["#6366f1", "#2b59c3", "#0f7b6c", "#7a4fd6", "#c2410c", "#be185d", "#4d7c0f"];

export function SettingsPanel({ settings, onChange, notes, onImport, backup, onClose }: {
  settings: Settings; onChange: (s: Settings) => void; notes: Note[];
  onImport: (n: Note[]) => void; backup: ReturnType<typeof useBackup>; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("appearance");
  // full backup / restore
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [checked, setChecked] = useState<Inspected | null>(null);
  const [withSettings, setWithSettings] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);
  const fullBackup = async () => {
    setBusy("Making the backup…"); setMade(null);
    try {
      const b = await makeBackup(notes, settings);
      await saveFile(b.blob, b.name);
      setMade(`Saved ${b.name}: ${b.manifest.counts.notes} notes, ${b.manifest.counts.files} files (${fmtSize(b.blob.size)})${b.manifest.missing.length ? `. ${b.manifest.missing.length} file(s) your notes refer to were already missing from this browser.` : "."}`);
    } catch (e) { alert("The backup couldn't be made: " + (e as Error).message); }
    finally { setBusy(null); }
  };
  const pickRestore = async (f?: File) => {
    if (!f) return; setRestored(null); setChecked(null); setBusy("Checking the backup…");
    try { setChecked(await inspectBackup(f)); } catch (e) { alert("That file couldn't be read: " + (e as Error).message); }
    finally { setBusy(null); }
  };
  const doRestore = async () => {
    if (!checked) return; setBusy("Restoring…");
    try {
      const r = await restoreBackup(checked, onImport, { settings: withSettings ? (s2) => onChange({ ...settings, ...s2 }) : undefined });
      setRestored(`Restored ${r.notes} notes and ${r.files} file(s)${r.skipped ? `, skipped ${r.skipped} damaged file(s)` : ""}. ${r.allVerified ? "✓ Every file was read back and matches the backup." : `⚠ Only ${r.verified} of ${r.files} files could be read back. Try again or free up storage.`}`);
      setChecked(null);
    } catch (e) { alert("Restore stopped: " + (e as Error).message); }
    finally { setBusy(null); }
  };
  const lastFull = (() => { try { const t = +(localStorage.getItem("webnotes:lastFullBackup") || 0); return t ? new Date(t).toLocaleString() : null; } catch { return null; } })();
  const exportJson = () => {
    saveFile(new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" }), `webnotes-${new Date().toISOString().slice(0, 10)}.json`);
    try { localStorage.setItem("webnotes:lastExport", String(Date.now())); } catch { /* ignore */ }
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
            <div className="setting-row block">
              <div className="mb-2 flex items-center justify-between"><span>Colour theme</span>
                <button className="btn ghost text-xs" onClick={() => onChange({ ...settings, accent: DEFAULT_THEME.accent, glow: DEFAULT_THEME.glow, glass: true })}>Reset to default</button></div>
              <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
                {THEMES.map((t) => {
                  const on = settings.accent.toLowerCase() === t.accent && (settings.glow ?? DEFAULT_THEME.glow)[0] === t.glow[0];
                  return (
                    <button key={t.id} role="radio" aria-checked={on} className={`theme-opt ${on ? "on" : ""}`} onClick={() => onChange({ ...settings, accent: t.accent, glow: t.glow })}>
                      <span className="theme-swatch" style={{ background: `radial-gradient(70% 90% at 20% 20%, ${t.accent}, transparent 70%), radial-gradient(60% 80% at 85% 30%, ${t.glow[0]}, transparent 70%), radial-gradient(70% 80% at 60% 100%, ${t.glow[1]}, transparent 70%), #1b1d2a` }} />
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <Row label="Accent">
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((c) => <button key={c} aria-label={`Accent ${c}`} className={`swatch ${settings.accent.toLowerCase() === c ? "on" : ""}`} style={{ background: c }} onClick={() => onChange({ ...settings, accent: c })} />)}
                <label className="swatch swatch-custom" title="Custom colour"><input type="color" value={settings.accent} onChange={(e) => onChange({ ...settings, accent: e.target.value })} /></label>
              </div>
            </Row>
            <Row label="Glass effects"><Seg value={settings.glass === false ? "off" : "on"} options={[["on", "On"], ["off", "Solid"]]} onChange={(v) => onChange({ ...settings, glass: v === "on" })} /></Row>
            <Row label="Pictures from the web"><Seg value={settings.remoteImages ? "always" : "ask"} options={[["ask", "Ask first"], ["always", "Always load"]]} onChange={(v) => onChange({ ...settings, remoteImages: v === "always" })} /></Row>
            <Row label="New notes are"><select className="field w-auto" aria-label="Type for new notes" value={settings.newFormat ?? "markdown"} onChange={(e) => onChange({ ...settings, newFormat: e.target.value as Settings["newFormat"] })}>
              {FORMATS.filter((f) => f.id !== "scribble").map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Row>
            <Row label="Note font"><Seg value={settings.font} options={[["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"], ["hand", "Hand"]]} onChange={(v) => onChange({ ...settings, font: v as Settings["font"] })} /></Row>
            <Row label={`Text size · ${settings.fontSize}px`}>
              <input type="range" className="range" min={13} max={22} value={settings.fontSize} onChange={(e) => onChange({ ...settings, fontSize: +e.target.value })} />
            </Row>
          </>}

          {tab === "backup" && <>
            <section className="space-y-2 text-sm">
              <h3 className="section-title">Full backup</h3>
              <p className="muted text-xs leading-relaxed">One <b>{BACKUP_EXT}</b> file with everything: all notes (including archived and trashed), pictures, PDF pages, attached files, your templates and appearance settings. AI keys are not included. Keep it somewhere safe, such as Google Drive.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button className="btn btn-primary" disabled={!!busy} onClick={fullBackup}><Icon name="download" /> Download full backup</button>
                <span className="muted text-xs">{lastFull ? `Last full backup: ${lastFull}` : "No full backup made yet"}</span>
              </div>
              {made && <div className="status-line"><span className="dot ok" />{made}</div>}
            </section>
            <section className="mt-5 space-y-2 text-sm">
              <h3 className="section-title">Restore</h3>
              <p className="muted text-xs leading-relaxed">Pick a backup. It is checked first and nothing changes until you press Restore. Notes you already have are kept; where both have the same note, the more recently edited copy wins.</p>
              <label className={`btn cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}><Icon name="upload" /> Choose backup…
                <input type="file" accept={`${BACKUP_EXT},.zip,.json,application/json,application/zip`} hidden onChange={(e) => { pickRestore(e.target.files?.[0]); e.target.value = ""; }} /></label>
              {busy && <div className="status-line"><span className="dot warn" />{busy}</div>}
              {checked && (
                <div className="restore-check" role="region" aria-label="Backup check">
                  <b>{checked.kind === "full" ? "Full backup" : "Notes-only backup"}{checked.createdAt ? ` from ${new Date(checked.createdAt).toLocaleString()}` : ""}</b>
                  <ul>{checked.checks.map((c, i) => <li key={i} className={c.ok ? "ok" : "warn"}>{c.ok ? "✓" : "⚠"} {c.text}</li>)}</ul>
                  {checked.settings && <label className="ink-check"><input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} /> Also restore appearance settings</label>}
                  <div className="flex gap-2">
                    <button className="btn btn-primary" disabled={!checked.canRestore || !!busy} onClick={doRestore}>Restore {checked.summary}</button>
                    <button className="btn" onClick={() => setChecked(null)}>Cancel</button>
                  </div>
                </div>
              )}
              {restored && <div className="status-line"><span className={`dot ${restored.includes("⚠") ? "warn" : "ok"}`} />{restored}</div>}
            </section>
            <section className="mt-5 space-y-2 text-sm">
              <h3 className="section-title">Auto-save notes to a file</h3>
              {backup.supported ? (<>
                <p className="muted text-xs leading-relaxed"><b>Notes only, no pictures or files</b>: make a full backup now and then too. Pick a file and the app saves to it a few seconds after every change. Put it in iCloud Drive, Dropbox or Google Drive to sync between devices: on the other device pick the same file and press Sync now. The most recently edited copy of a note wins.</p>
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
              <h3 className="section-title">Notes only (JSON)</h3>
              <p className="muted text-xs leading-relaxed">Plain JSON of your notes, for use in other tools. It does <b>not</b> include pictures, PDF pages or attached files; use Full backup for that. To bring a JSON file back in, use Restore above.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={exportJson}><Icon name="download" /> Export notes as JSON</button>
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
