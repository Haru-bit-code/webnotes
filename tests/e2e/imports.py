import asyncio, sys, json, os
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

F, D = FIXTURES, OUT
async def notes(pg): return await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes')||'[]')")
async def byTitle(pg, t): return [n for n in await notes(pg) if n["title"]==t]
async def open_note(pg, title):
    await pg.locator(f".note-card:has(.note-card-title:text-is('{title}'))").first.click(); await pg.wait_for_timeout(700)

async def as_markdown(pg):
    await pg.evaluate("""() => document.querySelectorAll('.import-row select').forEach(s => { if (s.value !== 'page' && [...s.options].some(o => o.value === 'markdown')) { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'markdown'); s.dispatchEvent(new Event('change', { bubbles: true })); } })""")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg=await ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(900)
    files=["Physics_Notes.pdf","Project_Brief.docx","Review.pptx","Budget.xlsx","grades.csv","todo.md","plain.txt","page.html","script.py","data.json","photo.jpg","archive.zip"]
    await pg.click(".list-head button:has-text('New')")
    async with pg.expect_file_chooser() as fc: await pg.click("text=Import file…")
    await (await fc.value).set_files([os.path.join(F,f) for f in files]); await pg.wait_for_timeout(500)
    await pg.screenshot(path=f"{D}/01-dialog.png")
    ok("import dialog lists every file", await pg.locator(".import-row").count()==len(files))
    await as_markdown(pg); await pg.click("button:has-text('Import'):not(:has-text('file'))"); 
    await pg.wait_for_function("!document.querySelector('.modal')", timeout=60000)
    N=await notes(pg); ok("one note per file", len(N)==len(files), str(len(N)))
    t=lambda name: next((n for n in N if n["title"]==name), None)
    pdf=t("Physics Notes"); ok("PDF → page with 3 page images", pdf and pdf["kind"]=="canvas" and len([e for e in pdf["drawing"] if e["t"]=="image"])==3)
    ok("PDF text kept for search", pdf and "PAGE2MARK" in pdf.get("body",""))
    d=t("Project Brief"); ok("Word → note with bold/italic", d and "**bold**" in d["body"] and "*italic*" in d["body"], d and d["body"][:160])
    ok("Word table kept", d and "| Task | Owner |" in d["body"].replace("  "," "), d and d["body"][d["body"].find("|")-5:d["body"].find("|")+90])
    ok("Word image kept", d and "asset:" in d["body"])
    pp=t("Review"); ok("PowerPoint → slides + notes", pp and "Quarterly Review" in pp["body"] and "Speaker notes" in pp["body"] and "Slide 2" in pp["body"])
    x=t("Budget"); ok("Excel → both sheets as tables", x and "## Budget" in x["body"] and "## Team" in x["body"] and "| Laptop | 900 |" in x["body"], x and x["body"][:120])
    c=t("grades"); ok("CSV → table, quoted commas kept", c and "Great, keep going" in c["body"] and "| Name | Score | Comment |" in c["body"])
    ok("Markdown kept", t("todo") and "- [ ] Read chapter 3" in t("todo")["body"])
    ok("Text kept", t("plain") and "Second line." in t("plain")["body"])
    h=t("page"); ok("HTML → markdown, script dropped", h and "# Web Title" in h["body"] and "alert" not in h["body"] and "[link](https://example.com)" in h["body"], h and h["body"])
    ok("Code → Code note (python)", t("script.py") and t("script.py").get("format")=="code" and t("script.py").get("lang")=="python")
    ok("JSON pretty-printed", t("data.json") and '"a": 1' in t("data.json")["body"])
    ok("Image → page", t("photo") and t("photo")["kind"]=="canvas" and t("photo")["drawing"][0]["t"]=="image")
    ok("Other file → attachment", t("archive") and "📎" in t("archive")["body"])
    # --- Word note: renders image, edit text, scribble, export docx/html
    await open_note(pg, "Project Brief")
    await pg.wait_for_timeout(800)
    nw=await pg.evaluate("Math.max(0,...[...document.querySelectorAll('img[data-asset]')].map(i=>i.naturalWidth))")
    ok("Word image shows in the note", nw>0, str(nw))
    await pg.click("textarea.source"); await pg.keyboard.press("ControlOrMeta+End"); await pg.keyboard.type("\nAdded in WebNotes."); await pg.wait_for_timeout(300)
    ok("Word note is editable", "Added in WebNotes." in (await byTitle(pg,"Project Brief"))[0]["body"])
    await pg.click("[role=switch]"); bx=await pg.locator(".canvas-overlay svg").bounding_box(); await pg.click(".overlay-chrome [aria-label^='Pen']")
    await pg.mouse.move(bx["x"]+20,bx["y"]+30); await pg.mouse.down(); await pg.mouse.move(bx["x"]+200,bx["y"]+50,steps=8); await pg.mouse.up(); await pg.wait_for_timeout(200)
    ok("can scribble on the Word note", len((await byTitle(pg,"Project Brief"))[0].get("ink",[]))==1)
    await pg.click("[role=switch]")
    await pg.screenshot(path=f"{D}/02-word.png")
    await pg.click("[aria-label='Download as']")
    async with pg.expect_download() as dl: await pg.click("text=Word (.docx)")
    path=f"{D}/out.docx"; await (await dl.value).save_as(path)
    import docx as dx; doc=dx.Document(path); txt="\n".join(p.text for p in doc.paragraphs)
    ok("exports a real .docx with the edits", "Added in WebNotes." in txt and len(doc.tables)==1 and doc.tables[0].cell(1,1).text=="Asha", txt[:100])
    ok(".docx contains the picture", len(doc.inline_shapes)>=1)
    await pg.click("[aria-label='Download as']")
    async with pg.expect_download() as dl: await pg.click("text=Web page (.html)")
    hp=f"{D}/out.html"; await (await dl.value).save_as(hp); html=open(hp).read()
    ok("exports HTML with image inlined", "data:image/png" in html and "Project Brief" in html)
    # --- attachment downloads
    await open_note(pg, "archive"); await pg.click("text=Preview") if await pg.locator("[role=radio]:text-is('Preview')").count() else None
    async with pg.expect_download() as dl: await pg.locator("a.attachment").first.click()
    ok("attachment downloads the original file", (await dl.value).suggested_filename=="archive.zip")
    # --- PDF page: write on it, export PDF
    await open_note(pg, "Physics Notes"); await pg.wait_for_timeout(1200)
    loaded=await pg.evaluate("[...document.querySelectorAll('svg image')].filter(i=>i.getAttribute('href')?.startsWith('blob:')).length")
    ok("PDF pages display", loaded==3, str(loaded))
    await pg.screenshot(path=f"{D}/03-pdf.png")
    await pg.click("[aria-label='Highlighter']"); await pg.mouse.move(700,420); await pg.mouse.down(); await pg.mouse.move(950,420,steps=8); await pg.mouse.up()
    await pg.click("[aria-label^='Pen']"); await pg.mouse.move(700,470); await pg.mouse.down(); await pg.mouse.move(900,520,steps=8); await pg.mouse.up()
    await pg.mouse.click(1000, 560); await pg.keyboard.type("My margin note"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
    dr=(await byTitle(pg,"Physics Notes"))[0]["drawing"]
    ok("writing, highlighting, drawing on the PDF", any(e["t"]=="hl" for e in dr) and any(e["t"]=="pen" for e in dr) and any(e.get("text")=="My margin note" for e in dr))
    await pg.screenshot(path=f"{D}/04-pdf-annotated.png")
    await pg.click("[aria-label='More options']")
    async with pg.expect_download(timeout=60000) as dl: await pg.click(".more-pop button:has-text('PDF')")
    pf=f"{D}/out.pdf"; await (await dl.value).save_as(pf); raw=open(pf,"rb").read()
    import pypdf; rd=pypdf.PdfReader(pf)
    ok("exports annotated PDF with 3 A4 pages", len(rd.pages)==3 and round(float(rd.pages[0].mediabox.width))==595, f"{len(raw)} bytes")
    # --- add an image onto an existing page
    n0=len(dr)
    async with pg.expect_file_chooser() as fc: await pg.click("label:has-text('Add file')")
    await (await fc.value).set_files(os.path.join(F,"pic.png")); await pg.wait_for_timeout(800)
    ok("Add file puts an image on the page", len((await byTitle(pg,"Physics Notes"))[0]["drawing"])==n0+1)
    # --- PDF as text
    await pg.click(".list-head button:has-text('New')")
    async with pg.expect_file_chooser() as fc: await pg.click("text=Import file…")
    await (await fc.value).set_files(os.path.join(F,"Physics_Notes.pdf")); await pg.wait_for_timeout(300)
    await pg.select_option(".import-row select", "markdown"); await pg.click("button:has-text('Import'):not(:has-text('file'))"); await pg.wait_for_function("!document.querySelector('.modal')", timeout=30000)
    tn=[n for n in await notes(pg) if n["title"]=="Physics Notes" and n["kind"]=="doc"]
    ok("PDF as editable text", tn and "## Page 3" in tn[0]["body"] and "PAGE3MARK" in tn[0]["body"])
    # --- search finds PDF text
    await pg.fill("input[aria-label='Search notes']", "PAGE2MARK"); await pg.wait_for_timeout(300)
    ok("search finds words inside the PDF", await pg.locator(".note-card").count()>=1)
    ok("no page errors", not errs, ";".join(errs[:3]))
    await b.close()
asyncio.run(main())
