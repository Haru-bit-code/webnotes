"use client";
import { Note, Settings } from "@/lib/types";

export function SettingsPanel({ settings, onChange, notes, onImport, onClose }: {
  settings: Settings; onChange: (s: Settings) => void; notes: Note[];
  onImport: (n: Note[]) => void; onClose: () => void;
}) {
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" }));
    a.download = `webnotes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
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
