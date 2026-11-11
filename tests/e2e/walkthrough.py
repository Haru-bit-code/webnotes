import asyncio, sys, json
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

D=OUT; R=[]
def ok(name, cond, extra=""): R.append(("PASS" if cond else "FAIL", name, extra)); print(("PASS" if cond else "FAIL"), name, extra, flush=True)
async def els(pg): return await pg.evaluate("(()=>{const n=JSON.parse(localStorage.getItem('webnotes:notes')).find(n=>n.kind==='canvas'); return n? n.drawing:[]})()")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    ctx=await b.new_context(viewport={"width":1500,"height":950}, permissions=["clipboard-read","clipboard-write"])
    pg=await ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1000)
    # --- 1. layout page
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(400)
    await pg.click("[role=tab]:has-text('Hand-drawn')"); await pg.click(".layout-opt:has-text('Meeting notes')"); await pg.wait_for_timeout(800)
    await pg.click("[aria-label='Toggle sidebar']"); await pg.click("[aria-label='Toggle note list']"); await pg.wait_for_timeout(300)
    E=await els(pg); ok("layout creates page", len(E)>30, f"{len(E)} items")
    await pg.click("[aria-label^='Select']")
    async def screen_of(pred):
      E=await els(pg); e=[x for x in E if pred(x)][0]
      return e, await pg.evaluate("(id)=>{const r=document.querySelector(`[data-id='${id}']`).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height]}", e["id"])
    # --- 2. edit existing template text by double-click
    e,(x,y,w,h)=await screen_of(lambda x: x["t"]=="text" and x.get("text")=="Meeting")
    await pg.mouse.dblclick(x,y); await pg.wait_for_timeout(300)
    vis=await pg.locator(".text-edit").count(); ok("double-click title opens editor", vis==1)
    await pg.keyboard.press("ControlOrMeta+a"); await pg.keyboard.type("Team sync"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
    E=await els(pg); ok("title text edited", any(x.get("text")=="Team sync" for x in E))
    # --- 3. type into empty table cell (Owner column of first action row)
    e,(x,y,w,h)=await screen_of(lambda x: x["t"]=="text" and x.get("text")=="Owner")
    await pg.mouse.dblclick(x, y+40); await pg.wait_for_timeout(300)
    ok("double-click empty cell opens editor", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.type("Ansar"); await pg.mouse.click(1100, 860); await pg.wait_for_timeout(300)
    E=await els(pg); t=[x for x in E if x.get("text")=="Ansar"]
    ok("cell text added", len(t)==1); ok("cell text joins the table group", bool(t and t[0].get("g") and t[0]["g"]==e.get("g")))
    await pg.screenshot(path=f"{D}/01-meeting-edited.png")
    # --- 4. click on page then just type
    await pg.mouse.click(1300, 860); await pg.keyboard.type("Typed with keyboard"); await pg.wait_for_timeout(200)
    ok("typing on page opens editor", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.press("Enter"); await pg.keyboard.type("second line"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
    E=await els(pg); ok("typed text saved (2 lines)", any(x.get("text")=="Typed with keyboard\nsecond line" for x in E))
    # --- 5. selected text: Enter edits, typing appends
    await pg.keyboard.press("Enter"); await pg.wait_for_timeout(200); ok("Enter edits selected text", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.type("!"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    E=await els(pg); ok("appended text saved", any(x.get("text")=="Typed with keyboard\nsecond line!" for x in E))
    # --- 6. sticky: click to select, click again to edit
    e,(x,y,w,h)=await screen_of(lambda x: x["t"]=="text" and x.get("text")=="Attendees")
    await pg.mouse.click(1100, 860); await pg.mouse.click(x,y); await pg.wait_for_timeout(250); await pg.mouse.click(x,y); await pg.wait_for_timeout(300)
    ok("click selected text again edits it", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.press("ControlOrMeta+a"); await pg.keyboard.type("People"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    E=await els(pg); ok("sticky heading edited", any(x.get("text")=="People" for x in E))
    # --- 7. text tool click on page + in a box
    await pg.click("[aria-label='Text']"); await pg.mouse.click(1200, 820); await pg.wait_for_timeout(250)
    await pg.keyboard.type("Text tool works"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    E=await els(pg); ok("text tool adds text", any(x.get("text")=="Text tool works" for x in E))
    # --- 8. A+ / bold
    n0=[x for x in E if x.get("text")=="Text tool works"][0]
    await pg.click("[aria-label^='Select']"); await pg.click("[aria-label='Bigger text']"); await pg.click("[aria-label='Bold']"); await pg.wait_for_timeout(200)
    E=await els(pg); n1=[x for x in E if x.get("text")=="Text tool works"][0]
    ok("A+ makes text bigger", n1["fs"]>n0["fs"], f'{n0["fs"]}->{n1["fs"]}'); ok("Bold works", n1.get("bold")==True)
    # --- 9. copy/paste, duplicate, nudge, delete, undo/redo
    c0=len(E); await pg.keyboard.press("ControlOrMeta+c"); await pg.keyboard.press("ControlOrMeta+v"); await pg.wait_for_timeout(200)
    E=await els(pg); ok("copy + paste", len(E)==c0+1)
    await pg.keyboard.press("ControlOrMeta+d"); await pg.wait_for_timeout(200); E=await els(pg); ok("duplicate (Ctrl+D)", len(E)==c0+2)
    before=[x for x in E if x["id"] in await pg.evaluate("1")] if False else None
    sel_y=(await els(pg))[-1]["y"]; await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Shift+ArrowDown"); await pg.wait_for_timeout(150)
    ok("arrow keys nudge", abs((await els(pg))[-1]["y"]-sel_y-11)<0.01)
    await pg.keyboard.press("Delete"); await pg.wait_for_timeout(150); ok("Delete removes", len(await els(pg))==c0+1)
    await pg.keyboard.press("ControlOrMeta+z"); await pg.wait_for_timeout(150); ok("Undo", len(await els(pg))==c0+2)
    await pg.keyboard.press("ControlOrMeta+Shift+z"); await pg.wait_for_timeout(150); ok("Redo", len(await els(pg))==c0+1)
    # --- 10. paste plain text from outside
    await pg.evaluate("navigator.clipboard.writeText('Pasted from another app')")
    await pg.mouse.click(1250, 760); await pg.keyboard.press("ControlOrMeta+v"); await pg.wait_for_timeout(250)
    ok("paste outside text", any(x.get("text")=="Pasted from another app" for x in await els(pg)))
    # --- 11. resize a group by its handle
    e,(x,y,w,h)=await screen_of(lambda x: x["t"]=="text" and x.get("text")=="People" and x.get("g"))
    await pg.mouse.click(1100,860); await pg.mouse.click(x,y); await pg.wait_for_timeout(200)
    hb=await pg.locator("[data-handle]").bounding_box(); ok("resize handle shows", hb is not None)
    g=e["g"]; E=await els(pg); w0=max(xx.get("x2",xx["x"]) for xx in E if xx.get("g")==g)
    await pg.mouse.move(hb["x"]+5,hb["y"]+5); await pg.mouse.down(); await pg.mouse.move(hb["x"]+80,hb["y"]+80,steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
    E=await els(pg); w1=max(xx.get("x2",xx["x"]) for xx in E if xx.get("g")==g); ok("resize makes it bigger", w1>w0+40, f"{w0:.0f}->{w1:.0f}")
    # --- 12. marquee + group + sketch restyle
    await pg.keyboard.press("ControlOrMeta+a"); await pg.wait_for_timeout(150)
    ok("Ctrl+A selects all", await pg.locator("[data-handle]").count()==1)
    await pg.keyboard.press("Escape")
    await pg.screenshot(path=f"{D}/02-after-edits.png")
    # --- 13. every template in every category
    await pg.click("button:has-text('Templates')"); await pg.wait_for_timeout(300)
    cats=await pg.locator(".stamp-cats .chip-btn").all_inner_texts()
    total=0; bad=[]
    for c in cats:
      await pg.click(f".stamp-cats .chip-btn:text-is('{c}')"); await pg.wait_for_timeout(150)
      await pg.screenshot(path=f"{D}/10-cat-{c.replace(' ','_').replace('&','and')}.png")
      names=await pg.locator(".stamp-grid .stamp span").all_inner_texts()
      for nm in names:
        before=len(await els(pg))
        await pg.locator(f".stamp-grid .stamp:has(span:text-is('{nm}'))").first.click(); await pg.wait_for_timeout(80)
        after=len(await els(pg)); total+=1
        if after<=before: bad.append(f"{c}/{nm}")
    ok(f"all {total} templates insert", not bad, ",".join(bad))
    await pg.click("[aria-label='Close templates']")
    for _ in range(4): await pg.click("[aria-label='Zoom out']")
    await pg.wait_for_timeout(300); await pg.screenshot(path=f"{D}/03-all-templates.png")
    # --- 14. every layout opens
    await pg.click("[aria-label='Toggle note list']")
    names=None; lbad=[]
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300); await pg.click("[role=tab]:has-text('Hand-drawn')")
    names=await pg.locator(".layout-opt b").all_inner_texts(); await pg.keyboard.press("Escape"); await pg.mouse.click(5,940)
    for nm in names:
      await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(250); await pg.click("[role=tab]:has-text('Hand-drawn')")
      await pg.locator(f".layout-opt:has(b:text-is('{nm}'))").click(); await pg.wait_for_timeout(500)
      title=await pg.input_value("input[aria-label='Note title']") if await pg.locator("input[aria-label='Note title']").count() else ""
      for _ in range(2): await pg.click("[aria-label='Zoom out']")
      await pg.wait_for_timeout(250); await pg.screenshot(path=f"{D}/20-layout-{nm.split()[0]}.png")
      if title!=nm: lbad.append(f"{nm}:{title}")
    ok(f"all {len(names)} layouts open with their name", not lbad, ",".join(lbad))
    ok("no page errors", not errs, "; ".join(errs[:3]))
    await b.close()
asyncio.run(main())
