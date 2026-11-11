import asyncio, os, sys
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

F=FIXTURES
BODY = "# Test\\n\\n$$E=mc^2$$\\n\\n```mermaid\\ngraph TD; A-->B\\n```\\n\\n```chart\\ntype: bar\\nlabels: a, b\\ndata: 1, 2\\n```\\n\\n```plot\\nsin(x)\\n```\\n\\n```python\\nprint(1)\\n```"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1400,"height":900}, accept_downloads=True); pg=await ctx.new_page()
    bad=[]; pg.on("console", lambda m: bad.append(m.text) if ("Content Security Policy" in m.text or "Refused to" in m.text) else None)
    pg.on("pageerror", lambda e: bad.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1000)
    await pg.evaluate("localStorage.setItem('webnotes:notes', JSON.stringify([{id:'x',title:'Rich md',kind:'doc',body:'"+BODY+"',tags:[],createdAt:1,updatedAt:Date.now()}]))"); await pg.reload(); await pg.wait_for_timeout(1000)
    await pg.locator(".note-card").first.click(); await pg.click("[role=radio]:text-is('Preview')"); await pg.wait_for_timeout(3000)
    ok("diagram renders under the security policy", await pg.locator("pre.mermaid svg").count()==1)
    ok("maths renders", await pg.locator(".katex").count()>=1)
    ok("function plot renders (no eval)", await pg.evaluate("[...document.querySelectorAll('.md svg path')].some(p=>(p.getAttribute('d')||'').length>200)"))
    for k in ["Word (.docx)","Web page (.html)"]:
      await pg.click("[aria-label='Download as']")
      async with pg.expect_download() as d: await pg.click(f".menu-item:has(b:text-is('{k}'))")
      await d.value
    await pg.click(".list-head button:has-text('New')")
    async with pg.expect_file_chooser() as fc: await pg.click("text=Import file…")
    await (await fc.value).set_files([os.path.join(F,x) for x in ["Physics_Notes.pdf","Review.pptx","Budget.xlsx"]])
    await pg.click("button:has-text('Import'):not(:has-text('file'))"); await pg.wait_for_function("!document.querySelector('.modal')", timeout=60000)
    await pg.locator(".note-card:has-text('Physics')").first.click(); await pg.wait_for_timeout(2000)
    await pg.click("[aria-label='Download as'], button:has-text('Export')") if await pg.locator("[aria-label='Download as']").count() else None
    await pg.wait_for_timeout(500)
    ok("no blocked resources or script errors", not bad, str(bad[:4]))
    await b.close()
asyncio.run(main())
