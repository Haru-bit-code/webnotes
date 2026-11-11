import asyncio
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

async def notes(pg): return await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes')||'[]')")
async def new_md(pg, title, body):
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has(b:text-matches('^Markdown'))"); await pg.wait_for_timeout(300)
    await pg.fill("input[aria-label='Note title']", title); await pg.click("[role=radio]:text-is('Edit')"); await pg.fill("textarea.source", body); await pg.wait_for_timeout(200)
async def open_note(pg, title): await pg.locator(f".note-card:has(.note-card-title:text-is('{title}'))").first.click(); await pg.wait_for_timeout(300)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1400,"height":900})
    A=await ctx.new_page(); await A.goto(BASE); await A.wait_for_timeout(900)
    B=await ctx.new_page(); await B.goto(BASE); await B.wait_for_timeout(900)
    errs=[]; [pg.on("pageerror", lambda e: errs.append(str(e))) for pg in (A,B)]
    await new_md(A,"From tab A","written in A"); await new_md(B,"From tab B","written in B"); await A.wait_for_timeout(300)
    T={n["title"] for n in await notes(A)}
    ok("notes made in two tabs are both saved", {"From tab A","From tab B"} <= T, str(T))
    ok("tab A shows tab B's note without reload", await A.locator(".note-card-title:text-is('From tab B')").count()==1)
    # each tab edits a different note
    await open_note(A,"From tab A"); await A.click("[role=radio]:text-is('Edit')"); await A.fill("textarea.source","A edited its own note")
    await open_note(B,"From tab B"); await B.click("[role=radio]:text-is('Edit')"); await B.fill("textarea.source","B edited its own note"); await B.wait_for_timeout(300)
    N={n["title"]:n for n in await notes(A)}
    ok("edits in both tabs survive", N["From tab A"]["body"]=="A edited its own note" and N["From tab B"]["body"]=="B edited its own note", str({k:v['body'] for k,v in N.items()}))
    # the old bug: B keeps typing in its note after A changed A's note -> A's change must survive
    await A.fill("textarea.source","A changed again"); await A.wait_for_timeout(50)
    await B.fill("textarea.source","B typing more"); await B.wait_for_timeout(300)
    N={n["title"]:n for n in await notes(B)}
    ok("typing in one tab no longer erases the other tab's work", N["From tab A"]["body"]=="A changed again" and N["From tab B"]["body"]=="B typing more")
    # both edit the same note at the same time -> conflict copy keeps both
    await open_note(B,"From tab A"); await B.click("[role=radio]:text-is('Edit')")
    await B.evaluate("window.dispatchEvent(new Event('noop'))")
    # simulate a real simultaneous edit: B edits without having seen A's latest save
    await A.evaluate("localStorage.setItem('webnotes:rev','x')")  # nothing
    await B.context.add_init_script("")  # nothing
    # write directly as if A saved while B was offline-ish: change storage without event to B
    await A.evaluate("""()=>{const n=JSON.parse(localStorage.getItem('webnotes:notes'));const a=n.find(x=>x.title==='From tab A');a.body='A wins this one';a.updatedAt=Date.now();localStorage.setItem('webnotes:notes',JSON.stringify(n));localStorage.setItem('webnotes:rev','other')}""")
    await B.fill("textarea.source","B also edited the same note"); await B.wait_for_timeout(400)
    L=await notes(B); bodies=[n["body"] for n in L if n["title"].startswith("From tab A")]
    ok("same note changed in two places: both versions kept", "A wins this one" in bodies and "B also edited the same note" in bodies, str(bodies))
    ok("conflict copy is labelled", any(n["title"]=="From tab A (conflict copy)" for n in L))
    await B.wait_for_timeout(200); ok("notice tells the user", await B.locator(".notice:has-text('conflict copy')").count()==1)
    await B.screenshot(path=OUT+"/conflict.png")
    # deleting for good in one tab is not undone by the other
    await A.reload(); await A.wait_for_timeout(700)
    await open_note(A,"From tab B"); await A.click("[aria-label='Move to trash'], [title^='Move to trash'], [aria-label='Delete']"); await A.wait_for_timeout(300)
    await A.click(".nav-item:has-text('Trash')"); await A.wait_for_timeout(200)
    A.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await A.click("button:has-text('Empty trash')"); await A.wait_for_timeout(400)
    await open_note(B,"From tab A (conflict copy)"); await B.click("[role=radio]:text-is('Edit')"); await B.fill("textarea.source","still editing in B"); await B.wait_for_timeout(400)
    L=await notes(A)
    ok("note deleted for good stays deleted", not any(n["title"]=="From tab B" for n in L), str([n["title"] for n in L]))
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()
asyncio.run(main())
