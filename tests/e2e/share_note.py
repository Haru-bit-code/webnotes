import asyncio, os
from playwright.async_api import async_playwright
from _common import BASE, OUT, ok  # noqa: E402

SEED = """localStorage.setItem('webnotes:notes', JSON.stringify([
 {id:'d',title:'Trip plan',kind:'doc',format:'rich',html:'<h2>Day 1</h2><p>Munnar</p>',body:'Day 1 Munnar',tags:[],createdAt:1,updatedAt:5},
 {id:'s',title:'Budget',kind:'doc',format:'sheet',sheets:[{name:'S',rows:[['a','1'],['b','=B1*2']]}],body:'',tags:[],createdAt:1,updatedAt:4},
 {id:'c',title:'Sketch',kind:'canvas',paper:'dots',drawing:[],body:'',tags:[],createdAt:1,updatedAt:3}]))"""

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(); errs = []
    ctx = await b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True); pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(900); await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(900)
    for t in ["Trip plan", "Budget", "Sketch"]:
      await pg.locator(f".note-card:has-text('{t}')").click(); await pg.wait_for_timeout(300)
      ok(f"{t}: Share button is on the note's top bar", await pg.locator("[aria-label='Share this note']").is_visible())
    await pg.locator(".note-card:has-text('Trip plan')").click(); await pg.click("[aria-label='Share this note']"); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f"{OUT}/share-menu.png")
    ok("Share offers QR and file", await pg.locator(".menu-item:has-text('Send with a QR code')").count() == 1 and await pg.locator(".menu-item:has-text('Share as a file')").count() == 1)
    async with pg.expect_download() as d: await pg.click(".menu-item:has-text('Share as a file')")
    ok("on a computer, Share as a file gives a Word file", (await d.value).suggested_filename == "Trip_plan.docx")
    await pg.locator(".note-card:has-text('Budget')").click(); await pg.click("[aria-label='Share this note']")
    async with pg.expect_download() as d: await pg.click(".menu-item:has-text('Share as a file')")
    ok("a spreadsheet is shared as Excel", (await d.value).suggested_filename == "Budget.xlsx")
    await pg.locator(".note-card:has-text('Trip plan')").click(); await pg.click("[aria-label='Share this note']"); await pg.click(".menu-item:has-text('Send with a QR code')"); await pg.wait_for_timeout(300)
    ok("Send with a QR code picks just this note", await pg.locator(".modal label:has-text('This note') input").is_checked())
    await ctx.close()
    # a phone: the share sheet is used (navigator.share) and the button sits in the top bar
    ctx = await b.new_context(**p.devices["Pixel 7"]); pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
    await ctx.add_init_script("window.__shared=null; navigator.canShare=()=>true; navigator.share=async(d)=>{window.__shared={title:d.title,name:d.files[0].name,size:d.files[0].size}};")
    await pg.goto(BASE); await pg.wait_for_timeout(900); await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(900)
    await pg.tap(".note-card:has-text('Trip plan')"); await pg.wait_for_timeout(500)
    box = await pg.locator("[aria-label='Share this note']").bounding_box()
    ok("phone: Share is visible in the top bar", box is not None and box["x"] + box["width"] <= 412)
    await pg.tap("[aria-label='Share this note']"); await pg.tap(".menu-item:has-text('Share as a file')"); await pg.wait_for_timeout(1500)
    shared = await pg.evaluate("window.__shared")
    ok("phone: Share as a file opens the share sheet with the Word file", bool(shared) and shared["name"] == "Trip_plan.docx" and shared["size"] > 1000, str(shared))
    await pg.screenshot(path=f"{OUT}/share-phone.png")
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()
asyncio.run(main())
