"use client";
// Reads uploaded files and turns them into notes:
//  • PDF / images / SVG → a scribble page you can write and draw on (PDF text is kept for search and AI)
//  • PDF (text mode), Word, PowerPoint, Excel/CSV, Markdown, text, HTML, code → an editable note
//  • anything else → a note with the file attached for download
// Heavy libraries are loaded only when a file of that kind is imported.
import { El, Note } from "./types";
import { putAsset, fmtSize } from "./assets";
import { svgToEls } from "./svgImport";

export type Mode = "page" | "text";
export type Progress = (msg: string) => void;
const uid = () => Math.random().toString(36).slice(2, 10);
const ext = (f: File) => (f.name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
const base = (f: File) => f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Imported file";

const IMG = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];
const CODE: Record<string, string> = { js: "javascript", mjs: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx", py: "python", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", cs: "csharp", go: "go", rs: "rust", rb: "ruby", php: "php", sh: "bash", bash: "bash", sql: "sql", css: "css", scss: "scss", xml: "xml", yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini", kt: "kotlin", swift: "swift", r: "r", m: "matlab", lua: "lua", dart: "dart", ipynb: "json", json: "json" };
const SHEET = ["xlsx", "xls", "xlsm", "ods", "csv", "tsv"];

/** What a file can become, for the import dialog */
export function kindOf(f: File): { label: string; modes: Mode[] } {
  const e = ext(f);
  if (e === "pdf" || f.type === "application/pdf") return { label: "PDF", modes: ["page", "text"] };
  if (IMG.includes(e) || /^image\/(png|jpe?g|gif|webp|bmp|avif)$/.test(f.type)) return { label: "Image", modes: ["page"] };
  if (e === "svg") return { label: "SVG drawing", modes: ["page"] };
  if (e === "docx") return { label: "Word document", modes: ["text"] };
  if (e === "pptx") return { label: "PowerPoint", modes: ["text"] };
  if (SHEET.includes(e)) return { label: e === "csv" || e === "tsv" ? "CSV table" : "Spreadsheet", modes: ["text"] };
  if (["md", "markdown", "mdx"].includes(e)) return { label: "Markdown", modes: ["text"] };
  if (["txt", "text", "log"].includes(e) || f.type === "text/plain") return { label: "Text", modes: ["text"] };
  if (["html", "htm"].includes(e)) return { label: "Web page", modes: ["text"] };
  if (CODE[e]) return { label: "Code", modes: ["text"] };
  return { label: "Attachment", modes: ["text"] };
}

export async function importFile(f: File, mode: Mode, progress: Progress = () => {}): Promise<Partial<Note>> {
  const e = ext(f), k = kindOf(f), title = base(f);
  if (k.label === "PDF") return mode === "page" ? pdfToPage(f, title, progress) : { kind: "doc", title, body: await pdfText(f, progress) };
  if (k.label === "Image") return { kind: "canvas", title, paper: "blank", drawing: [await imageEl(f, 0, 0, 1200, true)] };
  if (k.label === "SVG drawing") return { kind: "canvas", title, paper: "blank", drawing: svgToEls(await f.text(), { lock: true }) };
  if (k.label === "Word document") return { kind: "doc", title, body: await docxToMd(f, progress) };
  if (k.label === "PowerPoint") return { kind: "doc", title, body: await pptxToMd(f) };
  if (SHEET.includes(e)) return { kind: "doc", title, body: await sheetToMd(f) };
  if (k.label === "Markdown" || k.label === "Text") return { kind: "doc", title, body: (await f.text()).replace(/\r\n?/g, "\n") };
  if (k.label === "Web page") return { kind: "doc", title, body: await htmlToMd(await f.text()) };
  if (CODE[e]) {
    let text = await f.text();
    if (e === "json" || e === "ipynb") { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep as is */ } }
    return { kind: "doc", title: f.name, body: "```" + CODE[e] + "\n" + text.replace(/\r\n?/g, "\n") + "\n```\n" };
  }
  const id = await putAsset(f, f.name);
  return { kind: "doc", title, body: `📎 [${f.name}](asset:${id}) · ${fmtSize(f.size)}\n\nThis file type can't be opened inside WebNotes, so it is attached: click it to download. Write your notes about it below.\n\n` };
}

/* ---------------- images ---------------- */
async function imageSize(blob: Blob) {
  try { const b = await createImageBitmap(blob); const s = { w: b.width, h: b.height }; b.close(); return s; }
  catch {
    return new Promise<{ w: number; h: number }>((ok, fail) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => fail(new Error("That image couldn't be read.")); i.src = URL.createObjectURL(blob); });
  }
}
/** an image item, scaled to at most maxW wide */
export async function imageEl(blob: Blob, x: number, y: number, maxW: number, lock: boolean, name = "image"): Promise<El> {
  const { w, h } = await imageSize(blob), k = Math.min(1, maxW / w);
  const src = await putAsset(blob, (blob as File).name ?? name);
  return { id: uid(), t: "image", src, x, y, x2: x + w * k, y2: y + h * k, c: "auto", w: 0, ...(lock ? { lock: true } : {}) };
}

/* ---------------- PDF ---------------- */
async function pdfjs() {
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return lib;
}
async function openPdf(f: Blob) {
  const lib = await pdfjs();
  try { return await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; }
  catch (e) { throw new Error((e as Error).name === "PasswordException" ? "This PDF is password-protected. Remove the password and try again." : "That PDF couldn't be read."); }
}
type TextItem = { str: string; hasEOL?: boolean };
async function pageText(page: { getTextContent: () => Promise<{ items: unknown[] }> }) {
  const tc = await page.getTextContent();
  return (tc.items as TextItem[]).map((i) => i.str + (i.hasEOL ? "\n" : "")).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function pdfText(f: File, progress: Progress) {
  const doc = await openPdf(f), out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) { progress(`Reading page ${i} of ${doc.numPages}…`); out.push(`## Page ${i}\n\n${await pageText(await doc.getPage(i))}`); }
  const body = out.join("\n\n");
  if (!body.replace(/## Page \d+/g, "").trim()) return body + "\n\n> This PDF has no selectable text (it may be a scan). Import it as pages to write on instead.";
  return body;
}
/** PDF pages rendered as images, stacked down the page; also used when a PDF is dropped onto a page */
export async function pdfPages(f: Blob, x0: number, y0: number, width: number, lock: boolean, progress: Progress = () => {}) {
  const doc = await openPdf(f), els: El[] = [], texts: string[] = [];
  let y = y0;
  const pages = Math.min(doc.numPages, 200);
  for (let i = 1; i <= pages; i++) {
    progress(`Rendering page ${i} of ${pages}…`);
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 }), scale = Math.min(3, (width * 1.6) / v1.width), v = page.getViewport({ scale });
    const cv = document.createElement("canvas"); cv.width = Math.ceil(v.width); cv.height = Math.ceil(v.height);
    const ctx = cv.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: v }).promise;
    const blob = await new Promise<Blob>((ok) => cv.toBlob((b) => ok(b!), "image/jpeg", 0.9));
    const src = await putAsset(blob, `page-${i}.jpg`);
    const h = (width * v1.height) / v1.width;
    els.push({ id: uid(), t: "image", src, x: x0, y, x2: x0 + width, y2: y + h, c: "auto", w: 0, pg: [i, v1.width, v1.height], ...(lock ? { lock: true } : {}) });
    texts.push(await pageText(page).catch(() => ""));
    y += h + 40;
    page.cleanup();
  }
  return { els, text: texts.map((t, i) => (t ? `## Page ${i + 1}\n\n${t}` : "")).filter(Boolean).join("\n\n"), more: doc.numPages - pages };
}
async function pdfToPage(f: File, title: string, progress: Progress): Promise<Partial<Note>> {
  const r = await pdfPages(f, 0, 0, 1000, true, progress);
  return { kind: "canvas", title, paper: "blank", drawing: r.els, body: r.text + (r.more ? `\n\n(${r.more} more pages were not imported: the limit is 200.)` : "") };
}

/* ---------------- Word / HTML ---------------- */
async function turndown() {
  const [{ default: TD }, { gfm }] = await Promise.all([import("turndown"), import("turndown-plugin-gfm")]);
  const td = new TD({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
  td.use(gfm);
  td.remove(["script", "style", "noscript", "iframe", "object", "embed"] as never);
  return td;
}
export async function htmlToMd(html: string) {
  const td = await turndown();
  // Markdown tables need a header row: use each table's first row when it has none
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("table").forEach((t) => {
    if (t.querySelector("th")) return;
    const first = t.querySelector("tr"); if (!first) return;
    first.querySelectorAll("td").forEach((td) => { const th = doc.createElement("th"); th.innerHTML = td.textContent?.trim() ?? ""; td.replaceWith(th); });
    const thead = doc.createElement("thead"); thead.appendChild(first); t.insertBefore(thead, t.firstChild);
  });
  doc.querySelectorAll("td p, th p").forEach((p) => { p.replaceWith(doc.createTextNode((p.textContent ?? "") + " ")); });
  return td.turndown(doc.body.innerHTML).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
async function docxToMd(f: File, progress: Progress) {
  progress("Reading the document…");
  const mod = await import("mammoth/mammoth.browser"); const mammoth = (mod as { default?: typeof mod.default }).default ?? (mod as unknown as typeof mod.default);
  type Img = { contentType: string; read: (enc?: string) => Promise<ArrayBuffer> };
  const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() }, {
    convertImage: mammoth.images.imgElement(async (img: Img) => {
      const buf = await img.read();
      const id = await putAsset(new Blob([buf], { type: img.contentType }), "image");
      return { src: `asset:${id}` };
    }),
  });
  void messages;
  return htmlToMd(html);
}

/* ---------------- PowerPoint ---------------- */
async function pptxToMd(f: File) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await f.arrayBuffer());
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/(\d+)\.xml/)![1] - +b.match(/(\d+)\.xml/)![1]);
  const out: string[] = [];
  for (const [i, name] of slides.entries()) {
    const xml = new DOMParser().parseFromString(await zip.file(name)!.async("string"), "application/xml");
    const paras = Array.from(xml.getElementsByTagName("a:p")).map((p) => Array.from(p.getElementsByTagName("a:t")).map((t) => t.textContent ?? "").join("").trim()).filter(Boolean);
    const notesName = `ppt/notesSlides/notesSlide${name.match(/(\d+)\.xml/)![1]}.xml`;
    let notes = "";
    if (zip.file(notesName)) {
      const nx = new DOMParser().parseFromString(await zip.file(notesName)!.async("string"), "application/xml");
      notes = Array.from(nx.getElementsByTagName("a:t")).map((t) => t.textContent ?? "").join(" ").replace(/\s+/g, " ").trim();
    }
    out.push(`## Slide ${i + 1}${paras[0] ? ` · ${paras[0]}` : ""}\n\n` + paras.slice(1).map((p) => `- ${p}`).join("\n") + (notes ? `\n\n> Speaker notes: ${notes}` : ""));
  }
  return out.join("\n\n") || "_No text found in this presentation._";
}

/* ---------------- spreadsheets ---------------- */
async function sheetToMd(f: File) {
  const XLSX = await import("xlsx");
  const isText = /\.(csv|tsv)$/i.test(f.name);
  const wb = isText ? XLSX.read(await f.text(), { type: "string", FS: /\.tsv$/i.test(f.name) ? "\t" : undefined }) : XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array" });
  const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const parts = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });
    if (!rows.length) return `## ${name}\n\n_Empty sheet._`;
    const width = Math.min(30, Math.max(...rows.map((r) => r.length)));
    const shown = rows.slice(0, 1000).map((r) => Array.from({ length: width }, (_, i) => cell(r[i])));
    const [head, ...body] = shown;
    const md = [`| ${head.map((h, i) => h || `Column ${i + 1}`).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");
    return (wb.SheetNames.length > 1 || !isText ? `## ${name}\n\n` : "") + md + (rows.length > 1000 ? `\n\n_Showing the first 1000 of ${rows.length} rows._` : "");
  });
  return parts.join("\n\n") + "\n";
}
