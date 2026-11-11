"use client";
// One way to hand a file to the user.
// Website: a normal browser download. Android app: the file is written to the app's cache and
// Android's share sheet opens, so it can be saved to Files / Drive or sent to another app.
import { Capacitor } from "@capacitor/core";

export const isApp = () => Capacitor.isNativePlatform();

const toBase64 = (blob: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => fail(r.error);
  r.readAsDataURL(blob);
});

/** hand a file to another app: the share sheet where there is one (Android app, phone browsers), else a download */
export async function shareFile(blob: Blob, name: string, title = name) {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "_") || "file";
  if (isApp()) return saveFile(blob, safe);
  const file = new File([blob], safe, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; } // closed the share sheet
  }
  return saveFile(blob, safe);
}

export async function saveFile(blob: Blob, name: string) {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "_") || "file";
  if (!isApp()) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = safe;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return;
  }
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const res = await Filesystem.writeFile({ path: `exports/${safe}`, data: await toBase64(blob), directory: Directory.Cache, recursive: true });
    await Share.share({ title: safe, files: [res.uri], dialogTitle: `Save or send ${safe}` });
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (!/cancel/i.test(msg)) alert(`Couldn't save ${safe}: ${msg || "unknown error"}`);
  }
}
