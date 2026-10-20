// Frozen copies of live pages. A snapshot is a directory of data: one MHTML capture per width
// (Chrome strips scripts from MHTML, so a snapshot never runs code) plus meta.json. It is only
// ever opened in the browser, addressed as `snapshot:<dir>`.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const dirOf = (url) => { const p = url.slice("snapshot:".length); return isAbsolute(p) ? p : existsSync(resolve(p)) ? resolve(p) : join(ROOT, p); };

/** `snapshot:<dir>` at a width → { href, file, source, missing }; null for any other URL. */
export function resolveSnapshot(url, width) {
    if (!url.startsWith("snapshot:")) return null;
    const dir = dirOf(url), file = join(dir, `${width}.mhtml`);
    const meta = existsSync(join(dir, "meta.json")) ? JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) : {};
    return { href: pathToFileURL(file).href, file, source: meta.url ?? url, missing: !existsSync(file) };
}

/**
 * Captures the page held by a prepared tab (see openPrepared: loaded, lazy content pulled in)
 * into `<dir>/<width>.mhtml` and records it in meta.json. Reads the page; changes nothing on it.
 */
export async function saveSnapshot(page, rec, dir) {
    mkdirSync(dir, { recursive: true });
    await pinImages(page);
    await bakeMedia(page);
    const { data } = await page.send("Page.captureSnapshot", { format: "mhtml" });
    const file = join(dir, `${rec.width}.mhtml`);
    writeFileSync(file, data);
    const metaFile = join(dir, "meta.json");
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : { url: rec.url, widths: {} };
    meta.url = rec.url;
    meta.widths[rec.width] = { finalUrl: rec.finalUrl, title: rec.title, captured: new Date().toISOString(), bytes: statSync(file).size };
    writeFileSync(metaFile, JSON.stringify(meta, null, 1));
    return meta.widths[rec.width];
}

/**
 * MHTML keeps no canvas pixels and no video frame. Each sizeable one is photographed alone (the
 * rest of the page hidden for the shot) and the picture set as its own background, in our tab only.
 */
async function bakeMedia(page) {
    const rects = await page.evaluate(`(() => {
        const out = [];
        (function walk(root) { for (const el of root.querySelectorAll("*")) {
            if (el.shadowRoot) walk(el.shadowRoot);
            if (el.tagName !== "CANVAS" && el.tagName !== "VIDEO") continue;
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            if (r.width < 120 || r.height < 80 || s.visibility === "hidden" || s.display === "none" || r.top + scrollY > 16000) continue;
            el.setAttribute("data-pd-bake", String(out.length));
            out.push([Math.max(0, Math.round(r.left + scrollX)), Math.max(0, Math.round(r.top + scrollY)), Math.round(r.width), Math.round(r.height)]);
            if (out.length >= 12) return;
        } })(document);
        return out;
    })()`);
    for (let i = 0; i < rects.length; i++) {
        const [x, y, width, height] = rects[i];
        try {
            await page.evaluate(`(() => { const st = document.createElement("style"); st.id = "pd-bake-style"; st.textContent = 'body *{visibility:hidden!important}[data-pd-bake="${i}"]{visibility:visible!important}'; document.head.appendChild(st); })()`);
            const shot = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 82, captureBeyondViewport: true, clip: { x, y, width, height, scale: 1 / (page.mobile ? 2 : 1) } });
            await page.evaluate(`(() => { document.getElementById("pd-bake-style")?.remove(); const el = document.querySelector('[data-pd-bake="${i}"]'); if (el) { el.style.setProperty("background", 'url("data:image/jpeg;base64,${shot.data}") 0 0 / 100% 100% no-repeat', "important"); } })()`);
        } catch { await page.evaluate(`document.getElementById("pd-bake-style")?.remove()`).catch(() => {}); }
    }
    return rects.length;
}

/**
 * MHTML stores only the image files the page actually loaded. Each picture is pinned to the one
 * it is showing (srcset, sizes and <source> dropped, in our tab only), so the copy asks for
 * nothing it does not hold.
 */
async function pinImages(page) {
    await page.evaluate(`(async () => {
        const imgs = [];
        (function walk(root) { for (const el of root.querySelectorAll("*")) { if (el.shadowRoot) walk(el.shadowRoot); if (el.tagName === "IMG" && el.currentSrc && el.naturalWidth) imgs.push(el); } })(document);
        for (const img of imgs) {
            const src = img.currentSrc;
            if (img.parentElement?.tagName === "PICTURE") for (const s of [...img.parentElement.querySelectorAll("source")]) s.remove();
            img.removeAttribute("srcset"); img.removeAttribute("sizes"); img.loading = "eager";
            if (img.getAttribute("src") !== src) img.src = src;
        }
        await Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
    })()`);
}
