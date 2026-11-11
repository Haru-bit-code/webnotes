"""Shared setup for the browser tests.

Every suite drives the real app in Chromium (Playwright) like a user would and prints one
PASS/FAIL line per check. Run them all with:  python tests/e2e/run.py
"""
import asyncio, os, time
from playwright.async_api import Page

BASE = os.environ.get("WEBNOTES_URL", "http://localhost:3190")          # the running app (npm run build && npm start -- -p 3190)
FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")    # sample Word / PDF / Excel / … files
OUT = os.environ.get("WEBNOTES_TEST_OUT", os.path.join(os.path.dirname(__file__), ".out"))  # screenshots and downloads
os.makedirs(OUT, exist_ok=True)

def ok(name, cond, extra=""):
    print("PASS" if cond else "FAIL", name, extra, flush=True)

# Playwright's wait_for_function evaluates a string inside the page, which the app's Content-Security-Policy
# (no 'unsafe-eval') correctly blocks. Poll through page.evaluate instead.
async def _wait_for_function(self, expr, timeout=30000, **_):
    fn = expr if expr.strip().startswith(("(", "function", "async")) else f"() => ({expr})"
    t0 = time.time()
    while True:
        if await self.evaluate(fn): return
        if (time.time() - t0) * 1000 > timeout: raise TimeoutError("timed out waiting for " + expr)
        await asyncio.sleep(0.1)
Page.wait_for_function = _wait_for_function
