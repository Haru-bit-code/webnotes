"""Write straight into templates: tap a cell, box, line or blank and type. No text tool, no double-click.

Covers tables and checklists dropped in with the Templates button, a planner page from the template library,
the Select tool, Tab to the next cell, tick boxes, fill-in blanks, phones (touch) and Scribble on a document.
"""
import asyncio
from playwright.async_api import async_playwright
from _common import BASE, OUT, ok  # noqa: E402

NOTE = "(()=>{const ns=JSON.parse(localStorage.getItem('webnotes:notes')||'[]');return ns.sort((a,b)=>b.updatedAt-a.updatedAt)[0]})()"
async def els(pg, key="drawing"):
    await pg.wait_for_timeout(150); n = await pg.evaluate(NOTE); return (n or {}).get(key) or []
# screen position of a point on the page (world units)
async def scr(pg, x, y):
    return await pg.evaluate("""([x,y])=>{const svg=document.querySelector('.canvas-overlay svg, svg.touch-none');const g=svg.querySelector(':scope > g[transform]');
      const m=g.getAttribute('transform').match(/translate\\(([-\\d.e]+) ([-\\d.e]+)\\) scale\\(([-\\d.e]+)\\)/);const r=svg.getBoundingClientRect();
      return [r.left+ +m[1]+x*+m[3], r.top+ +m[2]+y*+m[3]]}""", [x, y])
async def tap(pg, x, y, phone=False):
    sx, sy = await scr(pg, x, y)
    vh = pg.viewport_size["height"]
    if not phone and not (120 < sy < vh - 60):   # scroll the page so the spot is on screen
        await pg.mouse.move(pg.viewport_size["width"] / 2, vh / 2); await pg.mouse.wheel(0, sy - vh / 2); await pg.wait_for_timeout(200)
        sx, sy = await scr(pg, x, y)
    if phone: await pg.touchscreen.tap(sx, sy)
    else: await pg.mouse.click(sx, sy)
    await pg.wait_for_timeout(250)
async def typing(pg): return await pg.locator(".text-edit").count() == 1
async def blank_page(pg):
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
    await pg.click("[role=tab]:has-text('Blank')"); await pg.locator(".modal .paper-opt").first.click(); await pg.wait_for_timeout(700)
async def drop(pg, cat, name):
    await pg.locator(".dock button:has-text('Templates')").click(); await pg.wait_for_timeout(200)
    await pg.locator(".tpl-shelves button:has-text('Blocks')").click()
    await pg.locator(f".stamp-cats .chip-btn:text-is('{cat}')").click()
    await pg.locator(f".stamp:has(span:text-is('{name}'))").click(); await pg.wait_for_timeout(400)
    if await pg.locator("[aria-label='Close templates']").count(): await pg.click("[aria-label='Close templates']")
def box(E):
    xs = [v for e in E for v in (e["x"], e.get("x2", e["x"]))]; ys = [v for e in E for v in (e["y"], e.get("y2", e["y"]))]
    return min(xs), min(ys)
def written(E): return [e for e in E if e["t"] == "text" and e.get("wr")]

async def desktop(p):
    b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1400, "height": 950}); pg = await ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(800)

    # 1. a table from the Templates button: one tap in a cell, type, Tab to the next cell
    await blank_page(pg); await drop(pg, "Tables", "Table 3 × 4")
    E = await els(pg); x0, y0 = box(E)
    ok("table dropped in, nothing grabbed", len(E) > 5 and await pg.locator(".dock [aria-label='Delete selection']").count() == 0)
    await tap(pg, x0 + 60, y0 + 60)   # row 2, column 1
    ok("one tap in a cell starts typing (pen tool)", await typing(pg))
    await pg.keyboard.type("Milk"); await pg.keyboard.press("Tab"); await pg.wait_for_timeout(200)
    ok("Tab moves to the next cell", await typing(pg))
    await pg.keyboard.type("2 litres"); await pg.keyboard.press("Escape")
    W = written(await els(pg)); W.sort(key=lambda e: e["x"])
    ok("both cells saved as part of the template", len(W) == 2 and all(e.get("g") for e in W), str([e.get("text") for e in W]))
    ok("text sits inside its own cell", len(W) == 2 and x0 < W[0]["x"] < x0 + 120 and x0 + 120 < W[1]["x"] < x0 + 240 and all(y0 + 40 < e["y"] < y0 + 80 for e in W),
       str([(round(e["x"] - x0), round(e["y"] - y0)) for e in W]))
    await pg.screenshot(path=f"{OUT}/fill-table.png")
    # tapping the cell again edits what's there instead of adding a second text
    await tap(pg, x0 + 100, y0 + 70); await pg.keyboard.type(" (oat)"); await pg.keyboard.press("Escape")
    W = written(await els(pg))
    ok("tapping a filled cell edits it", len(W) == 2 and any(e["text"] == "Milk (oat)" for e in W), str([e["text"] for e in W]))
    # header: typing replaces the template's "Header"
    await tap(pg, x0 + 300, y0 + 20); await pg.keyboard.type("Notes"); await pg.keyboard.press("Escape")
    ok("tapping a header lets you rename it", any(e["t"] == "text" and e.get("text") == "Notes" for e in await els(pg)))
    # long text wraps inside the cell
    await tap(pg, x0 + 180, y0 + 140); await pg.keyboard.type("a much longer entry that cannot fit"); await pg.keyboard.press("Escape")
    long = [e for e in written(await els(pg)) if e["text"].startswith("a much")]
    ok("long text wraps inside the cell", long and "\n" in long[0]["text"], repr(long[0]["text"]) if long else "")

    # 2. the Select tool: tap writes, drag moves the template
    await pg.click(".dock [aria-label^='Select']")
    await tap(pg, x0 + 300, y0 + 100)
    ok("Select tool: the first tap picks the template up (to move or resize)", not await typing(pg) and await pg.locator("[data-handle]").count() == 1)
    await tap(pg, x0 + 300, y0 + 100); ok("Select tool: a second tap types in the cell", await typing(pg))
    await pg.keyboard.type("x"); await pg.keyboard.press("Escape")
    sx, sy = await scr(pg, x0 + 2, y0 + 60)   # the table's left edge
    before = box(await els(pg))
    await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(sx + 60, sy + 40, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
    after = box(await els(pg))
    ok("Select tool: dragging moves the template with what's written in it", abs(after[0] - before[0] - 60) < 3 and await typing(pg) is False, f"{before}->{after}")
    await pg.click(".dock [aria-label^='Pen']")

    # 3. checklist: tap a box to tick it, tap the line to write
    await drop(pg, "Lists & lines", "Checklist")
    E = await els(pg); grp = [e for e in E if e["t"] == "rect" and abs(e["x2"] - e["x"] - 20) < 1]
    gx, gy = min(e["x"] for e in grp), min(e["y"] for e in grp)
    await tap(pg, gx + 10, gy + 10)
    ticks = [e for e in await els(pg) if e.get("text") == "✓"]
    ok("tapping a tick box ticks it", len(ticks) == 1 and not await typing(pg))
    await tap(pg, gx + 10, gy + 10)
    ok("tapping it again clears it", not [e for e in await els(pg) if e.get("text") == "✓"])
    await tap(pg, gx + 150, gy + 12); ok("tapping beside the box writes on its line", await typing(pg))
    await pg.keyboard.type("Buy bread"); await pg.keyboard.press("Escape")
    t = [e for e in written(await els(pg)) if e["text"] == "Buy bread"]
    ok("…and the text sits on that line", t and gy + 4 < t[0]["y"] <= gy + 21, str(t[0]["y"] - gy) if t else "")
    await pg.screenshot(path=f"{OUT}/fill-checklist.png")

    # 4. a planner page from the template library: write in an hour slot, Tab to the next, fill in the date
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
    await pg.fill("input[aria-label='Search templates']", "Daily Planner"); await pg.wait_for_timeout(200)
    await pg.locator(".lib-grid .layout-opt").first.click(); await pg.wait_for_timeout(1200)
    E = await els(pg); slots = sorted([e for e in E if e["t"] == "rect" and abs((e["y2"] - e["y"]) - 94) < 1], key=lambda e: e["y"])
    s1 = slots[1]
    await tap(pg, s1["x"] + 400, s1["y"] + 47)
    ok("planner: one tap in the 09:00 slot starts typing", await typing(pg))
    await pg.keyboard.type("Team stand-up"); await pg.keyboard.press("Tab"); await pg.keyboard.type("Emails"); await pg.keyboard.press("Escape")
    W = written(await els(pg)); W.sort(key=lambda e: e["y"])
    inside = lambda e, s: s["x"] < e["x"] < s["x2"] and s["y"] < e["y"] < s["y2"]
    ok("planner: text lands inside its slot, Tab goes to the next slot", len(W) == 2 and inside(W[0], s1) and inside(W[1], slots[2]), str([(e["text"], round(e["y"])) for e in W]))
    ok("planner: lettering is sized to the slot", W and 18 <= W[0]["fs"] <= 40, str(W[0]["fs"]) if W else "")
    date = [e for e in E if e["t"] == "text" and e.get("text", "").startswith("DATE")][0]
    await tap(pg, date["x"] + 120, date["y"] - 5); await pg.keyboard.type("13 Nov"); await pg.keyboard.press("Escape")
    ok("planner: a blank (DATE: ____) is filled in", any(e.get("text") == "DATE: 13 Nov" for e in await els(pg)))
    await pg.screenshot(path=f"{OUT}/fill-planner.png")
    ok("no errors", not errs, ";".join(errs[:2]))
    await b.close()

async def phone(p):
    b = await p.chromium.launch(); ctx = await b.new_context(**p.devices["Pixel 7"]); pg = await ctx.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(800)
    await blank_page(pg); await drop(pg, "Tables", "Table 3 × 4")
    x0, y0 = box(await els(pg))
    await tap(pg, x0 + 60, y0 + 100, phone=True)
    ok("phone: a finger tap in a cell starts typing", await typing(pg))
    ok("phone: the keyboard goes to it", await pg.evaluate("document.activeElement?.classList.contains('text-edit')"))
    await pg.keyboard.type("Eggs"); await pg.keyboard.press("Escape")
    ok("phone: saved in the cell", any(e.get("text") == "Eggs" and e.get("wr") for e in await els(pg)))
    await pg.screenshot(path=f"{OUT}/fill-phone.png")

    # the Wide Ruled page on a phone, as in the report: tap a line, write, tap a lower line, write more
    await pg.goto(BASE); await pg.wait_for_timeout(600)
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
    await pg.fill("input[aria-label='Search templates']", "Wide Ruled"); await pg.wait_for_timeout(200)
    await pg.locator(".lib-grid .layout-opt").first.click(); await pg.wait_for_timeout(1200)
    E = await els(pg); R = sorted([e for e in E if e["t"] == "line" and e.get("lock") and abs(e["y2"] - e["y"]) < 1 and e["x2"] - e["x"] > 500 and e["x"] > 100], key=lambda e: e["y"])
    gap = sorted(b["y"] - a["y"] for a, b in zip(R, R[1:]))[len(R) // 2]   # the line spacing (the header's underline isn't a writing line)
    head = [e for e in E if e["t"] == "text" and e.get("text") == "Wide Ruled"][0]
    await tap(pg, head["x"] + 500, head["y"] - 60, phone=True)
    ok("phone, Wide Ruled: tapping the header opens no box", not await typing(pg))
    await tap(pg, R[0]["x"] + 400, R[2]["y"] - gap * 0.4, phone=True)
    ok("phone, Wide Ruled: a tap on a line puts the cursor there", await typing(pg))
    look = await pg.evaluate("(()=>{const t=document.querySelector('.text-edit'),c=getComputedStyle(t);return {outline:c.outlineStyle,bg:c.backgroundColor,ph:t.placeholder,fs:parseFloat(c.fontSize)}})()")
    ok("phone, Wide Ruled: no box, outline or 'Type here'", look["outline"] == "none" and look["bg"] in ("rgba(0, 0, 0, 0)", "transparent") and not look["ph"], str(look))
    ok("phone, Wide Ruled: zoomed in so the writing is readable", look["fs"] >= 14, str(look["fs"]))
    await pg.keyboard.type("Hello notebook")
    sx, sy = await scr(pg, R[0]["x"] + 300, R[4]["y"] - gap * 0.4)
    await pg.touchscreen.tap(sx, sy); await pg.wait_for_timeout(250)
    ok("phone, Wide Ruled: tapping a lower line keeps writing in the same place", await typing(pg))
    await pg.keyboard.type("second thought")
    await pg.screenshot(path=f"{OUT}/fill-phone-ruled.png")
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    W = written(await els(pg))
    ok("phone, Wide Ruled: one piece of writing", len(W) == 1, str([w["text"] for w in W]))
    if W:
        L = W[0]["text"].split("\n"); t = W[0]
        on = lambda txt, rule: abs((t["y"] + L.index(txt) * t["lh"]) - (rule["y"] - gap * 0.17)) < 3
        ok("phone, Wide Ruled: each line sits on the rule that was tapped", "Hello notebook" in L and "second thought" in L and on("Hello notebook", R[2]) and on("second thought", R[4]), repr(t["text"]))
    await pg.screenshot(path=f"{OUT}/fill-phone-ruled-done.png")
    ok("phone: no errors", not errs, ";".join(errs[:2]))
    await b.close()

async def scribble_on_doc(p):
    b = await p.chromium.launch(); ctx = await b.new_context(viewport={"width": 1400, "height": 950}); pg = await ctx.new_page()
    await pg.goto(BASE); await pg.wait_for_timeout(800)
    await pg.click(".list-head button:has-text('New')"); await pg.locator(".new-menu .menu-item").first.click(); await pg.wait_for_timeout(500)
    await pg.click("[role=switch]:has-text('Scribble')"); await pg.wait_for_timeout(400)
    await drop(pg, "Tables", "Table 2 × 3")
    x0, y0 = box(await els(pg, "ink"))
    await tap(pg, x0 + 60, y0 + 60)
    ok("Scribble on a document: tap a table cell and type", await typing(pg))
    await pg.keyboard.type("Point"); await pg.keyboard.press("Escape")
    ok("Scribble on a document: saved", any(e.get("text") == "Point" for e in await els(pg, "ink")))
    await b.close()

async def main():
    async with async_playwright() as p:
        await desktop(p); await phone(p); await scribble_on_doc(p)
asyncio.run(main())
