import asyncio, os
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402

async def notes(pg): await pg.wait_for_timeout(150); return await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes')||'[]')")
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1400,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(BASE); await pg.wait_for_timeout(1000)
    ok("folders section invites you to make one", await pg.locator(".nav-hint").count()==1)
    await pg.click("[aria-label='New folder']"); await pg.fill("input[aria-label='Folder name']", "Physics"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
    ok("new empty folder appears and opens", await pg.locator(".folder-row:has-text('Physics')").count()==1 and (await pg.locator(".list-title").inner_text())=="Physics")
    ok("empty folder explains what to do", "This folder is empty" in await pg.locator(".empty-list").inner_text())
    await pg.reload(); await pg.wait_for_timeout(800)
    ok("empty folder survives reload", await pg.locator(".folder-row:has-text('Physics')").count()==1)
    await pg.locator(".folder-row:has-text('Physics') .nav-item").click(); await pg.wait_for_timeout(200)
    # everything made inside the folder goes into it
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has(b:text-matches('^Markdown'))"); await pg.wait_for_timeout(300)
    await pg.fill("input[aria-label='Note title']", "Waves"); await pg.wait_for_timeout(100)
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has(b:text-matches('^Spreadsheet'))"); await pg.wait_for_timeout(300)
    await pg.fill("input[aria-label='Note title']", "Lab data"); await pg.wait_for_timeout(100)
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(400)
    await pg.click("[role=tab]:has-text('Blank')"); await pg.locator(".modal button:has-text('Dot grid'), .modal .paper-opt").first.click(); await pg.wait_for_timeout(500)
    await pg.click(".list-head button:has-text('New')")
    async with pg.expect_file_chooser() as fc: await pg.click("text=Import file…")
    await (await fc.value).set_files(os.path.join(FIXTURES,"todo.md")); await pg.click("button:has-text('Import'):not(:has-text('file'))"); await pg.wait_for_timeout(800)
    N=await notes(pg)
    ok("note, spreadsheet, scribble and import made in the folder all land in it", len(N)==4 and all(n.get("folder")=="Physics" for n in N), str([(n["title"],n.get("folder")) for n in N]))
    ok("importing keeps you in the folder", (await pg.locator(".list-title").inner_text())=="Physics")
    # expand shows its notes underneath
    await pg.click("[aria-label='Show notes in Physics']"); await pg.wait_for_timeout(300)
    ok("folder expands to show its notes", await pg.locator(".folder-notes li").count()==4)
    await pg.screenshot(path=f"{OUT}/folders-expanded.png")
    await pg.locator(".folder-notes button:has-text('Waves')").click(); await pg.wait_for_timeout(300)
    ok("clicking a note in the folder opens it", await pg.input_value("input[aria-label='Note title']")=="Waves")
    # drag a note from All notes into another folder
    await pg.click("[aria-label='New folder']"); await pg.fill("input[aria-label='Folder name']", "Archive 2025"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
    await pg.locator(".nav-item:has-text('All notes')").click(); await pg.wait_for_timeout(300)
    await pg.locator(".note-card:has-text('Waves')").drag_to(pg.locator(".folder-row:has-text('Archive 2025')")); await pg.wait_for_timeout(300)
    ok("dragging a note onto a folder moves it", [n for n in await notes(pg) if n["title"]=="Waves"][0].get("folder")=="Archive 2025")
    # rename moves every note with it
    await pg.locator(".folder-row:has-text('Physics')").hover(); await pg.click("[aria-label='Folder options for Physics']"); await pg.click(".menu-item:has-text('Rename')")
    await pg.fill("input[aria-label='Folder name']", "Physics 101"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
    N=await notes(pg)
    ok("rename keeps the notes inside", sum(n.get("folder")=="Physics 101" for n in N)==3 and not any(n.get("folder")=="Physics" for n in N))
    # delete folder keeps the notes
    await pg.locator(".folder-row:has-text('Physics 101')").hover(); await pg.click("[aria-label='Folder options for Physics 101']"); await pg.click(".menu-item:has-text('Delete folder')"); await pg.wait_for_timeout(300)
    N=await notes(pg)
    ok("deleting a folder keeps its notes", len(N)==4 and await pg.locator(".folder-row:has-text('Physics 101')").count()==0)
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()
asyncio.run(main())
