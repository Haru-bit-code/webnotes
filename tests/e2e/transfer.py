"""Send & receive between two separate browsers (two "devices" with their own storage).

Uses a local PeerJS introduction server (npx peerjs) so the test needs no internet; the app is pointed at it
with localStorage "webnotes:peerServer". Camera scanning is tested with Chromium's fake camera fed a video of
the QR codes the sender shows.
"""
import asyncio, json, os, subprocess, time
from playwright.async_api import async_playwright
from _common import BASE, FIXTURES, OUT, ok  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PEER = {"host": "127.0.0.1", "port": 9100, "path": "/", "secure": False}
SETUP = f"localStorage.setItem('webnotes:peerServer', JSON.stringify({json.dumps(PEER)}))"

async def notes(pg): await pg.wait_for_timeout(150); return await pg.evaluate("JSON.parse(localStorage.getItem('webnotes:notes')||'[]')")
async def assets(pg): return await pg.evaluate("new Promise(r=>{const q=indexedDB.open('webnotes-assets',1);q.onupgradeneeded=()=>q.result.createObjectStore('files',{keyPath:'id'});q.onsuccess=()=>{const g=q.result.transaction('files').objectStore('files').getAll();g.onsuccess=()=>r(g.result.map(a=>a.id+':'+a.size).sort())}})")

async def device(b, **kw):
    ctx = await b.new_context(viewport={"width": 1300, "height": 900}, **kw)
    await ctx.add_init_script(SETUP)
    pg = await ctx.new_page(); await pg.goto(BASE); await pg.wait_for_timeout(900)
    return ctx, pg

async def start_send(pg, what="All notes"):
    await pg.click(".side-foot button:has-text('Send & receive')"); await pg.wait_for_timeout(200)
    await pg.locator(f".modal label:has-text('{what}') input").check()
    await pg.click(".modal button:has-text('Show QR code')")
    await pg.wait_for_selector(".status-line:has-text('Waiting for the other device')", timeout=20000)
    return (await pg.inner_text(".big-code")).replace("-", ""), await pg.get_attribute(".qr-canvas", "data-qr")

async def accept(pg, timeout=40000):
    await pg.wait_for_selector(".modal button:has-text('Add to this device')", timeout=timeout)
    summary = await pg.inner_text(".modal .space-y-3 b")
    await pg.click(".modal button:has-text('Add to this device')"); await pg.wait_for_selector(".status-line:has-text('Added')", timeout=10000)
    return summary

def video_of(texts, path, frame_ms=250):
    """write the QR codes as a looping MJPEG the fake camera plays"""
    d = os.path.join(OUT, "qrframes"); os.makedirs(d, exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    js = "const Q=require('qrcode');const t=JSON.parse(process.argv[1]);(async()=>{for(let i=0;i<t.length;i++)await Q.toFile(process.argv[2]+'/f'+String(i).padStart(4,'0')+'.png',t[i],{errorCorrectionLevel:'L',margin:4,width:560});})()"
    subprocess.run(["node", "-e", js, json.dumps(texts), d], cwd=ROOT, check=True)
    fps = 1000 / frame_ms
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(d, "f%04d.png"), "-vf", "pad=1280:720:(ow-iw)/2:(oh-ih)/2:white,format=yuvj420p", "-r", str(max(fps, 10)), "-q:v", "3", path], check=True)

async def main():
    srv = subprocess.Popen(["npx", "peerjs", "--host", "127.0.0.1", "--port", str(PEER["port"]), "--path", "/"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            errs = []
            ctxA, A = await device(b); A.on("pageerror", lambda e: errs.append("A " + str(e)))
            # device A: a notebook with a Word doc (pictures) in a folder, a plain note, and an AI key
            await A.evaluate("localStorage.setItem('webnotes:ai', JSON.stringify({chat:'anthropic',consent:1,providers:{anthropic:{apiKey:'sk-ant-TEST-SECRET-9f3',model:'m'}}}))")
            await A.click("[aria-label='New folder']"); await A.fill("input[aria-label='Folder name']", "Work"); await A.keyboard.press("Enter"); await A.wait_for_timeout(300)
            await A.click(".list-head button:has-text('New')")
            async with A.expect_file_chooser() as fc: await A.click("text=Import file…")
            await (await fc.value).set_files(os.path.join(FIXTURES, "Project_Brief.docx")); await A.click("button:has-text('Import'):not(:has-text('file'))"); await A.wait_for_timeout(1200)
            await A.locator(".nav-item:has-text('All notes')").click()
            await A.click(".list-head button:has-text('New')"); await A.click(".new-menu .menu-item:has(b:text-matches('^Markdown'))"); await A.wait_for_timeout(300)
            await A.fill("input[aria-label='Note title']", "Shopping"); await A.click("[role=radio]:text-is('Edit')"); await A.fill("textarea.source", "- milk\n- eggs")
            NA = await notes(A); FA = await assets(A)
            ok("sender has notes, files and a folder", len(NA) == 2 and len(FA) >= 1 and any(n.get("folder") == "Work" for n in NA), f"{len(NA)} notes, {len(FA)} files")

            # 1. typed code
            code, link = await start_send(A)
            await A.screenshot(path=f"{OUT}/transfer-send.png")
            ok("QR code holds a link with the same code", link.endswith("#receive=" + code), link)
            ctxB, B = await device(b); B.on("pageerror", lambda e: errs.append("B " + str(e)))
            await B.click(".side-foot button:has-text('Send & receive')"); await B.click(".modal [role=tab]:has-text('Receive here')")
            await B.fill("#recv-code", code.lower()[:4] + " " + code.lower()[4:]); await B.click(".modal button:has-text('Connect')")
            summary = await accept(B); await B.screenshot(path=f"{OUT}/transfer-received.png")
            ok("receiver sees what arrived before adding it", "2 notes" in summary and "file" in summary, summary)
            NB = await notes(B); FB = await assets(B)
            ok("typed code: all notes arrive", {n["id"] for n in NB} == {n["id"] for n in NA})
            ok("typed code: pictures arrive, byte for byte", FB == FA, f"{FB} vs {FA}")
            ok("folder arrives and shows in the sidebar", await B.locator(".folder-row:has-text('Work')").count() == 1)
            ok("sender says it's done", await A.locator(".status-line:has-text('Sent 2 notes')").count() == 1)
            ok("AI key never reaches the other device", "sk-ant-TEST-SECRET-9f3" not in json.dumps(await B.evaluate("Object.fromEntries(Object.entries(localStorage))")))
            await B.click(".modal [aria-label='Close']")
            await B.locator(".note-card:has-text('Project Brief')").first.click(); await B.wait_for_timeout(1000)
            ok("received Word pictures display", await B.evaluate("Math.max(0,...[...document.querySelectorAll('.rich-doc img, .md img')].map(i=>i.naturalWidth))") > 0)

            # 2. wrong code
            await B.click(".side-foot button:has-text('Send & receive')"); await B.click(".modal [role=tab]:has-text('Receive here')")
            await B.fill("#recv-code", "ZZZZ-ZZZZ-ZZZZ"); await B.click(".modal button:has-text('Connect')")
            await B.wait_for_selector(".status-line.bad", timeout=30000)
            ok("a wrong code says so clearly", "No device is sending with that code" in await B.inner_text(".status-line.bad"), await B.inner_text(".status-line.bad"))
            await B.click(".modal [aria-label='Close']")

            # 3. opening the QR link (what a phone camera app does)
            await A.click(".modal button:has-text('Done'), .modal button:has-text('Cancel')"); await A.click(".modal [aria-label='Close']")
            await A.locator(".note-card:has-text('Shopping')").click(); await A.click("[aria-label='Share this note']"); await A.click(".menu-item:has-text('Send with a QR code')")
            await A.wait_for_timeout(200)
            ok("a note can be sent on its own", await A.locator(".modal label:has-text('This note') input").is_checked())
            await A.click(".modal button:has-text('Show QR code')"); await A.wait_for_selector(".status-line:has-text('Waiting')", timeout=20000)
            link2 = await A.get_attribute(".qr-canvas", "data-qr")
            ctxC, C = await device(b); C.on("pageerror", lambda e: errs.append("C " + str(e)))
            await C.goto(BASE + "/#" + link2.split("#", 1)[1]); await C.wait_for_timeout(500)
            summary = await accept(C)
            ok("opening the QR link receives straight away (after asking)", "1 note" in summary and [n["title"] for n in await notes(C)] == ["Shopping"], summary)
            ok("the code is removed from the address bar", "receive=" not in C.url)

            # 4. scanning the QR code with the camera
            mj = os.path.join(OUT, "qr-link.mjpeg")
            await A.click(".modal button:has-text('Done'), .modal button:has-text('Cancel')")
            await A.click(".modal button:has-text('Show QR code')"); await A.wait_for_selector(".status-line:has-text('Waiting')", timeout=20000)
            video_of([await A.get_attribute(".qr-canvas", "data-qr")], mj)
            b2 = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={mj}"])
            ctxD, D = await device(b2, permissions=["camera"])
            await D.click(".side-foot button:has-text('Send & receive')"); await D.click(".modal [role=tab]:has-text('Receive here')")
            await D.click(".modal button:has-text('Scan QR code')")
            summary = await accept(D, 60000)
            ok("scanning the QR code with the camera works", "1 note" in summary, summary)
            await b2.close()

            # 5. animated QR (offline): the camera reads a looping stream of QR codes
            await A.click(".modal button:has-text('Done'), .modal button:has-text('Cancel')")
            await A.locator(".modal label:has-text('All notes') input").check(); await A.click(".modal button:has-text('Animated QR (offline)')")
            await A.wait_for_selector(".qr-canvas"); await A.wait_for_timeout(300)
            seen = {}
            for _ in range(400):
                t = await A.get_attribute(".qr-canvas", "data-qr"); seen[t] = 1
                n = int(t.split("|")[3]);
                if len(seen) >= n: break
                await A.wait_for_timeout(60)
            frames = sorted(seen, key=lambda t: int(t.split("|")[2]))
            ok("animated QR splits the notes into parts", len(frames) >= 2 and all(f.startswith("WN1|") for f in frames), f"{len(frames)} parts")
            await A.screenshot(path=f"{OUT}/transfer-animated.png")
            mj2 = os.path.join(OUT, "qr-anim.mjpeg"); video_of(frames, mj2, 300)
            b3 = await p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={mj2}"])
            ctxE, E = await device(b3, permissions=["camera"])
            await E.click(".side-foot button:has-text('Send & receive')"); await E.click(".modal [role=tab]:has-text('Receive here')")
            await E.click(".modal button:has-text('Scan QR code')")
            summary = await accept(E, 90000)
            NE = await notes(E)
            ok("animated QR works with no connection at all", "2 notes" in summary and {n["id"] for n in NE} == {n["id"] for n in NA}, summary)
            await b3.close()
            ok("no errors", not errs, ";".join(errs[:3]))
            await b.close()
    finally:
        srv.terminate()

asyncio.run(main())
