"use client";
// Pictures from the web are held back until the user allows them: loading one tells that website the note
// was opened (and from where), which is how tracking pixels work. Stored pictures (asset:…), data: and blob:
// pictures are always fine. Settings → "Pictures from the web" turns this off.
let allow = false;
export const setAllowRemote = (v: boolean) => { allow = v; };
export const remoteAllowed = () => allow;

export const isRemote = (v: string | null | undefined) => !!v && /^\s*(https?:)?\/\//i.test(v);
const ATTRS = ["src", "srcset", "poster", "href", "xlink:href"];
const LOADS = (el: Element) => el.tagName === "IMG" || el.tagName === "SOURCE" || el.tagName === "VIDEO" || el.tagName === "AUDIO" || el.tagName.toLowerCase() === "image" || el.tagName.toLowerCase() === "use" || el.tagName === "INPUT";

/** move web addresses of one element into data-remote-* so nothing is fetched; returns true if anything was held back */
export function holdElement(el: Element) {
  let held = false;
  if (LOADS(el)) for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (a === "srcset" ? !!v && /(https?:)?\/\//i.test(v) : isRemote(v)) { el.setAttribute(`data-remote-${a.replace(":", "-")}`, v!); el.removeAttribute(a); held = true; }
  }
  const st = el.getAttribute("style");
  if (st && /url\(\s*['"]?\s*(https?:)?\/\//i.test(st)) { el.setAttribute("data-remote-style", st); el.setAttribute("style", st.replace(/url\([^)]*\)/gi, "none")); held = true; }
  if (held && el.tagName === "IMG") el.classList.add("remote-img");
  return held;
}
/** same, for an HTML string, without the browser fetching anything while it is parsed */
export function holdHtml(html: string): { html: string; held: number } {
  if (allow || !/(https?:)?\/\//i.test(html)) return { html, held: 0 };
  const t = document.createElement("template"); t.innerHTML = html; // template content is inert: nothing loads
  let held = 0; t.content.querySelectorAll("*").forEach((el) => { if (holdElement(el)) held++; });
  return { html: t.innerHTML, held };
}
/** put the web addresses back (when the user says "Show pictures", or before saving) */
export function releaseIn(root: ParentNode) {
  root.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.getAttributeNames()]) {
      if (!a.startsWith("data-remote-")) continue;
      const orig = a.slice(12) === "xlink-href" ? "xlink:href" : a.slice(12);
      el.setAttribute(orig, el.getAttribute(a)!); el.removeAttribute(a);
    }
    el.classList.remove("remote-img"); if (el.getAttribute("class") === "") el.removeAttribute("class");
  });
}
export const countHeld = (root: ParentNode | null) => (root ? root.querySelectorAll("img.remote-img, [data-remote-src], [data-remote-style], [data-remote-href], [data-remote-poster]").length : 0);
