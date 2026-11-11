import asyncio
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

PNG=bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
SEED="""localStorage.setItem('webnotes:notes', JSON.stringify([
 {id:'m',title:'Md with web pic',kind:'doc',body:'Hello\\n\\n![pixel](https://tracker.example/p.png)\\n\\n<img src="https://tracker.example/raw.png">\\n\\n<div style="background:url(https://tracker.example/bg.png)">x</div>',tags:[],createdAt:1,updatedAt:Date.now()},
 {id:'r',title:'Doc with web pic',kind:'doc',format:'rich',html:'<p>Rich</p><p><img src="https://tracker.example/rich.png" alt="w"></p>',body:'Rich',tags:[],createdAt:1,updatedAt:Date.now()-5}]))"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1400,"height":900}); pg=await ctx.new_page()
    hits=[]; csp=[]
    async def h(route): hits.append(route.request.url); await route.fulfill(status=200, content_type="image/png", body=PNG)
    await ctx.route("https://tracker.example/**", h)
    pg.on("console", lambda m: csp.append(m.text) if "Content Security Policy" in m.text else None)
    await pg.goto(BASE); await pg.wait_for_timeout(1000); await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.locator(".note-card:has-text('Md with web pic')").click(); await pg.wait_for_timeout(300); await pg.click("[role=radio]:text-is('Preview')"); await pg.wait_for_timeout(800)
    ok("opening a note loads nothing from the web", len(hits)==0, str(hits))
    ok("user is told pictures are hidden", await pg.locator(".remote-bar:has-text('3 pictures')").count()==1, await pg.locator(".remote-bar").all_inner_texts().__str__() if False else "")
    await pg.screenshot(path=OUT+"/01-hidden.png")
    await pg.click(".remote-bar button:has-text('Show pictures')"); await pg.wait_for_timeout(800)
    ok("Show pictures loads them", len(hits)>=2 and await pg.locator(".remote-bar").count()==0, str(len(hits)))
    ok("note text unchanged", "https://tracker.example/p.png" in await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes')).find(n=>n.id==='m').body"))
    hits.clear()
    await pg.locator(".note-card:has-text('Doc with web pic')").click(); await pg.wait_for_timeout(800)
    ok("Document: nothing loaded from the web", len(hits)==0, str(hits))
    ok("Document: user is told", await pg.locator(".remote-bar.top").count()==1)
    await pg.click(".rich-doc"); await pg.keyboard.press("End"); await pg.keyboard.type(" more"); await pg.wait_for_timeout(300)
    html=await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes')).find(n=>n.id==='r').html")
    ok("Document: saving keeps the picture's address", 'src="https://tracker.example/rich.png"' in html and "data-remote" not in html, html)
    await pg.click(".remote-bar.top button"); await pg.wait_for_timeout(600)
    ok("Document: Show pictures loads it", len(hits)==1)
    # always-load setting
    hits.clear(); await pg.click("[aria-label='Settings']"); await pg.click(".modal button[role=radio]:text-is('Always load')"); await pg.click("button:has-text('Done')")
    await pg.reload(); await pg.wait_for_timeout(1000); await pg.locator(".note-card:has-text('Md with web pic')").click(); await pg.wait_for_timeout(300)
    await pg.click("[role=radio]:text-is('Preview')"); await pg.wait_for_timeout(800)
    ok("'Always load' loads them straight away", len(hits)>=2 and await pg.locator(".remote-bar").count()==0)
    ok("no security-policy errors", not csp, str(csp[:2]))
    await b.close()
asyncio.run(main())
