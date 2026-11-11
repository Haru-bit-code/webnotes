import asyncio, json
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

SEED="""localStorage.setItem('webnotes:notes', JSON.stringify([
 {id:'a',title:'Open note',kind:'doc',body:'This is the note I am working on about wave physics and energy transfer.',tags:[],createdAt:1,updatedAt:Date.now()},
 {id:'b',title:'Private diary',kind:'doc',body:'SECRET-DIARY-TEXT should never leave unless allowed',tags:[],createdAt:1,updatedAt:Date.now()-1000}]))"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1400,"height":900}); pg=await ctx.new_page()
    sent=[]
    async def handle(route):
        sent.append(route.request.post_data or ""); await route.abort()
    await ctx.route("https://api.anthropic.com/**", handle)
    await pg.goto(BASE); await pg.wait_for_timeout(1000)
    # someone who had the old defaults saved
    await pg.evaluate(SEED+";localStorage.setItem('webnotes:ai', JSON.stringify({chat:'anthropic',autoReview:true,includeAll:true,providers:{anthropic:{apiKey:'sk-test',model:'claude-x',ctxChars:30000}}}));localStorage.setItem('webnotes:showAI','1')")
    await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.locator(".note-card:has-text('Open note')").click(); await pg.wait_for_timeout(400)
    await pg.click("[aria-label='Assistant settings']"); await pg.wait_for_timeout(200)
    boxes=pg.locator(".ai-opt input")
    ok("auto-review is off (was on under the old default)", not await boxes.nth(0).is_checked())
    ok("reading other notes is off (was on under the old default)", not await boxes.nth(1).is_checked())
    ok("buttons have clear names", await pg.locator("[aria-label='Close assistant']").count()==1)
    await pg.screenshot(path=OUT+"/01-settings.png")
    # typing and pausing sends nothing in the background
    await pg.click("[role=radio]:text-is('Edit')"); await pg.click("textarea.source"); await pg.keyboard.type(" Adding more text to see whether anything is sent automatically."); await pg.wait_for_timeout(4000)
    ok("pausing while typing sends nothing", len(sent)==0, str(len(sent)))
    # asking a question sends only the open note
    await pg.click("button:has-text('Chat')"); await pg.wait_for_timeout(200)
    ok("chat shows what will be sent", "only" in await pg.locator(".ai-scope").inner_text(), await pg.locator(".ai-scope").inner_text())
    await pg.fill("textarea[placeholder^='Ask']", "Summarise"); await pg.click("button:has-text('Send')"); await pg.wait_for_timeout(1500)
    ok("a question sends the open note", sent and "wave physics" in sent[-1])
    ok("…but not other notes", sent and "SECRET-DIARY-TEXT" not in sent[-1])
    # opting in works and is remembered
    if not await pg.locator(".ai-opt").count(): await pg.click("[aria-label='Assistant settings']"); await pg.wait_for_timeout(200)
    await pg.locator(".ai-opt input").nth(1).check(); await pg.wait_for_timeout(300); await pg.reload(); await pg.wait_for_timeout(1200)
    await pg.locator(".note-card:has-text('Open note')").click(); await pg.wait_for_timeout(300)
    if not await pg.locator(".ai-opt").count(): await pg.click("[aria-label='Assistant settings']"); await pg.wait_for_timeout(200)
    ok("choice is remembered after reload", await pg.locator(".ai-opt input").nth(1).is_checked())
    await pg.click("button:has-text('Chat')"); n0=len(sent)
    ok("chat says other notes are included", "other notes" in await pg.locator(".ai-scope").inner_text())
    await pg.fill("textarea[placeholder^='Ask']", "Connect"); await pg.click("button:has-text('Send')"); await pg.wait_for_timeout(1500)
    ok("after opting in, other notes are sent", len(sent)>n0 and "SECRET-DIARY-TEXT" in sent[-1])
    await b.close()
asyncio.run(main())
