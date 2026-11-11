"use client";
// Writes a note back out as a Word document (.docx) or a self-contained web page (.html).
import { Marked, Token, Tokens } from "marked";
import { assetDataUrl, getAsset } from "./assets";
import { renderMarkdown } from "./markdown";

const lexer = new Marked({ gfm: true });

export async function noteToDocx(title: string, body: string): Promise<Blob> {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink, AlignmentType, BorderStyle } = d;
  const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  type Run = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink> | InstanceType<typeof ImageRun>;

  const imageRun = async (href: string): Promise<Run | null> => {
    if (!href.startsWith("asset:")) return null;
    const a = await getAsset(href.slice(6)); if (!a) return null;
    const type = /png/.test(a.type) ? "png" : /gif/.test(a.type) ? "gif" : /bmp/.test(a.type) ? "bmp" : "jpg";
    let w = 480, h = 320;
    try { const b = await createImageBitmap(a.blob); const k = Math.min(1, 560 / b.width); w = b.width * k; h = b.height * k; b.close(); } catch { /* default size */ }
    return new ImageRun({ type, data: new Uint8Array(await a.blob.arrayBuffer()), transformation: { width: w, height: h } } as never);
  };
  const inline = async (tokens: Token[] = [], fmt: { bold?: boolean; italics?: boolean; strike?: boolean } = {}): Promise<Run[]> => {
    const out: Run[] = [];
    for (const t of tokens) {
      switch (t.type) {
        case "strong": out.push(...await inline((t as Tokens.Strong).tokens, { ...fmt, bold: true })); break;
        case "em": out.push(...await inline((t as Tokens.Em).tokens, { ...fmt, italics: true })); break;
        case "del": out.push(...await inline((t as Tokens.Del).tokens, { ...fmt, strike: true })); break;
        case "codespan": out.push(new TextRun({ text: (t as Tokens.Codespan).text, font: "Consolas", ...fmt })); break;
        case "br": out.push(new TextRun({ text: "", break: 1 })); break;
        case "link": {
          const l = t as Tokens.Link;
          if (l.href.startsWith("asset:")) { out.push(new TextRun({ text: l.text, ...fmt, underline: {} })); break; }
          out.push(new ExternalHyperlink({ link: l.href, children: [new TextRun({ text: l.text, style: "Hyperlink", ...fmt })] })); break;
        }
        case "image": { const r = await imageRun((t as Tokens.Image).href); if (r) out.push(r); break; }
        case "text": { const tt = t as Tokens.Text; if (tt.tokens?.length) out.push(...await inline(tt.tokens, fmt)); else out.push(new TextRun({ text: decode(tt.text), ...fmt })); break; }
        default: out.push(new TextRun({ text: decode((t as { text?: string }).text ?? t.raw), ...fmt }));
      }
    }
    return out;
  };
  const blocks = async (tokens: Token[], level = 0): Promise<(InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[]> => {
    const out: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
    for (const t of tokens) {
      switch (t.type) {
        case "heading": { const h = t as Tokens.Heading; out.push(new Paragraph({ heading: H[h.depth - 1], children: await inline(h.tokens) })); break; }
        case "paragraph": out.push(new Paragraph({ children: await inline((t as Tokens.Paragraph).tokens), spacing: { after: 120 } })); break;
        case "list": {
          const l = t as Tokens.List;
          for (const [i, item] of l.items.entries()) {
            const [first, ...rest] = item.tokens;
            const runs = first && (first.type === "text" || first.type === "paragraph") ? await inline((first as Tokens.Text).tokens ?? [first]) : [];
            const box = item.task ? [new TextRun({ text: item.checked ? "☑ " : "☐ " })] : [];
            out.push(new Paragraph({ children: [...box, ...runs], ...(l.ordered ? { numbering: { reference: "num", level } } : { bullet: { level } }), ...(l.ordered && i === 0 ? {} : {}) }));
            out.push(...await blocks(rest.filter((x) => x !== first), level + 1));
          }
          break;
        }
        case "code": {
          const c = t as Tokens.Code;
          c.text.split("\n").forEach((line) => out.push(new Paragraph({ children: [new TextRun({ text: line || " ", font: "Consolas", size: 19 })], shading: { fill: "F3F4F6" } as never, spacing: { after: 0 } })));
          out.push(new Paragraph({ children: [] }));
          break;
        }
        case "blockquote": {
          const inner = await blocks((t as Tokens.Blockquote).tokens, level);
          inner.forEach((p) => out.push(p));
          break;
        }
        case "table": {
          const tb = t as Tokens.Table;
          const row = async (cells: Tokens.TableCell[], head: boolean) => new TableRow({ tableHeader: head, children: await Promise.all(cells.map(async (c) => new TableCell({ children: [new Paragraph({ children: await inline(c.tokens, head ? { bold: true } : {}) })], ...(head ? { shading: { fill: "E8ECF1" } as never } : {}) }))) });
          out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [await row(tb.header, true), ...await Promise.all(tb.rows.map((r) => row(r, false)))] }));
          out.push(new Paragraph({ children: [] }));
          break;
        }
        case "hr": out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } } })); break;
        case "space": break;
        default: if ((t as { text?: string }).text) out.push(new Paragraph({ children: [new TextRun(decode((t as { text: string }).text))] }));
      }
    }
    return out;
  };
  const tokens = lexer.lexer(body.replace(/```(chart|plot|sketch|mermaid)[\s\S]*?```/g, (m) => "```\n" + m.split("\n").slice(1, -1).join("\n") + "\n```"));
  const doc = new Document({
    creator: "WebNotes", title,
    numbering: { config: [{ reference: "num", levels: [0, 1, 2, 3].map((lv) => ({ level: lv, format: "decimal" as never, text: `%${lv + 1}.`, alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720 * (lv + 1), hanging: 360 } } } })) }] },
    sections: [{ children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title || "Untitled")] }), ...await blocks(tokens)] }],
  });
  return Packer.toBlob(doc);
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export async function noteToHtml(title: string, body: string): Promise<Blob> {
  const wrap = document.createElement("div");
  wrap.innerHTML = renderMarkdown(body);
  for (const img of Array.from(wrap.querySelectorAll<HTMLImageElement>("img[data-asset]"))) { const u = await assetDataUrl(img.dataset.asset!); if (u) img.src = u; img.removeAttribute("data-asset"); }
  wrap.querySelectorAll("a[data-asset-file]").forEach((a) => a.removeAttribute("href"));
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>body{font:16px/1.65 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#18202e}h1,h2,h3{line-height:1.25}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:4px 8px}pre{background:#f3f4f6;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}</style></head>
<body><h1>${esc(title || "Untitled")}</h1>${wrap.innerHTML}</body></html>`;
  return new Blob([html], { type: "text/html" });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
