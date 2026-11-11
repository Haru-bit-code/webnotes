import { describe, expect, it } from "vitest";
import { holdHtml, releaseIn, setAllowRemote } from "@/lib/remote";
import { cleanHtml } from "@/lib/formats";
import { assetRefs } from "@/lib/fullBackup";
import type { Note } from "@/lib/types";

describe("pictures from the web", () => {
  it("are held back, and put back exactly", () => {
    setAllowRemote(false);
    const r = holdHtml('<p><img src="https://t.example/a.png"><img data-asset="x1"><span style="background:url(https://t.example/b.png)">x</span></p>');
    expect(r.held).toBe(2);
    expect(r.html).not.toMatch(/\ssrc="https/); expect(r.html).not.toMatch(/\sstyle="[^"]*url\(https/);
    const t = document.createElement("template"); t.innerHTML = r.html; releaseIn(t.content);
    expect(t.innerHTML).toContain('src="https://t.example/a.png"');
  });
  it("load straight away when the user allows them", () => {
    setAllowRemote(true);
    expect(holdHtml('<img src="https://t.example/a.png">').held).toBe(0);
    setAllowRemote(false);
  });
});

describe("pasted text colours", () => {
  it("drops black/white/grey so text follows the theme, keeps real colours", () => {
    const out = cleanHtml('<span style="color: rgb(24, 32, 46)">a</span><span style="color: #e5484d">b</span><span style="background-color: #ffffff">c</span>');
    expect(out).not.toMatch(/24, 32, 46/); expect(out).not.toMatch(/ffffff/i); expect(out.toLowerCase()).toContain("e5484d");
  });
  it("removes scripts and event handlers", () => {
    const out = cleanHtml('<p onclick="alert(1)">x</p><script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(out).not.toMatch(/onclick|onerror|<script/i);
  });
});

describe("backups", () => {
  it("find every stored file a note uses", () => {
    const n = { id: "n", body: "![a](asset:img1) [f](asset:file2)", html: '<img data-asset="img3">', drawing: [{ src: "asset:pg4" }] } as unknown as Note;
    expect(assetRefs(n).sort()).toEqual(["file2", "img1", "img3", "pg4"]);
  });
});
