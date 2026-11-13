import asyncio, sys, json
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

D=OUT
async def drawing(pg): return await pg.evaluate("(()=>{const ns=JSON.parse(localStorage.getItem('webnotes:notes'));return ns[0].drawing})()")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1500,"height":950})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(800)
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(1500)
    await pg.screenshot(path=f"{D}/01-library.png")
    n=await pg.locator(".lib-grid .layout-opt").count(); ok("library lists all templates", n==250, str(n))
    # search
    await pg.fill("input[aria-label='Search templates']", "cornell"); await pg.wait_for_timeout(200)
    ok("search filters", 0<await pg.locator(".lib-grid .layout-opt").count()<10)
    await pg.fill("input[aria-label='Search templates']", "")
    cats=await pg.locator(".stamp-cats .chip-btn").all_inner_texts()
    await pg.keyboard.press("Escape"); await pg.mouse.click(5,940)
    # open first template of every category
    bad=[]
    for c in cats[1:]:
      await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
      await pg.click(f".stamp-cats .chip-btn:text-is('{c}')"); await pg.wait_for_timeout(200)
      title=await pg.locator(".lib-grid .layout-opt:has(.lib-thumb) b").first.inner_text()
      await pg.locator(".lib-grid .layout-opt:has(.lib-thumb)").first.click(); await pg.wait_for_timeout(900)
      E=await drawing(pg); texts=[x for x in E if x["t"]=="text"]; locked=[x for x in E if x.get("lock")]
      if len(E)<5 or not texts or not locked: bad.append(f"{c}:{len(E)}")
      await pg.screenshot(path=f"{D}/10-{c.replace(' ','_').replace('&','and')}.png")
    ok(f"a page from each of {len(cats)-1} categories opens with editable text", not bad, ",".join(bad))
    # interact on the last opened page
    await pg.click("[aria-label^='Select']")
    E=await drawing(pg); t=[x for x in E if x["t"]=="text" and len(x["text"])>3][1]
    x,y=await pg.evaluate("(id)=>{const r=document.querySelector(`[data-id='${id}']`).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}", t["id"])
    await pg.mouse.dblclick(x,y); await pg.wait_for_timeout(300); ok("template text opens for editing", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.press("ControlOrMeta+a"); await pg.keyboard.type("Edited heading"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    ok("template text saved", any(x.get("text")=="Edited heading" for x in await drawing(pg)))
    # click on locked background shouldn't select it
    await pg.mouse.click(700, 600); await pg.wait_for_timeout(200)
    ok("background is not selectable", await pg.locator("[data-handle]").count()==0)
    # type on the page
    await pg.keyboard.type("my note"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    # this spot on the doodle page is a picture, not a writing area: no stray text box appears there
    ok("no stray text box on a picture", not any("my note" in (x.get("text") or "") for x in await drawing(pg)) and await pg.locator(".text-edit").count()==0)
    await pg.screenshot(path=f"{D}/12-typed.png")
    # pen on page
    await pg.click("[aria-label^='Pen']"); await pg.mouse.move(600,620); await pg.mouse.down(); await pg.mouse.move(800,660,steps=8); await pg.mouse.up(); await pg.wait_for_timeout(200)
    ok("drawing on template page", any(x["t"]=="pen" for x in await drawing(pg)))
    # eraser doesn't remove background
    nb=len([x for x in await drawing(pg) if x.get("lock")])
    await pg.click("[aria-label='Eraser']"); await pg.mouse.move(400,500); await pg.mouse.down(); await pg.mouse.move(900,700,steps=20); await pg.mouse.up(); await pg.wait_for_timeout(200)
    ok("eraser leaves background alone", nb==len([x for x in await drawing(pg) if x.get("lock")]))
    await pg.evaluate("document.documentElement.classList.add('dark')"); await pg.wait_for_timeout(200); await pg.screenshot(path=f"{D}/20-dark.png")
    await pg.evaluate("document.documentElement.classList.remove('dark')")
    # stickers & visuals
    await pg.click("[aria-label^='Select']"); await pg.click("button:has-text('Templates')"); await pg.wait_for_timeout(300)
    total=0; badS=[]
    await pg.click(".tpl-shelves button:has-text('Stickers')")
    for c in ["Stickers","Visuals"]:
      await pg.click(f".stamp-cats .chip-btn:text-is('{c}')"); await pg.wait_for_timeout(600); await pg.screenshot(path=f"{D}/30-{c}.png")
      k=await pg.locator(".kit-grid .stamp").count()
      for i in range(k):
        before=len(await drawing(pg)); await pg.locator(".kit-grid .stamp").nth(i).click(); await pg.wait_for_timeout(120)
        if len(await drawing(pg))<=before: badS.append(f"{c}#{i}")
        total+=1
    ok(f"all {total} stickers/visuals insert", not badS and total==120, ",".join(badS[:10]))
    await pg.click("[aria-label='Close templates']")
    for _ in range(3): await pg.click("[aria-label='Zoom out']")
    await pg.wait_for_timeout(300); await pg.screenshot(path=f"{D}/31-stickers-on-page.png")
    ok("no errors", not errs, ";".join(errs[:3]))
    await b.close()
asyncio.run(main())
