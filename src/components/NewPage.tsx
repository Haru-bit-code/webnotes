"use client";
// "New scribble page" dialog: start from a full-page layout (built-in or your own) or a blank paper.
import { useMemo, useState } from "react";
import { El, Paper } from "@/lib/types";
import { PAGE_TEMPLATES } from "@/lib/pages";
import { useCustomTemplates } from "@/lib/customTemplates";
import { placeStamp } from "@/lib/stamps";
import { PaperPicker } from "./Paper";
import { StampThumb } from "./Canvas";
import { Icon } from "./Icon";

const uid = () => Math.random().toString(36).slice(2, 10);
// start layouts below the floating toolbar
const below = (els: El[]) => (els.length ? placeStamp(els, 110, 150) : els);
const fresh = (els: El[]) => { const gm = new Map<string, string>(); return els.map((e) => ({ ...e, id: uid(), g: e.g ? gm.get(e.g) ?? (gm.set(e.g, uid()), gm.get(e.g)) : undefined })); };

export function NewPageDialog({ onCreate, onClose }: { onCreate: (p: { paper: Paper; drawing: El[]; title: string }) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"layouts" | "blank">("layouts");
  const custom = useCustomTemplates();
  const built = useMemo(() => PAGE_TEMPLATES.map((t) => ({ ...t, els: t.build() })), []);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal new-page" role="dialog" aria-modal="true" aria-label="New scribble page" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 className="pane-title">New scribble page</h2><button className="btn icon-btn ghost" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "layouts"} className={tab === "layouts" ? "on" : ""} onClick={() => setTab("layouts")}>Layouts</button>
          <button role="tab" aria-selected={tab === "blank"} className={tab === "blank" ? "on" : ""} onClick={() => setTab("blank")}>Blank page</button>
        </div>
        <div className="modal-body">
          {tab === "blank" ? <>
            <p className="muted mb-3 text-sm">Pick a paper. You can change it later from the Paper button on the page.</p>
            <PaperPicker onPick={(paper) => onCreate({ paper, drawing: [], title: "" })} />
          </> : <>
            {custom.pages.length > 0 && <>
              <h3 className="section-title mb-2">My layouts</h3>
              <div className="layout-grid mb-5">
                {custom.pages.map((t) => (
                  <div key={t.id} className="stamp-wrap">
                    <button className="layout-opt" onClick={() => onCreate({ paper: t.paper ?? "sheet", drawing: below(fresh(t.els)), title: t.name })}>
                      <div className="layout-thumb"><StampThumb els={t.els} /></div><b>{t.name}</b>
                    </button>
                    <button className="stamp-del" aria-label={`Delete layout ${t.name}`} onClick={() => confirm(`Delete the layout "${t.name}"?`) && custom.remove(t.id)}><Icon name="close" /></button>
                  </div>
                ))}
              </div>
            </>}
            <h3 className="section-title mb-2">Hand-drawn study sheets</h3>
            <div className="layout-grid">
              {built.map((t) => (
                <button key={t.id} className="layout-opt" onClick={() => onCreate({ paper: t.paper, drawing: below(t.build()), title: t.name })} title={t.hint}>
                  <div className="layout-thumb"><StampThumb els={t.els} /></div>
                  <b>{t.name}</b><small>{t.hint}</small>
                </button>
              ))}
            </div>
            <p className="muted mt-4 text-xs">Make your own: build a page, then use <b>Save as template → Whole page</b>.</p>
          </>}
        </div>
      </div>
    </div>
  );
}
