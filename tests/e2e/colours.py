import asyncio, json
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

async def cur(pg): await pg.wait_for_timeout(120); return (await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes'))"))[0]
async def select_word(pg, word):
    await pg.evaluate("""w=>{const d=document.querySelector('.rich-doc');const it=document.createTreeWalker(d,NodeFilter.SHOW_TEXT);let n;while(n=it.nextNode()){const i=n.data.indexOf(w);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+w.length);const s=getSelection();s.removeAllRanges();s.addRange(r);return}}}""", word)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1400,"height":900}, color_scheme="dark", device_scale_factor=2); pg=await ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    # an old note whose text was pasted with near-black colour (the bug in the screenshot)
    await pg.goto(BASE); await pg.wait_for_timeout(500)
    await pg.evaluate("""localStorage.setItem('webnotes:notes', JSON.stringify([{id:'old1',title:'Old pasted',kind:'doc',format:'rich',html:'<p><span style="color: rgb(24, 32, 46); background-color: rgb(255, 255, 255);">many request the ui to be more smooth</span> and <span style="color: rgb(229, 72, 77);">red stays</span></p>',body:'many request the ui to be more smooth and red stays',tags:[],createdAt:Date.now(),updatedAt:Date.now()}]))""")
    await pg.reload(); await pg.wait_for_timeout(700)
    await pg.locator(".note-card").first.click(); await pg.wait_for_timeout(500)
    col=await pg.evaluate("getComputedStyle(document.querySelector('.rich-doc span')).color")
    ok("old pasted text is readable in dark mode", col=="rgb(236, 238, 245)", col)
    ok("real colours are kept", "229, 72, 77" in await pg.inner_html(".rich-doc"))
    # paste dark text from another page
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has(b:text-matches('^Document'))"); await pg.wait_for_timeout(400)
    await pg.click(".rich-doc")
    await pg.evaluate("""()=>{const dt=new DataTransfer();dt.setData('text/html','<p style="color:#111;background:#fff"><span style="color: black">Pasted from a website</span></p>');dt.setData('text/plain','Pasted from a website');document.querySelector('.rich-doc').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}""")
    await pg.wait_for_timeout(200); await pg.keyboard.press("End"); await pg.keyboard.press("Enter"); await pg.keyboard.type("Make this word blue and that one highlighted.")
    h=(await cur(pg))["html"]; ok("pasted black text follows the theme", "Pasted from a website" in h and "color" not in h.split("Make")[0], h[:160])
    # colour a word
    await select_word(pg,"blue"); await pg.click("[aria-label='More text colours']"); await pg.wait_for_timeout(150)
    ok("palette opens", await pg.locator(".color-pop .swatch").count()==9)
    await pg.screenshot(path=OUT+"/01-palette.png", clip={"x":560,"y":160,"width":840,"height":420})
    await pg.click(".color-pop [aria-label='Blue']"); await pg.wait_for_timeout(150)
    h=(await cur(pg))["html"]; ok("word coloured blue", "rgb(62, 123, 250)" in h or "#3e7bfa" in h.lower(), h[-200:])
    ok("palette closes after picking", await pg.locator(".color-pop").count()==0)
    # main button repeats last colour
    await select_word(pg,"Make"); await pg.click("[aria-label='Text colour']"); await pg.wait_for_timeout(100)
    h=(await cur(pg))["html"]; ok("A button applies the last colour", h.count("62, 123, 250")>=2 or h.lower().count("3e7bfa")>=2)
    # back to default
    await select_word(pg,"Make"); await pg.click("[aria-label='More text colours']"); await pg.click(".color-pop .color-default"); await pg.wait_for_timeout(100)
    col=await pg.evaluate("""(()=>{const it=document.createTreeWalker(document.querySelector('.rich-doc'),NodeFilter.SHOW_TEXT);let n;while(n=it.nextNode()){if(n.data.includes('Make'))return getComputedStyle(n.parentElement).color}})()""")
    ok("Default colour resets it", col=="rgb(236, 238, 245)", col)
    # highlight
    await select_word(pg,"highlighted"); await pg.click("[aria-label='More highlight colours']"); await pg.click(".color-pop [aria-label='Green highlight']"); await pg.wait_for_timeout(100)
    h=(await cur(pg))["html"]; ok("green highlight applied", "48, 164, 108" in h, h[-220:])
    await select_word(pg,"word"); await pg.click("[aria-label='Highlight']"); await pg.wait_for_timeout(100)
    h=(await cur(pg))["html"]; ok("highlight button repeats last highlight", h.count("48, 164, 108")>=2)
    await pg.mouse.click(900,700); await pg.wait_for_timeout(100)
    await pg.screenshot(path=OUT+"/02-dark.png", clip={"x":560,"y":160,"width":840,"height":300})
    # survives reload, light mode looks right
    await pg.emulate_media(color_scheme="light"); await pg.reload(); await pg.wait_for_timeout(700)
    await pg.locator(".note-card").first.click(); await pg.wait_for_timeout(500)
    ok("colours saved after reload", "62, 123, 250" in await pg.inner_html(".rich-doc"))
    await pg.screenshot(path=OUT+"/03-light.png", clip={"x":560,"y":160,"width":840,"height":300})
    # Word export keeps colour?
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()
asyncio.run(main())
