import asyncio, sys, os
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

F, D = FIXTURES, OUT
async def note(pg, title): return [n for n in await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes'))") if n["title"]==title][0]

async def as_markdown(pg):
    await pg.evaluate("""() => document.querySelectorAll('.import-row select').forEach(s => { if (s.value !== 'page' && [...s.options].some(o => o.value === 'markdown')) { const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'markdown'); s.dispatchEvent(new Event('change', { bubbles: true })); } })""")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1500,"height":950}); pg=await ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(800)
    await pg.click(".list-head button:has-text('New')")
    async with pg.expect_file_chooser() as fc: await pg.click("text=Import file…")
    await (await fc.value).set_files([os.path.join(F,f) for f in ["Project_Brief.docx","Review.pptx","Budget.xlsx","Physics_Notes.pdf"]])
    await as_markdown(pg); await pg.click("button:has-text('Import'):not(:has-text('file'))"); await pg.wait_for_function("!document.querySelector('.modal')", timeout=60000)
    for title in ["Project Brief","Review","Budget"]:
      await pg.locator(f".note-card:has(.note-card-title:text-is('{title}'))").first.click(); await pg.wait_for_timeout(600)
      await pg.click("[role=radio]:text-is('Preview')"); await pg.click("[role=switch]"); await pg.wait_for_timeout(400)
      ok(f"{title}: Scribble shows the full toolbar", await pg.locator(".overlay-chrome button:has-text('Templates')").count()==1 and await pg.locator(".overlay-chrome [aria-label='Rectangle']").count()==1)
      ov=await pg.locator(".canvas-overlay svg").bounding_box()
      # pen
      await pg.click(".overlay-chrome [aria-label^='Pen']"); await pg.mouse.move(ov["x"]+40,ov["y"]+40); await pg.mouse.down(); await pg.mouse.move(ov["x"]+300,ov["y"]+70,steps=10); await pg.mouse.up()
      # rectangle around the title
      await pg.click(".overlay-chrome [aria-label='Rectangle']"); await pg.mouse.move(ov["x"]+10,ov["y"]+10); await pg.mouse.down(); await pg.mouse.move(ov["x"]+400,ov["y"]+90,steps=6); await pg.mouse.up()
      # arrow
      await pg.click(".overlay-chrome [aria-label='Arrow']"); await pg.mouse.move(ov["x"]+500,ov["y"]+200); await pg.mouse.down(); await pg.mouse.move(ov["x"]+420,ov["y"]+120,steps=6); await pg.mouse.up()
      # templates: sketch sticky, table, chart, sticker
      await pg.click(".overlay-chrome button:has-text('Templates')"); await pg.wait_for_timeout(300)
      for cat,name in [("Sketch","Sticky · idea"),("Tables","Table 3 × 4"),("Charts","Bar chart"),("Diagrams","Flowchart")]:
        await pg.click(f".overlay-chrome .chip-btn:text-is('{cat}')"); await pg.locator(f".overlay-chrome .stamp:has(span:text-is('{name}'))").click(); await pg.wait_for_timeout(150)
      await pg.click(".overlay-chrome .chip-btn:text-is('Stickers')"); await pg.wait_for_timeout(400); await pg.locator(".overlay-chrome .kit-grid .stamp").first.click(); await pg.wait_for_timeout(500)
      await pg.click(".overlay-chrome [aria-label='Close templates']")
      # type text on the document
      await pg.click(".overlay-chrome [aria-label^='Select']"); await pg.mouse.click(ov["x"]+600, ov["y"]+60); await pg.keyboard.type("Typed over the document"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
      ink=(await note(pg,title)).get("ink",[])
      kinds={e["t"] for e in ink}
      ok(f"{title}: pen, shapes, arrow, text, templates, sticker added", {"pen","rect","arrow","text","path"}<=kinds and len({e.get('g') for e in ink if e.get('g')})>=5, f"{len(ink)} items {sorted(kinds)}")
      await pg.screenshot(path=f"{D}/{title.replace(' ','_')}-on.png")
      await pg.click("[role=switch]"); await pg.wait_for_timeout(300)
      ok(f"{title}: drawings stay visible when Scribble is off", await pg.locator(".canvas-overlay [data-id]").count()==len(ink))
      ok(f"{title}: toolbar hidden when off", await pg.locator(".overlay-chrome").count()==0)
      await pg.screenshot(path=f"{D}/{title.replace(' ','_')}-off.png")
    # document text still selectable/editable after scribbling; reload keeps everything
    await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.locator(".note-card:has(.note-card-title:text-is('Budget'))").first.click(); await pg.wait_for_timeout(600)
    n=len((await note(pg,"Budget"))["ink"]); ok("after reload the overlay is still there", await pg.locator(".canvas-overlay [data-id]").count()==n, str(n))
    # scrolled document: template lands in the visible part
    await pg.locator(".note-card:has(.note-card-title:text-is('Review'))").first.click(); await pg.wait_for_timeout(500)
    await pg.click("[role=switch]"); await pg.evaluate("document.querySelector('.reading').scrollTop=600"); await pg.wait_for_timeout(200)
    await pg.click(".overlay-chrome button:has-text('Templates')"); await pg.click(".overlay-chrome .chip-btn:text-is('Sketch')"); await pg.locator(".overlay-chrome .stamp:has(span:text-is('Sticky · to do'))").click(); await pg.wait_for_timeout(300)
    ink=(await note(pg,"Review"))["ink"]; last=[e for e in ink if e["t"]=="rect"][-1]
    st=await pg.evaluate("document.querySelector('.reading').scrollTop")
    ok("template lands where you are looking", last["y"]>400, f"y={last['y']:.0f} scroll={st}")
    # PDF page: templates on top
    await pg.click(".overlay-chrome [aria-label='Close templates']"); await pg.click("[role=switch]")
    await pg.locator(".note-card:has(.note-card-title:text-is('Physics Notes'))").first.click(); await pg.wait_for_timeout(1000)
    n0=len((await note(pg,"Physics Notes"))["drawing"])
    await pg.click("button:has-text('Templates')"); await pg.click(".chip-btn:text-is('Sketch')"); await pg.locator(".stamp:has(span:text-is('Sticky · remember'))").click(); await pg.wait_for_timeout(200)
    await pg.click(".chip-btn:text-is('Charts')"); await pg.locator(".stamp:has(span:text-is('Pie chart'))").click(); await pg.wait_for_timeout(200)
    ok("PDF page: templates go on top of the pages", len((await note(pg,"Physics Notes"))["drawing"])>n0+5)
    await pg.click("[aria-label='Close templates']"); await pg.wait_for_timeout(200); await pg.screenshot(path=f"{D}/pdf.png")
    # phone (same browser context so stored files are shared)
    m=await ctx.new_page(); await m.set_viewport_size({"width":390,"height":844})
    await m.goto(BASE); await m.wait_for_timeout(900)
    await m.locator(".note-card").filter(has_text="Project Brief").first.click(); await m.wait_for_timeout(600)
    await m.locator("[role=switch]").click(); await m.wait_for_timeout(500); await m.screenshot(path=f"{D}/phone.png")
    ok("phone: Scribble opens full-width with toolbar", await m.locator(".overlay-chrome .dock").count()==1 and await m.locator("[role=radio][aria-checked=true]:text-is('Preview')").count()==1)
    ok("no errors", not errs, ";".join(errs[:3]))
    await b.close()
asyncio.run(main())
