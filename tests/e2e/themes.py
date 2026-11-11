import asyncio
from playwright.async_api import async_playwright
from _common import BASE, OUT, ok  # noqa: E402

async def var(pg, name): return (await pg.evaluate(f"getComputedStyle(document.documentElement).getPropertyValue('{name}')")).strip().lower()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1400,"height":900}, color_scheme="dark")
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1000)
    await pg.click("[aria-label='Settings']"); await pg.wait_for_timeout(300)
    ok("six colour themes offered", await pg.locator(".theme-opt").count()==6)
    await pg.click(".theme-opt:has-text('Sunset')"); await pg.wait_for_timeout(300)
    ok("theme changes the accent and the glow", await var(pg,"--accent")=="#ea580c" and await var(pg,"--accent-2")=="#f43f5e")
    await pg.screenshot(path=f"{OUT}/theme-sunset.png")
    await pg.evaluate("(()=>{const i=document.querySelector('.swatch-custom input');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'#fde047');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()"); await pg.wait_for_timeout(300)
    ok("pale custom accent gets dark button text", await var(pg,"--accent")=="#fde047" and await var(pg,"--on-accent")=="#111827", await var(pg,"--on-accent"))
    col=await pg.evaluate("getComputedStyle(document.querySelector('.modal-foot .btn-primary')).color")
    ok("Done button text is dark on the pale accent", col=="rgb(17, 24, 39)", col)
    await pg.click("button:has-text('Reset to default')"); await pg.wait_for_timeout(300)
    ok("reset brings back the default", await var(pg,"--accent")=="#6366f1" and await var(pg,"--on-accent")=="#ffffff")
    await pg.click("button:has-text('Done')"); await pg.reload(); await pg.wait_for_timeout(800)
    ok("choice is remembered", await var(pg,"--accent")=="#6366f1")
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()
asyncio.run(main())
