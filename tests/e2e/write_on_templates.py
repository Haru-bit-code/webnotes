import asyncio, sys
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402  (shared setup: server address, sample files, output folder)

D=OUT
async def drawing(pg): return await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes'))[0].drawing||[]")
async def open_lib(pg, q):
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(500)
    await pg.fill("input[aria-label='Search templates']", q); await pg.wait_for_timeout(200)
    await pg.locator(".lib-grid .layout-opt").first.click(); await pg.wait_for_timeout(1200)
async def rule_rects(pg):
    # screen boxes of the template's horizontal rule lines
    E=await drawing(pg); ids=[x["id"] for x in E if x.get("lock") and x["t"]=="line" and abs(x["y2"]-x["y"])<1.5 and abs(x["x2"]-x["x"])>=100]
    return await pg.evaluate("ids=>ids.map(id=>{const r=document.querySelector(`[data-id='${id}']`).getBoundingClientRect();return [r.x,r.y,r.width]}).sort((a,b)=>a[1]-b[1])", ids)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1400,"height":950}); pg=await ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(800)
    await open_lib(pg,"Ruled Notes")
    R=await rule_rects(pg); vis=[r for r in R if 150<r[1]<900]
    ok("ruled lines found on screen", len(vis)>=5, str(len(vis)))
    # one click between two lines, then just type
    a,b2=vis[1],vis[2]
    await pg.mouse.click(a[0]+300, (a[1]+b2[1])/2); await pg.wait_for_timeout(250)
    ok("one click opens typing (no text tool needed)", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.type("First line of my notes"); await pg.keyboard.press("Enter"); await pg.keyboard.type("second line")
    await pg.wait_for_timeout(150); await pg.screenshot(path=f"{D}/01-typing.png")
    box=await pg.locator(".text-edit").bounding_box()
    # click another line to keep writing: saves the first
    c=vis[5]; await pg.mouse.click(c[0]+60, c[1]-8); await pg.wait_for_timeout(250)
    ok("clicking the next line saves and starts there", await pg.locator(".text-edit").count()==1)
    await pg.keyboard.type("A much longer sentence that keeps going and going so that it reaches the end of the ruled line and must continue on the line below without me pressing enter at all")
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(250)
    E=await drawing(pg); T=[x for x in E if x["t"]=="text" and x.get("wr")]
    ok("one piece of writing on the page, not a box per click", len(T)==1, str([x.get("text","")[:20] for x in T]))
    t=T[0]; gap=t["lh"]; L=t["text"].split("\n")
    ys=sorted(set(round(x["y"]) for x in E if x.get("lock") and x["t"]=="line" and abs(x["y2"]-x["y"])<1.5))
    off=[min(ys,key=lambda y:abs(y-(t["y"]+i*gap)))-(t["y"]+i*gap) for i in range(len(L))]
    ok("every line of it sits on a rule", all(0 < o < gap*0.3 for o in off) and abs(gap-61)<2, f"gap {gap} offsets {[round(o) for o in off]}")
    ok("Enter goes to the next line", "First line of my notes" in L and L[L.index("First line of my notes")+1]=="second line", repr(t["text"][:80]))
    # where it landed on screen: the line under each click
    tsp=await pg.evaluate("id=>[...document.querySelectorAll(`[data-id='${id}'] tspan`)].map(n=>[n.textContent,n.getBoundingClientRect().bottom])", t["id"])
    fy=[y for (tx,y) in tsp if tx.startswith("First line")][0]; ly=[y for (tx,y) in tsp if tx.startswith("A much")][0]
    ok("text goes on the line you clicked", abs(fy-vis[2][1]) < 30 and abs(ly-vis[5][1]) < 30, f"{fy:.0f}~{vis[2][1]:.0f}, {ly:.0f}~{vis[5][1]:.0f}")
    ok("long text continues on the next lines", len([x for x in L if x])>=4, str(len(L)))
    right=await pg.evaluate("id=>Math.max(...[...document.querySelectorAll(`[data-id='${id}'] tspan`)].map(n=>n.getBoundingClientRect().right))", t["id"])
    rr=max(r[0]+r[2] for r in vis)
    ok("wrapped text stays inside the page lines", right<=rr+4, f"{right:.0f} vs {rr:.0f}")
    await pg.screenshot(path=f"{D}/02-ruled.png")
    # tapping your own words puts the cursor there: no new box
    await pg.mouse.click(vis[2][0]+330, vis[2][1]-10); await pg.wait_for_timeout(200); await pg.keyboard.press("End"); await pg.keyboard.type("!"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    T2=[x for x in await drawing(pg) if x["t"]=="text" and x.get("wr")]
    ok("tapping your writing edits it in place", len(T2)==1 and "First line of my notes!" in T2[0]["text"].split("\n") and T2[0].get("lh")==gap, repr(T2[0]["text"][:60]) if T2 else "")
    # other templates
    for q in ["Cornell Notes","Dot Grid","Graph Paper","Meeting Notes","Two Column","Daily Planner"]:
      await open_lib(pg,q); title=await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes'))[0].title")
      R=await rule_rects(pg); vis=[r for r in R if 200<r[1]<850 and r[2]>60]
      if len(vis)>=3: tx,ty=vis[2][0]+40, vis[2][1]-6
      else:
        bb=await pg.locator("svg.touch-none").first.bounding_box(); tx,ty=bb["x"]+bb["width"]/2, bb["y"]+bb["height"]*0.6
      await pg.mouse.click(tx,ty); await pg.wait_for_timeout(250)
      opened=await pg.locator(".text-edit").count()==1
      await pg.keyboard.type("Hello"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
      got=[x for x in await drawing(pg) if x["t"]=="text" and "Hello" in (x.get("text") or "").split("\n")]
      ok(f"{title}: click and type", opened and len(got)==1, f"{len(vis)} rules, lh={got[0].get('lh') if got else None}")
      await pg.screenshot(path=f"{D}/t-{q.replace(' ','_')}.png")
    # built-in ruled paper (no template)
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
    await pg.click("[role=tab]:has-text('Blank')"); await pg.wait_for_timeout(200)
    await pg.locator(".modal button:has-text('College ruled')").first.click(); await pg.wait_for_timeout(800)
    bb=await pg.locator("svg.touch-none").first.bounding_box()
    await pg.mouse.click(bb["x"]+400, bb["y"]+300); await pg.wait_for_timeout(250); await pg.keyboard.type("On ruled paper"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    got=[x for x in await drawing(pg) if x.get("text")=="On ruled paper"]
    ok("ruled paper: click and type on the line", len(got)==1 and got[0].get("lh")==30, str(got[0] if got else None))
    await pg.screenshot(path=f"{D}/03-paper.png")
    # hand-drawn layouts
    await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
    await pg.fill("input[aria-label='Search templates']", "hand-drawn"); await pg.wait_for_timeout(200)
    names=await pg.locator(".modal .layout-opt b").all_inner_texts(); await pg.click(".modal [aria-label='Close']")
    bad=[]
    for nm in names[:12]:
      await pg.click(".list-head button:has-text('New')"); await pg.click(".new-menu .menu-item:has-text('Scribble page')"); await pg.wait_for_timeout(300)
      await pg.fill("input[aria-label='Search templates']", "hand-drawn"); await pg.wait_for_timeout(200)
      await pg.locator(f".modal .layout-opt:has(b:text-is('{nm}'))").first.click(); await pg.wait_for_timeout(700)
      R=await rule_rects(pg); vis=[r for r in R if 250<r[1]<850 and r[2]>60]
      pairs=[(r1,r2) for r1,r2 in zip(vis,vis[1:]) if abs(r1[0]-r2[0])<3 and 15<r2[1]-r1[1]<90]
      if pairs: r1,r2=pairs[len(pairs)//2]; tx,ty=r1[0]+r1[2]*0.55, (r1[1]+r2[1])/2
      elif vis: tx,ty=vis[len(vis)//2][0]+30, vis[len(vis)//2][1]-6
      else: bb=await pg.locator("svg.touch-none").first.bounding_box(); tx,ty=bb["x"]+bb["width"]*0.45, bb["y"]+bb["height"]*0.55
      await pg.mouse.click(tx,ty); await pg.wait_for_timeout(250); o=await pg.locator(".text-edit").count()
      await pg.keyboard.type("Hi"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(150)
      if not (o and any("Hi" in (x.get("text") or "").split("\n") for x in await drawing(pg))): bad.append((nm, o, round(tx), round(ty), [x.get("text") for x in await drawing(pg) if "Hi" in (x.get("text") or "")]))
    ok(f"hand-drawn layouts ({min(12,len(names))}): click and type", not bad, str(bad))
    ok("no errors", not errs, ";".join(errs[:3]))
    await b.close()
asyncio.run(main())
