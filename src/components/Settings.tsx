"use client";
import { Note, Settings } from "@/lib/types";
import { useBackup } from "@/lib/backup";

export function SettingsPanel({ settings, onChange, notes, onImport, backup, onClose }: {
  settings: Settings; onChange: (s: Settings) => void; notes: Note[];
  onImport: (n: Note[]) => void; backup: ReturnType<typeof useBackup>; onClose: () => void;
}) {
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" }));
    a.download = `webnotes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
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
  const row = "flex items-center justify-between gap-3 py-2";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-panel bd w-full max-w-md rounded-xl border p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-semibold">Settings</h2>
        <div className={row}><span>Theme</span>
          <select className="bd rounded border px-2 py-1" value={settings.theme}
            onChange={(e) => onChange({ ...settings, theme: e.target.value as Settings["theme"] })}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select></div>
        <div className={row}><span>Accent colour</span>
          <input type="color" value={settings.accent} onChange={(e) => onChange({ ...settings, accent: e.target.value })} /></div>
        <div className={row}><span>Font</span>
          <select className="bd rounded border px-2 py-1" value={settings.font}
            onChange={(e) => onChange({ ...settings, font: e.target.value as Settings["font"] })}>
            <option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option>
          </select></div>
        <div className={row}><span>Font size ({settings.fontSize}px)</span>
          <input type="range" min={13} max={22} value={settings.fontSize}
            onChange={(e) => onChange({ ...settings, fontSize: +e.target.value })} /></div>
        <div className="bd mt-2 space-y-2 border-t pt-3 text-sm">
          <div className="font-medium">Backup &amp; sync</div>
          {backup.supported ? (<>
            <p className="muted text-xs">Pick a backup file and the app saves to it automatically a few seconds after every change. Choose a file inside iCloud Drive, Dropbox or Google Drive and it also syncs between your devices: on the other device pick the same file and press &ldquo;Sync now&rdquo;. Notes edited last win.</p>
            {backup.state.status === "off" ? <button className="btn accent-bg" onClick={backup.choose}>Choose backup file…</button> : (
              <div className="space-y-1">
                <div>📄 <b>{backup.state.name}</b> · {backup.state.status === "ok" ? (backup.state.at ? `saved ${new Date(backup.state.at).toLocaleTimeString()}` : "connected") : backup.state.status === "needs-permission" ? "needs permission" : "error"}</div>
                {backup.state.msg && <div className="text-xs text-amber-500">{backup.state.msg}</div>}
                <div className="flex flex-wrap gap-2">
                  {backup.state.status === "needs-permission" && <button className="btn accent-bg" onClick={backup.reconnect}>Reconnect</button>}
                  <button className="btn" onClick={backup.syncNow}>Sync now</button>
                  <button className="btn" onClick={backup.choose}>Change file…</button>
                  <button className="btn" onClick={backup.stop}>Stop</button>
                </div>
              </div>)}
          </>) : <p className="muted text-xs">This browser can&apos;t save to a file automatically (use Chrome, Edge, Brave or Arc for that). Use Export JSON below regularly{(() => { try { const t = +(localStorage.getItem("webnotes:lastExport") || 0); return t ? ` – last export ${new Date(t).toLocaleDateString()}` : " – you haven't exported yet"; } catch { return ""; } })()}.</p>}
        </div>
        <div className={`${row} bd mt-2 border-t pt-4`}>
          <button className="btn" onClick={exportJson}>Export JSON</button>
          <label className="btn cursor-pointer">Import JSON
            <input type="file" accept="application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} /></label>
          <button className="btn accent-bg" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
