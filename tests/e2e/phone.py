import asyncio, sys
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

SEED="""localStorage.setItem('webnotes:notes', JSON.stringify([
 {id:'a',title:'Product feedback',kind:'doc',format:'rich',html:'<h2>What users asked for</h2><p>Many requested the UI to be <b>smoother</b>, like Revolut and Phantom wallet. They also asked for a <span style="color: rgb(142, 78, 198)">glassmorphic</span> look.</p><ul><li>Faster transitions</li><li>Softer surfaces</li><li>Clear hierarchy</li></ul>',body:'What users asked for',tags:['ui','feedback'],folder:'Work',pinned:true,createdAt:Date.now()-5e6,updatedAt:Date.now()-1e5},
 {id:'b',title:'Physics revision',kind:'doc',body:'# Waves\\n\\nA wave carries energy without carrying matter.\\n\\n- [ ] Read chapter 4\\n- [x] Practise questions\\n\\n$$v = f\\\\lambda$$',tags:['study'],folder:'Study',createdAt:Date.now()-9e6,updatedAt:Date.now()-3e6},
 {id:'c',title:'Monthly budget',kind:'doc',format:'sheet',sheets:[{name:'Sheet 1',rows:[['Item','Cost'],['Rent','12000'],['Food','6000'],['Total','=SUM(B2:B3)'],['',''],['','']]}],body:'Item Cost',tags:[],createdAt:Date.now()-2e7,updatedAt:Date.now()-8e6},
 {id:'d',title:'Sketch ideas',kind:'canvas',paper:'dots',drawing:[],body:'',tags:[],createdAt:Date.now()-3e7,updatedAt:Date.now()-2e7}
]))"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(**p.devices["Pixel 7"], color_scheme="dark"); pg=await ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1200); await pg.evaluate(SEED.replace("\\\\n","\\n")); await pg.reload(); await pg.wait_for_timeout(1400)
    await pg.evaluate("""(()=>{const n=JSON.parse(localStorage.getItem('webnotes:notes'));n[3].archived=false;n.push({id:'z',title:'Old archived',kind:'doc',body:'x',archived:true,tags:[],createdAt:1,updatedAt:1});localStorage.setItem('webnotes:notes',JSON.stringify(n))})()"""); await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.screenshot(path=OUT+"/01-list.png")
    await pg.tap("[aria-label^='Open menu']"); await pg.wait_for_timeout(500)
    ok("menu opens with all sections", all([await pg.locator(f".sidebar.drawer .nav-item:has-text('{x}')").count()>0 for x in ["Scribbles","Archive","Trash","Study","feedback"]]))
    await pg.screenshot(path=OUT+"/02-drawer.png")
    await pg.tap(".sidebar.drawer .nav-item:has-text('Archive')"); await pg.wait_for_timeout(400)
    ok("Archive reachable on phone", await pg.locator(".note-card:has-text('Old archived')").count()==1 and await pg.locator(".sidebar.drawer").count()==0)
    await pg.tap("[aria-label^='Open menu']"); await pg.wait_for_timeout(300); await pg.tap(".sidebar.drawer .nav-item:has-text('Study')"); await pg.wait_for_timeout(300)
    ok("folders reachable on phone", await pg.locator(".list-title").inner_text()!="" and await pg.locator(".note-card:has-text('Physics')").count()==1)
    await pg.tap("[aria-label^='Open menu']"); await pg.wait_for_timeout(300); await pg.tap(".drawer-scrim", position={"x":370,"y":400}); await pg.wait_for_timeout(300)
    ok("tapping outside closes the menu", await pg.locator(".sidebar.drawer").count()==0)
    await pg.tap("[aria-label^='Open menu']"); await pg.wait_for_timeout(300); await pg.tap(".sidebar.drawer .nav-item:has-text('All notes')"); await pg.wait_for_timeout(300)
    # every editor on a phone
    for t,f in [("Product feedback","03-doc"),("Physics revision","04-md"),("Monthly budget","05-sheet"),("Sketch ideas","06-canvas")]:
      await pg.tap(f".note-card:has-text('{t}')"); await pg.wait_for_timeout(900); await pg.screenshot(path=f"{OUT}/{f}.png")
      w=await pg.evaluate("document.documentElement.scrollWidth"); ok(f"{t}: no sideways scrolling of the page", w<=pg.viewport_size["width"]+1, str(w))
      await pg.tap("[aria-label='Back to list']"); await pg.wait_for_timeout(400)
    # phone toolbars
    await pg.tap(".note-card:has-text('Product feedback')"); await pg.wait_for_timeout(800)
    tb=await pg.evaluate("(()=>{const t=document.querySelector('.toolbar');return [t.scrollHeight, t.scrollWidth, t.clientWidth]})()")
    ok("note bar is one row", tb[0] < 70, str(tb))
    rb=await pg.evaluate("document.querySelector('.rich-bar').getBoundingClientRect().height"); ok("formatting bar is one row", rb < 60, str(rb))
    await pg.tap("[aria-label='More actions']"); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT+"/07-more.png")
    await pg.tap(".menu-item:has-text('Pin to top'), .menu-item:has-text('Unpin')"); await pg.wait_for_timeout(200)
    ok("More menu works", await pg.locator(".menu").count()==0)
    await pg.locator(".rich-bar").evaluate("e=>e.scrollLeft=0"); await pg.tap("[aria-label='More text colours']"); await pg.wait_for_timeout(300)
    box=await pg.locator(".color-pop").bounding_box(); ok("colour palette fully on screen", box and box["y"]+box["height"]<=pg.viewport_size["height"] and box["x"]>=0, str(box))
    await pg.screenshot(path=OUT+"/08-palette.png"); await pg.keyboard.press("Escape")
    await pg.tap("[aria-label='Back to list']"); await pg.wait_for_timeout(300)
    await pg.tap(".note-card:has-text('Physics revision')"); await pg.wait_for_timeout(600)
    ok("no Split on phone", not await pg.locator("[data-mode=split]").is_visible())
    tb=await pg.evaluate("document.querySelector('.toolbar').scrollHeight"); ok("markdown bar one row", tb<70, str(tb))
    await pg.tap("[aria-label='Back to list']"); await pg.wait_for_timeout(300)
    await pg.tap(".note-card:has-text('Sketch ideas')"); await pg.wait_for_timeout(800)
    pen=await pg.locator("[aria-label^='Pen']").bounding_box(); ok("drawing tools visible first", pen and pen["x"]+pen["width"]<=pg.viewport_size["width"], str(pen))
    await pg.screenshot(path=OUT+"/09-canvas.png")
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()
asyncio.run(main())
