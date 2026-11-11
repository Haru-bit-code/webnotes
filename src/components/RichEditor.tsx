"use client";
// Word-style editing: what you see is what you get, no Markdown marks.
// Content is stored as clean HTML (note.html); note.body keeps its plain text for search and the AI panel.
import { useEffect, useRef, useState } from "react";
import { cleanHtml, htmlText } from "@/lib/formats";
import { countHeld, holdHtml, releaseIn } from "@/lib/remote";
import { assetUrl, putAsset, fmtSize } from "@/lib/assets";
import { Icon } from "./Icon";

const cmd = (c: string, v?: string) => document.execCommand(c, false, v);

// mid-tone colours that stay readable on both the light and the dark theme
const TEXT_COLORS: [string, string][] = [["Red", "#e5484d"], ["Orange", "#f76b15"], ["Amber", "#d6a100"], ["Green", "#30a46c"], ["Teal", "#12a594"], ["Blue", "#3e7bfa"], ["Purple", "#8e4ec6"], ["Pink", "#d6409f"], ["Grey", "#8b8d98"]];
// see-through highlights, so the text keeps its own colour on either theme
const HIGHLIGHTS: [string, string][] = [["Yellow", "rgba(250, 204, 21, 0.38)"], ["Green", "rgba(48, 164, 108, 0.32)"], ["Blue", "rgba(62, 123, 250, 0.3)"], ["Pink", "rgba(214, 64, 159, 0.3)"], ["Orange", "rgba(247, 107, 21, 0.32)"], ["Purple", "rgba(142, 78, 198, 0.3)"]];

export function RichEditor({ html, onChange, readOnly, toolbarless, children, wrapStyle }: {
  html: string; onChange: (html: string, text: string) => void; readOnly?: boolean; toolbarless?: boolean; children?: React.ReactNode; wrapStyle?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>("");
  const [state, setState] = useState<Record<string, boolean | string>>({});
  const [palette, setPalette] = useState<null | "text" | "mark">(null);
  const [held, setHeld] = useState(0); // pictures from the web waiting for permission
  const [lastText, setLastText] = useState("#e5484d"), [lastMark, setLastMark] = useState(HIGHLIGHTS[0][1]);
  useEffect(() => {
    if (!palette) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement).closest?.(".color-pop, .color-btn")) setPalette(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPalette(null); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [palette]);
  // colour the selected text (spans with inline style, so it can be saved and exported)
  const paint = (kind: "text" | "mark", color: string | null) => {
    ref.current?.focus(); cmd("styleWithCSS", "true");
    if (kind === "text") { cmd("foreColor", color ?? "inherit"); if (color) setLastText(color); }
    else { cmd("hiliteColor", color ?? "transparent"); if (color) setLastMark(color); }
    cmd("styleWithCSS", "false"); save(); refresh(); setPalette(null);
  };

  // load content (and again only if it changed from outside, e.g. the AI panel added text)
  useEffect(() => {
    const el = ref.current; if (!el || html === last.current) return;
    el.innerHTML = holdHtml(cleanHtml(html)).html; last.current = html; resolveImages(); setHeld(countHeld(el));
  }, [html]);

  const resolveImages = () => ref.current?.querySelectorAll<HTMLImageElement>("img[data-asset]").forEach((img) => {
    if (!img.getAttribute("src")) assetUrl(img.dataset.asset!).then((u) => { if (u) img.src = u; else img.alt = "(image not stored in this browser)"; });
  });
  const save = () => {
    const el = ref.current; if (!el) return;
    const copy = el.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("img[data-asset]").forEach((i) => i.removeAttribute("src"));
    releaseIn(copy); // pictures from the web keep their real address in the saved note
    const out = cleanHtml(copy.innerHTML); last.current = out;
    onChange(out, htmlText(out));
  };
  const refresh = () => setState({
    bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline"),
    strike: document.queryCommandState("strikeThrough"), ul: document.queryCommandState("insertUnorderedList"), ol: document.queryCommandState("insertOrderedList"),
    block: (document.queryCommandValue("formatBlock") || "p").toLowerCase(),
    color: document.queryCommandValue("foreColor") || "",
  });
  const run = (c: string, v?: string) => { ref.current?.focus(); cmd(c, v); save(); refresh(); };
  const insertHtml = (h: string) => { ref.current?.focus(); cmd("insertHTML", h); resolveImages(); save(); };

  const addFiles = async (files: File[]) => {
    for (const f of files) {
      try {
        const id = await putAsset(f, f.name);
        insertHtml(f.type.startsWith("image/") ? `<img data-asset="${id}" alt="${f.name.replace(/"/g, "")}">` : `<p>📎 <a href="#" data-asset="${id}">${f.name}</a> · ${fmtSize(f.size)}</p>`);
      } catch (e) { alert((e as Error).message); }
    }
  };
  const pickImage = () => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.multiple = true; i.onchange = () => addFiles(Array.from(i.files ?? [])); i.click(); };
  const link = () => { const url = prompt("Link address (https://…)"); if (url) run("createLink", /^\w+:/.test(url) ? url : "https://" + url); };
  const table = () => insertHtml(`<table><thead><tr><th>Heading</th><th>Heading</th><th>Heading</th></tr></thead><tbody>${"<tr><td><br></td><td><br></td><td><br></td></tr>".repeat(2)}</tbody></table><p><br></p>`);
  const checklist = () => insertHtml(`<ul data-checked="list"><li data-checked="false">To do</li></ul>`);

  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); link(); }
    if (e.key === "Tab") { e.preventDefault(); cmd(e.shiftKey ? "outdent" : "indent"); save(); }
  };
  // tick boxes: click the box at the start of a checklist item
  const onClick = (e: React.MouseEvent) => {
    const li = (e.target as HTMLElement).closest("li[data-checked]") as HTMLElement | null;
    if (li && e.clientX - li.getBoundingClientRect().left < 26) { li.dataset.checked = li.dataset.checked === "true" ? "false" : "true"; save(); }
    const a = (e.target as HTMLElement).closest("a[data-asset]") as HTMLElement | null;
    if (a) { e.preventDefault(); import("@/lib/assets").then((m) => m.downloadAsset(a.dataset.asset!, a.textContent || "file")); }
  };

  const B = (name: string, icon: string, label: string, on?: boolean, act?: () => void) =>
    <button key={name} type="button" className={`btn icon-btn ghost ${on ? "on" : ""}`} title={label} aria-label={label} aria-pressed={on} onMouseDown={(e) => e.preventDefault()} onClick={act ?? (() => run(name))}><Icon name={icon} /></button>;

  return (
    <div className="rich-wrap">
      {!toolbarless && !readOnly && (
        <div className="rich-bar" role="toolbar" aria-label="Formatting">
          <select className="field w-auto" aria-label="Text style" value={["h1", "h2", "h3", "pre", "blockquote"].includes(String(state.block)) ? String(state.block) : "p"}
            onChange={(e) => run("formatBlock", e.target.value)}>
            <option value="p">Normal text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option><option value="pre">Code block</option>
          </select>
          <span className="rich-sep" />
          {B("bold", "bold", "Bold (⌘B)", !!state.bold)}{B("italic", "italic", "Italic (⌘I)", !!state.italic)}{B("underline", "underline", "Underline (⌘U)", !!state.underline)}{B("strikeThrough", "strike", "Strikethrough", !!state.strike)}
          {/* text colour: the letter A underlined with the colour; the arrow opens the palette */}
          <span className="color-btn">
            <button type="button" className="btn icon-btn ghost" title="Text colour" aria-label="Text colour" onMouseDown={(e) => e.preventDefault()} onClick={() => paint("text", lastText)}>
              <span className="color-a" style={{ borderColor: lastText }}>A</span>
            </button>
            <button type="button" className="btn ghost color-more" aria-label="More text colours" aria-expanded={palette === "text"} onMouseDown={(e) => e.preventDefault()} onClick={() => setPalette(palette === "text" ? null : "text")}><Icon name="chevron" /></button>
            {palette === "text" && (
              <div className="color-pop" role="menu" aria-label="Text colour">
                <button type="button" className="color-default" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => paint("text", null)}>Default colour</button>
                <div className="color-grid">{TEXT_COLORS.map(([n, c]) => <button key={c} type="button" role="menuitem" className="swatch" title={n} aria-label={n} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => paint("text", c)} />)}</div>
              </div>
            )}
          </span>
          <span className="color-btn">
            <button type="button" className="btn icon-btn ghost" title="Highlight" aria-label="Highlight" onMouseDown={(e) => e.preventDefault()} onClick={() => paint("mark", lastMark)}>
              <span className="color-mark" style={{ background: lastMark }}><Icon name="marker" /></span>
            </button>
            <button type="button" className="btn ghost color-more" aria-label="More highlight colours" aria-expanded={palette === "mark"} onMouseDown={(e) => e.preventDefault()} onClick={() => setPalette(palette === "mark" ? null : "mark")}><Icon name="chevron" /></button>
            {palette === "mark" && (
              <div className="color-pop" role="menu" aria-label="Highlight colour">
                <button type="button" className="color-default" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => paint("mark", null)}>No highlight</button>
                <div className="color-grid">{HIGHLIGHTS.map(([n, c]) => <button key={c} type="button" role="menuitem" className="swatch" title={n} aria-label={`${n} highlight`} style={{ background: c }} onMouseDown={(e) => e.preventDefault()} onClick={() => paint("mark", c)} />)}</div>
              </div>
            )}
          </span>
          <span className="rich-sep" />
          {B("insertUnorderedList", "ul", "Bulleted list", !!state.ul)}{B("insertOrderedList", "ol", "Numbered list", !!state.ol)}{B("check", "check", "Checklist", false, checklist)}
          {B("justifyLeft", "alignL", "Align left")}{B("justifyCenter", "alignC", "Align centre")}
          <span className="rich-sep" />
          {B("link", "link", "Link (⌘K)", false, link)}{B("table", "table", "Insert table", false, table)}{B("image", "image", "Insert image", false, pickImage)}
          {B("removeFormat", "clear", "Clear formatting")}
          <span className="rich-sep" />
          {B("undo", "undo", "Undo")}{B("redo", "redo", "Redo")}
        </div>
      )}
      {held > 0 && (
        <div className="remote-bar top" role="status">
          <span>{held === 1 ? "1 picture from the web is" : `${held} pictures from the web are`} hidden to protect your privacy.</span>
          <button className="btn" onClick={() => { if (ref.current) { releaseIn(ref.current); setHeld(0); } }}>Show pictures</button>
        </div>
      )}
      <div className="reading rich-scroll">
        <div className="ink-wrap" style={wrapStyle}>
          <div ref={ref} className="md rich-doc" contentEditable={!readOnly} suppressContentEditableWarning role="textbox" aria-multiline aria-label="Document"
            data-placeholder="Start writing…" spellCheck
            onInput={save} onKeyUp={refresh} onMouseUp={refresh} onKeyDown={onKey} onClick={onClick} onBlur={save}
            onPaste={(e) => {
              const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); addFiles(fs); return; }
              const h = e.clipboardData.getData("text/html");
              if (h) { e.preventDefault(); const r = holdHtml(cleanHtml(h)); insertHtml(r.html); if (r.held) setHeld(countHeld(ref.current)); }
            }}
            onDrop={(e) => { const fs = Array.from(e.dataTransfer.files); if (fs.length) { e.preventDefault(); e.stopPropagation(); addFiles(fs); } }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); } }} />
          {children}
        </div>
      </div>
    </div>
  );
}
