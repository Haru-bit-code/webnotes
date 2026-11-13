"use client";
// "New scribble page" dialog: start from a page template (sorted into groups, searchable) or a blank paper.
import { useMemo, useState } from "react";
import { El, Paper } from "@/lib/types";
import { PAGE_TEMPLATES } from "@/lib/pages";
import { useCustomTemplates } from "@/lib/customTemplates";
import { placeStamp } from "@/lib/stamps";
import { PaperPicker } from "./Paper";
import { StampThumb } from "./Canvas";
import { Icon } from "./Icon";
import { KIT_PAGES } from "@/lib/kits";
import { LAYOUT_GROUP, PAGE_GROUPS, PageGroup, kitGroup, matches } from "@/lib/catalog";
import { loadSvg, svgToEls } from "@/lib/svgImport";

const uid = () => Math.random().toString(36).slice(2, 10);
// start layouts below the floating toolbar
const below = (els: El[]) => (els.length ? placeStamp(els, 110, 150) : els);
const fresh = (els: El[]) => { const gm = new Map<string, string>(); return els.map((e) => ({ ...e, id: uid(), g: e.g ? gm.get(e.g) ?? (gm.set(e.g, uid()), gm.get(e.g)) : undefined })); };

export function NewPageDialog({ onCreate, onClose }: { onCreate: (p: { paper: Paper; drawing: El[]; title: string }) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"templates" | "blank">("templates");
  const [group, setGroup] = useState<PageGroup | "All" | "Mine">("All");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const custom = useCustomTemplates();
  const built = useMemo(() => PAGE_TEMPLATES.map((t) => ({ ...t, els: t.build(), group: LAYOUT_GROUP[t.id] ?? "Notes & paper" })), []);
  const want = (g: PageGroup) => group === "All" || group === g;
  const mine = custom.pages.filter((t) => (group === "All" || group === "Mine") && (!q || matches(q, t.name, "my layouts")));
  const drawn = built.filter((t) => want(t.group) && (!q || matches(q, t.name, t.hint, t.group, "hand-drawn")));
  const lib = KIT_PAGES.filter((p) => want(kitGroup(p)) && (!q || matches(q, p.title, p.cat, kitGroup(p))));
  const total = KIT_PAGES.length + built.length + custom.pages.length;
  const openKit = async (id: string) => {
    const p = KIT_PAGES.find((x) => x.id === id)!; setBusy(id);
    try { onCreate({ paper: "blank", drawing: below(await loadSvg(p.src, { lock: true })), title: p.title }); }
    catch { alert("Couldn't load that template. Check your connection and try again."); }
    finally { setBusy(null); }
  };
  const importSvg = async (f: File) => {
    try {
      const els = svgToEls(await f.text(), { lock: true });
      if (!els.length) { alert("Nothing usable was found in that SVG."); return; }
      const name = f.name.replace(/\.svg$/i, "").replace(/[_-]+/g, " ");
      custom.add({ name, cat: "My layouts", kind: "page", paper: "blank", els: placeStamp(els, 0, 0) });
      setGroup("Mine"); setQ("");
    } catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal new-page" role="dialog" aria-modal="true" aria-label="New scribble page" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 className="pane-title">New scribble page</h2><button className="btn icon-btn ghost" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "templates"} className={tab === "templates" ? "on" : ""} onClick={() => setTab("templates")}>Templates <span className="muted">{total}</span></button>
          <button role="tab" aria-selected={tab === "blank"} className={tab === "blank" ? "on" : ""} onClick={() => setTab("blank")}>Blank page</button>
        </div>
        <div className="modal-body">
          {tab === "templates" ? <>
            <div className="lib-bar">
              <label className="search flex-1"><Icon name="search" /><input placeholder="Search: planner, meeting, budget, cornell…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search templates" /></label>
            </div>
            <div className="stamp-cats mb-3" role="tablist" aria-label="Template groups">
              {(["All", ...PAGE_GROUPS, ...(custom.pages.length ? ["Mine" as const] : [])] as const).map((c) => (
                <button key={c} role="tab" aria-selected={group === c} className={`chip-btn ${group === c ? "on" : ""}`} onClick={() => setGroup(c)}>{c === "Mine" ? "My layouts" : c}</button>
              ))}
            </div>
            <p className="muted mb-3 text-xs">Every line, box and cell is ready to write in: tap and type, or write with the pen.</p>
            <div className="layout-grid lib-grid">
              {mine.map((t) => (
                <div key={t.id} className="stamp-wrap">
                  <button className="layout-opt" onClick={() => onCreate({ paper: t.paper ?? "sheet", drawing: below(fresh(t.els)), title: t.name })}>
                    <div className="layout-thumb"><StampThumb els={t.els} /></div><b>{t.name}</b><small>My layouts</small>
                  </button>
                  <button className="stamp-del" aria-label={`Delete layout ${t.name}`} onClick={() => confirm(`Delete the layout "${t.name}"?`) && custom.remove(t.id)}><Icon name="close" /></button>
                </div>
              ))}
              {group !== "Mine" && drawn.map((t) => (
                <button key={t.id} className="layout-opt" onClick={() => onCreate({ paper: t.paper, drawing: below(t.build()), title: t.name })} title={t.hint}>
                  <div className="layout-thumb"><StampThumb els={t.els} /></div>
                  <b>{t.name}</b><small>{t.group} · hand-drawn</small>
                </button>
              ))}
              {group !== "Mine" && lib.map((p) => (
                <button key={p.id} className="layout-opt" disabled={!!busy} onClick={() => openKit(p.id)} title={`${p.title} · ${p.cat}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className={`lib-thumb ${p.h > p.w ? "tall" : ""}`}><img src={p.src} alt="" loading="lazy" />{busy === p.id && <span className="lib-busy">Opening…</span>}</div>
                  <b>{p.title}</b><small>{kitGroup(p)}</small>
                </button>
              ))}
              {mine.length + (group === "Mine" ? 0 : drawn.length + lib.length) === 0 && <p className="muted text-sm">No templates match “{q}”.</p>}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="muted flex-1 text-xs">Make your own: build a page, then use <b>Save as template → Whole page</b>. Or import an SVG page design.</p>
              <label className="btn cursor-pointer"><Icon name="plus" /> Import SVG<input type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importSvg(f); e.target.value = ""; }} /></label>
            </div>
          </> : <>
            <p className="muted mb-3 text-sm">Pick a paper. You can change it later from the Paper button on the page.</p>
            <PaperPicker onPick={(paper) => onCreate({ paper, drawing: [], title: "" })} />
          </>}
        </div>
      </div>
    </div>
  );
}
