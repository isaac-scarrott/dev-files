#!/usr/bin/env node
// Web page → Paper artboards. A browser tab is driven over the Chrome DevTools Protocol,
// serialise.js turns the page into Paper-ready HTML, and the HTML goes straight to Paper desktop's
// local MCP endpoint, so it never passes through the agent's context.
//
//   node snap.mjs journey <journey.json> [--only "<screen glob>"] [--widths 390] [--dry-run [--mutate]] [--start <url>]   (schema: SNAPSHOT.md)
//   node snap.mjs snap --url <url> --file F --page P --name "<artboard>"   (one capture; opens its own tab)
//        --width N (default 1440; under 500 is a phone)   --height N   --start <sign-in url, opened first>   --wait <ms | css>
//        --mode full|viewport   --component [css]   --lazy [eager]   --raw   --x N --y N
//        --target <marker>   instead of --url: a tab prepared in the browser PAPER_CDP names
//        --inline-images host[,host]   (journey: "inlineImages": ["host"])  pictures from hosts Paper cannot fetch travel as data URIs
//   node snap.mjs capture --url <url> ... [--out snap.json]   serialise only: prints size, bytes and node counts, writes nothing to Paper
//   node snap.mjs push --in snap.json --file F --page P --name "<artboard>"
//   node snap.mjs layout --file F --page P --title "<band title>" [--groups groups.json | --order "Home,Product"]
//        [--overline ..] [--subtitle ..] [--x N --y N]
//   node snap.mjs targets            (tabs of the browser PAPER_CDP names)
//   node snap.mjs mcp <tool> '<json>'   (raw Paper MCP call)
// Reads, bulk edits and verify live in canvas.mjs.
//
// The browser is the skill's own headless Chrome, started per command (lib.mjs). PAPER_CDP names
// another one; --target then matches a tab's window.__paperSnap or, failing that, a URL substring.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boards, cdpTargets, closeTab, evaluate, fileSize, findTarget, glob, newTab, parseArgs, runDir, sleep, tool } from "./lib.mjs";
import { simplify, countNodes } from "./simplify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHUNK = Number(process.env.PAPER_CHUNK ?? 200_000);
const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

const LAZY_LOAD = (scroll) => `(async () => {
    const all = [];
    const walk = (r) => { for (const e of r.querySelectorAll("*")) { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
    walk(document);
    for (const img of all) if (img.tagName === "IMG" && img.loading === "lazy") img.loading = "eager";
    const scrollers = [document.scrollingElement, ...all.filter((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.clientHeight >= innerHeight * 0.5)];
    for (const s of ${scroll} ? scrollers : []) {
        for (let y = 0; y < s.scrollHeight; y += innerHeight * 0.8) { s.scrollTop = y; await new Promise((r) => setTimeout(r, 150)); }
        s.scrollTop = 0;
    }
    await Promise.race([Promise.all(all.filter((i) => i.tagName === "IMG" && !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 4000))]);
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));
})()`;

// Component captures: the topmost open overlay (dialog, sheet, menu, listbox, popover), plus the
// trigger it hangs from when the two touch (a search field and its popover). Targets are tagged
// with data-paper-component so serialise.js can select them, even inside shadow roots.
const FIND_COMPONENT = (selector) => `(() => {
    const all = [];
    const walk = (r) => { for (const e of r.querySelectorAll("*")) { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
    walk(document);
    const up = (e) => e.parentElement ?? (e.parentNode instanceof ShadowRoot ? e.parentNode.host : null);
    const hit = (x, y) => { let el = document.elementFromPoint(x, y); while (el?.shadowRoot) { const i = el.shadowRoot.elementFromPoint(x, y); if (!i || i === el) break; el = i; } return el; };
    const inside = (a, b) => { for (let e = b; e; e = up(e)) if (e === a) return true; return false; };
    const opaque = (e) => { const c = getComputedStyle(e); return (c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent") || c.boxShadow !== "none"; };
    const visible = (e) => { const r = e.getBoundingClientRect(); return e.checkVisibility() && r.width > 4 && r.height > 4; };
    const vw = innerWidth, vh = innerHeight;
    let target = null;
    const sel = ${JSON.stringify(selector)};
    if (sel) target = all.find((e) => e.matches(sel) && visible(e));
    else {
        const cands = all.filter((e) => { try { return visible(e) && e.matches('[role=dialog],[role=alertdialog],[role=menu],[role=listbox],dialog[open],:popover-open,:modal'); } catch { return false; } });
        const onTop = cands.filter((c) => { const r = c.getBoundingClientRect(); const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 60), 1), vh - 1); return inside(c, hit(x, y)); });
        const pool = onTop.length ? onTop : cands;
        // Innermost wins (role=dialog on a sheet's scroller vs its surface); then a full-screen
        // wrapper is narrowed to its opaque surface.
        target = pool.find((c) => !pool.some((o) => o !== c && inside(c, o))) ?? null;
        if (target) {
            const full = (e) => { const r = e.getBoundingClientRect(); return r.width >= vw - 2 && r.height >= vh - 2; };
            while (target && (full(target) || !opaque(target))) {
                const kids = all.filter((e) => up(e) && inside(target, e) && e !== target && visible(e) && opaque(e) && !full(e));
                const best = kids.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
                if (!best || best === target) break;
                target = best;
            }
        }
    }
    const parts = [];
    if (target) {
        const r = target.getBoundingClientRect();
        target.setAttribute("data-paper-component", "0");
        parts.push({ id: "0", role: "overlay", x: r.left, y: r.top, w: r.width, h: r.height });
        // A sheet or full-width panel stands on its own; only floating overlays take a trigger.
        // Large overlays (dialogs, sheets) stand alone; only small popovers take their trigger.
        let trig = r.width >= vw - 2 || r.width * r.height > vw * vh * 0.3 ? null : all.find((e) => e.getAttribute("aria-expanded") === "true" && visible(e) && !inside(target, e));
        // A bare trigger button sits inside the field that draws the box; take the field.
        const boxed = (e) => { const c = getComputedStyle(e); return opaque(e) || parseFloat(c.borderTopWidth) > 0 || parseFloat(c.borderBottomWidth) > 0; };
        for (let p = trig && up(trig); trig && !boxed(trig) && p && !inside(p, target); p = up(p)) {
            const a = trig.getBoundingClientRect(), b = p.getBoundingClientRect();
            if (b.width > a.width * 1.6 + 8 || b.height > a.height * 1.6 + 8) break;
            trig = p;
        }
        if (trig) {
            const t = trig.getBoundingClientRect();
            const gap = Math.max(r.top - t.bottom, t.top - r.bottom, r.left - t.right, t.left - r.right);
            if (gap <= 16) { trig.setAttribute("data-paper-component", "1"); parts.unshift({ id: "1", role: "trigger", x: t.left, y: t.top, w: t.width, h: t.height }); }
        }
    }
    return { parts };
})()`;
const CLEAR_COMPONENT = `() => { const walk = (r) => { for (const e of r.querySelectorAll("[data-paper-component]")) e.removeAttribute("data-paper-component"); for (const e of r.querySelectorAll("*")) if (e.shadowRoot) walk(e.shadowRoot); }; walk(document); }`;

/** One capture of the tab behind `session`. opts: mode, component, selector, lazy, width, top. */
async function capture(session, opts) {
    // A browser shell can drop the viewport override on navigation, so a capture can silently come
    // out at the pane's size; refuse instead.
    if (opts.width) {
        const w = await evaluate(session, "innerWidth");
        if (w !== Number(opts.width)) throw new Error(`viewport is ${w}px wide, expected ${opts.width}`);
    }
    // lazy "eager": flip lazy images to eager without scrolling (scrolling trips infinite lists).
    if (opts.lazy) await evaluate(session, LAZY_LOAD(opts.lazy !== "eager"));
    if (opts.top) await evaluate(session, "(async () => { scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300)); })()");
    const source = readFileSync(join(HERE, "serialise.js"), "utf8");
    const run = (o) => evaluate(session, `(${source.replace(/;\s*$/, "")})(${JSON.stringify(o)})`);
    let result;
    if (opts.component) {
        const found = await evaluate(session, FIND_COMPONENT(opts.component === true ? null : opts.component));
        if (!found.parts.length) throw new Error("no open overlay found (name the element with a css selector)");
        const parts = [];
        // Sizes come from the serialiser: a dialog grows once its own scroller is unrolled.
        for (const p of found.parts) { const snap = await run({ selector: `[data-paper-component="${p.id}"]`, mode: "component" }); parts.push({ ...p, w: snap.width, h: snap.height, snap }); }
        await evaluate(session, `(${CLEAR_COMPONENT})()`);
        const x0 = Math.min(...parts.map((p) => p.x)), y0 = Math.min(...parts.map((p) => p.y));
        const width = Math.ceil(Math.max(...parts.map((p) => p.x + p.w)) - x0 + 2 * PAD), height = Math.ceil(Math.max(...parts.map((p) => p.y + p.h)) - y0 + 2 * PAD);
        const children = parts.map((p) => ({ open: `<div layer-name="${p.role}" style="position: absolute; left: ${Math.round(p.x - x0 + PAD)}px; top: ${Math.round(p.y - y0 + PAD)}px; width: ${Math.ceil(p.w)}px; height: ${Math.ceil(p.h)}px; display: block;">`, close: "</div>", children: [p.snap.tree] }));
        result = { url: parts[0].snap.url, title: parts[0].snap.title, width, height, background: "#F9F9FA", clip: { x: x0, y: y0, width: width - 2 * PAD, height: height - 2 * PAD, inset: PAD }, stats: { parts: parts.map((p) => p.role), ...parts[0].snap.stats }, tree: { open: `<div layer-name="component" style="position: relative; width: ${width}px; height: ${height}px; display: block;">`, close: "</div>", children } };
    } else {
        result = await run({ selector: opts.selector ?? "html", mode: opts.mode ?? "full" });
        result.clip = { x: 0, y: 0, width: result.width, height: result.height, inset: 0 };
    }
    const inlineHosts = opts.inlineImages ?? (typeof opts["inline-images"] === "string" ? opts["inline-images"].split(",") : []);
    if (inlineHosts.length) result.inlined = await inlineImages(session, result.tree, [].concat(inlineHosts));
    result.bytes = render(result.tree).length;
    return result;
}
const PAD = 24;

// Paper re-hosts image URLs itself and leaves a `….tmp` asset (a broken picture on every other
// machine) when it cannot fetch a host. For the hosts named, the tab that already shows the
// pictures hands them over as data URIs, which Paper uploads at once: at most 1440px on the long
// side, JPEG unless the picture has transparency.
const INLINE_FETCH = `(async (urls) => {
    const out = {};
    const one = async (u) => {
        try {
            const blob = await (await fetch(u)).blob();
            // An SVG has no bitmap to decode: draw it through an <img>, at 4x so icons stay sharp.
            const svg = /svg/.test(blob.type);
            const bmp = svg ? await new Promise((ok, no) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = no; i.src = u; }) : await createImageBitmap(blob);
            if (svg) { bmp.width = (bmp.naturalWidth || 24) * 4; bmp.height = (bmp.naturalHeight || 24) * 4; }
            const k = Math.min(1, 1440 / Math.max(bmp.width, bmp.height));
            const c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
            const g = c.getContext("2d");
            g.drawImage(bmp, 0, 0, c.width, c.height);
            const probe = document.createElement("canvas");
            probe.width = probe.height = 24;
            const pg = probe.getContext("2d");
            pg.drawImage(bmp, 0, 0, 24, 24);
            const px = pg.getImageData(0, 0, 24, 24).data;
            let alpha = false;
            for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
            out[u] = alpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.85);
        } catch { out[u] = null; }
    };
    const queue = [...urls];
    await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await one(queue.shift()); }));
    return out;
})`;
async function inlineImages(session, tree, hosts) {
    const esc = (h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`https?://(?:${hosts.map(esc).join("|")})/(?:(?!&quot;)[^"'()\\s<>])*`, "g");
    const found = new Set();
    const walk = (n, f) => { if (typeof n === "string") return f(n); n.open = f(n.open); n.children = n.children.map((c) => (typeof c === "string" ? f(c) : (walk(c, f), c))); return n; };
    walk(tree, (t) => { for (const m of t.match(re) ?? []) found.add(m); return t; });
    const unescape = (u) => u.replace(/&amp;/g, "&");
    const data = await evaluate(session, `${INLINE_FETCH}(${JSON.stringify([...new Set([...found].map(unescape))])})`);
    // A host that sends no CORS header cannot be read by the tab; fetch those from here instead.
    await Promise.all([...found].map(unescape).filter((u) => !data[u]).map(async (u) => {
        try {
            const r = await fetch(u);
            const type = r.headers.get("content-type")?.split(";")[0] ?? "";
            if (r.ok && /^image\/(png|jpe?g|webp|gif)$/.test(type)) data[u] = `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
        } catch {}
    }));
    let failed = 0;
    for (const u of found) if (!data[unescape(u)]) failed++;
    walk(tree, (t) => t.replace(re, (m) => data[unescape(m)] ?? m));
    return { images: found.size, failed };
}

// ---------- tree ----------
function flatten(children) {
    const out = [];
    for (const c of children) {
        if (typeof c === "string") { if (c) out.push(c); }
        else if (c.open === "") out.push(...flatten(c.children));
        else out.push({ ...c, children: flatten(c.children) });
    }
    return out;
}
function render(n) {
    return typeof n === "string" ? n : n.open + n.children.map(render).join("") + n.close;
}

// ---------- push ----------
let writes = 0;
async function write(fileId, targetNodeId, html) {
    writes++;
    return tool("write_html", { fileId, targetNodeId, mode: "insert-children", html });
}
async function emitChildren(fileId, parentId, children) {
    let batch = "";
    const flush = async () => { if (batch) { await write(fileId, parentId, batch); batch = ""; } };
    for (const c of children) {
        const html = render(c);
        if (html.length > CHUNK && typeof c !== "string" && c.children.length) {
            await flush();
            // An empty element becomes a childless Rectangle in Paper, so open it with as many
            // leading children as fit (or a placeholder to delete), then append the rest.
            let lead = "", n = 0;
            while (n < c.children.length && lead.length + render(c.children[n]).length <= CHUNK) lead += render(c.children[n++]);
            const placeholder = n === 0;
            if (placeholder) lead = `<p style="display: block;">.</p>`;
            const created = await write(fileId, parentId, c.open + lead + c.close);
            const id = created.createdNodes?.[0]?.id;
            if (!id) throw new Error(`write_html returned no node for ${c.open.slice(0, 80)}`);
            await emitChildren(fileId, id, c.children.slice(n));
            if (placeholder) await tool("delete_nodes", { fileId, nodeIds: [created.createdNodes[1].id] });
            continue;
        }
        if (batch.length + html.length > CHUNK) await flush();
        batch += html;
    }
    await flush();
}
function prepare(snap, raw) {
    let tree = { ...snap.tree, children: flatten(snap.tree.children) };
    const before = { bytes: render(tree).length, nodes: countNodes(tree) };
    if (!raw) tree = simplify(tree).tree;
    return { tree, before, bytes: render(tree).length, nodes: countNodes(tree) };
}
/** Writes a capture into a new artboard. opts: file, page, name, raw, x, y. */
async function push(snap, opts) {
    for (const k of ["file", "page", "name"]) if (!opts[k]) throw new Error(`--${k} required`);
    const fileId = opts.file;
    const p = prepare(snap, opts.raw);
    const board = await tool("create_artboard", {
        fileId, pageId: opts.page, name: opts.name,
        styles: { width: `${snap.width}px`, height: `${snap.height}px`, display: "block", overflow: "clip", backgroundColor: snap.background ?? "#FFFFFF" },
    });
    if (opts.x !== undefined && opts.y !== undefined) {
        await tool("update_styles", { fileId, updates: [{ nodeIds: [board.id], styles: { left: `${opts.x}px`, top: `${opts.y}px` } }] });
    }
    try {
        await emitChildren(fileId, board.id, [p.tree]);
    } catch (e) {
        throw new Error(`${e.message} (partial artboard ${board.id} left on the page)`);
    }
    await tool("finish_working_on_nodes", { fileId, nodeIds: [board.id] });
    return { artboardId: board.id, name: opts.name, width: snap.width, height: snap.height, bytes: p.bytes, nodes: p.nodes, raw: p.before, writes };
}

// ---------- journey ----------
const KEYS = { Escape: 27, Enter: 13, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, " ": 32 };
// In-page helpers for the journey: deep (shadow-root) lookups by css selector or by visible text.
const PAGE_HELPERS = `(() => {
    if (window.__pj) return;
    const all = () => { const out = []; const walk = (r) => { for (const e of r.querySelectorAll("*")) { out.push(e); if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document); return out; };
    const label = (e) => (e.getAttribute("aria-label") || e.innerText || e.textContent || e.placeholder || e.value || "").trim().replace(/\\s+/g, " ");
    const CLICKABLE = "button,a,[role=button],[role=menuitem],[role=option],[role=tab],[role=combobox],[role=radio],[role=checkbox],label,summary,input,select,textarea";
    window.__pj = {
        all,
        find(t) {
            const list = all().filter((e) => e.checkVisibility());
            if (t.selector) return list.filter((e) => e.matches(t.selector))[t.nth ?? 0] ?? null;
            const want = t.text.toLowerCase();
            const c = list.filter((e) => e.matches(CLICKABLE));
            const hit = c.filter((e) => label(e).toLowerCase() === want);
            return (hit.length ? hit : c.filter((e) => label(e).toLowerCase().includes(want)))[t.nth ?? 0] ?? null;
        },
        point(t) {
            const e = this.find(t);
            if (!e) return null;
            e.scrollIntoView({ block: "center", inline: "center" });
            const r = e.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            let at = document.elementFromPoint(x, y);
            while (at?.shadowRoot) { const i = at.shadowRoot.elementFromPoint(x, y); if (!i || i === at) break; at = i; }
            let reachable = false;
            for (let n = at; n; n = n.parentElement ?? n.parentNode?.host) if (n === e) reachable = true;
            if (!reachable && at && e.contains(at)) reachable = true;
            window.__pjLast = e;
            return { x, y, reachable };
        },
        labels() { const seen = new Set(); for (const e of all()) if (e.checkVisibility() && e.matches(CLICKABLE)) { const r = e.getBoundingClientRect(); const l = label(e).slice(0, 24); if (l && r.bottom > 0 && r.top < innerHeight) seen.add(l); } return [...seen].slice(0, 14); },
        hasText(s) { return all().some((e) => e.children.length === 0 && e.checkVisibility() && (e.textContent || "").includes(s)); },
        async idle(ms) {
            const end = Date.now() + ms;
            let last = -1, calm = 0;
            while (Date.now() < end) {
                const n = document.readyState === "complete" ? all().length + [...document.images].filter((i) => !i.complete).length * 1000 : -Date.now();
                calm = n === last ? calm + 1 : 0;
                last = n;
                if (calm >= 2) break;
                await new Promise((r) => setTimeout(r, 300));
            }
            await document.fonts.ready;
        },
    };
})()`;
/** Evaluates an expression with the helpers present, whatever document the tab holds now. */
const pj = (session, expr) => evaluate(session, `(${PAGE_HELPERS}, ${expr})`);
export async function navigate(session, url) {
    const before = await evaluate(session, "performance.timeOrigin").catch(() => 0);
    await session.send("Page.navigate", { url });
    const end = Date.now() + 30_000;
    while (Date.now() < end) {
        await sleep(200);
        const now = await evaluate(session, "document.readyState === 'complete' ? performance.timeOrigin : 0").catch(() => 0);
        if (now && now !== before) return;
    }
    throw new Error(`navigation timed out: ${url}`);
}
const asTarget = (t) => (typeof t === "string" ? { text: t } : t);
export async function setViewport(session, width, j) {
    const mobile = width < 500, height = j.height ?? (mobile ? 844 : 900);
    const set = (k) => session.send("Emulation.setDeviceMetricsOverride", { width: Math.round(width * k), height: Math.round(height * k), deviceScaleFactor: mobile ? 2 : 1, mobile });
    await set(1);
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: mobile }).catch(() => {});
    // A browser zoom remembered for this origin scales the layout viewport; size the window so the
    // page still lays out at the asked width.
    const inner = await evaluate(session, "innerWidth").catch(() => width);
    if (inner && Math.abs(inner - width) > 2) { await set(width / inner); await sleep(300); }
}
async function mouse(session, type, p, extra = {}) {
    await session.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1, ...extra });
}
async function waitFor(session, w) {
    if (typeof w === "number") return sleep(w);
    if (w === "idle" || w === undefined) return pj(session, "__pj.idle(8000)");
    const test = w.selector ? `!!__pj.find(${JSON.stringify({ selector: w.selector })})` : w.gone ? `!__pj.hasText(${JSON.stringify(w.gone)})` : `__pj.hasText(${JSON.stringify(w.text)})`;
    const end = Date.now() + (w.timeout ?? 10_000);
    while (Date.now() < end) { if (await pj(session, test).catch(() => false)) return; await sleep(250); }
    throw new Error(`wait timed out: ${JSON.stringify(w)}`);
}
/** One action: {click}, {hover}, {type:{into,text,clear}}, {key}, {wait}, {scroll}, {eval}. */
async function act(session, a) {
    if (a.click !== undefined || a.hover !== undefined) {
        const t = asTarget(a.click ?? a.hover);
        let p = null;
        for (let i = 0; i < 20 && !p; i++) { p = await pj(session, `__pj.point(${JSON.stringify(t)})`); if (!p) await sleep(250); }
        if (!p) {
            // Name what is on screen, so the journey can be corrected without a look at the page.
            const seen = await pj(session, "__pj.labels()").catch(() => []);
            throw new Error(`nothing to ${a.click !== undefined ? "click" : "hover"}: ${JSON.stringify(t)} | on screen: ${seen.join(" / ")}`);
        }
        await mouse(session, "mouseMoved", p, { button: "none" });
        if (a.click !== undefined) {
            // A covered target (sticky bar over it, zero-size hit box) takes a DOM click instead.
            if (p.reachable) { await mouse(session, "mousePressed", p); await mouse(session, "mouseReleased", p); }
            // (pointer events first: menu and popover triggers open on pointerdown, not on click)
            else await evaluate(session, `(() => { const e = __pjLast; for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) e.dispatchEvent(new (t[0] === "p" ? PointerEvent : MouseEvent)(t, { bubbles: true, composed: true, button: 0 })); e.click(); })()`);
        }
        await sleep(a.settle ?? 400);
    } else if (a.type !== undefined) {
        if (a.type.into) await act(session, { click: a.type.into, settle: 150 });
        if (a.type.clear) { await evaluate(session, "(() => { const e = document.activeElement?.shadowRoot?.activeElement ?? document.activeElement; let d = e; while (d?.shadowRoot?.activeElement) d = d.shadowRoot.activeElement; d?.select?.(); })()"); await key(session, "Backspace"); }
        await session.send("Input.insertText", { text: a.type.text });
        await sleep(200);
    } else if (a.key !== undefined) { await key(session, a.key); await sleep(300); }
    else if (a.wait !== undefined) await waitFor(session, a.wait);
    else if (a.scroll !== undefined) await pj(session, a.scroll === "top" ? "scrollTo(0,0)" : a.scroll === "bottom" ? "scrollTo(0, document.documentElement.scrollHeight)" : `(__pj.find(${JSON.stringify(asTarget(a.scroll))})?.scrollIntoView({ block: "start" }), 1)`);
    else if (a.eval !== undefined) await evaluate(session, `(async () => { ${a.eval} })()`);
    else throw new Error(`unknown action ${JSON.stringify(a)}`);
}
async function key(session, k) {
    const base = { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: KEYS[k] ?? k.toUpperCase().charCodeAt(0) };
    await session.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await session.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
function stepActions(step) {
    const list = [];
    for (const k of ["click", "hover", "type", "key"]) if (step[k] !== undefined) list.push({ [k]: step[k] });
    return [...list, ...(step.do ?? [])];
}
/** The source picture verify compares a frame with: the region the capture covered, at half scale. */
async function sourceShot(session, snap, mode, path) {
    const c = snap.clip;
    const clip = mode === "viewport" ? undefined : { x: c.x, y: c.y, width: c.width, height: Math.min(c.height, 12_000), scale: 1 };
    const metrics = await evaluate(session, "[devicePixelRatio, scrollX, scrollY]");
    if (clip && mode === "component") { clip.x += metrics[1]; clip.y += metrics[2]; }
    if (clip) clip.scale = 0.5 / metrics[0];
    const r = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: mode !== "viewport", ...(clip ? { clip } : {}) });
    writeFileSync(path, Buffer.from(r.data, "base64"));
}
async function journey() {
    const j = JSON.parse(readFileSync(rest[0], "utf8"));
    const dry = !!args["dry-run"], only = args.only ? glob(args.only) : null;
    if (!dry) for (const k of ["file", "page"]) if (!j[k]) throw new Error(`journey.${k} required`);
    if (args.widths) j.widths = String(args.widths).split(",").map(Number);
    const own = !j.tab;
    const session = own ? await newTab() : await findTarget(j.tab);
    const dir = runDir(j.file ?? "dry", j.page ?? "run");
    const manifest = [];
    let ok = 0, failed = 0, skipped = 0;
    const projected = { bytes: 0, layers: 0 };
    try {
        // --start <url>: where the journey's tab begins, given on the command line so a one-time
        // sign-in link is never written into the journey file.
        // Where it lands is kept in memory, and each later width pass begins there again.
        let landed = null;
        if (args.start) { await setViewport(session, (j.widths ?? [1440])[0], j); await navigate(session, args.start); await waitFor(session, "idle"); landed = await evaluate(session, "location.href"); }
        for (const width of j.widths ?? [1440, 390]) {
            await setViewport(session, width, j);
            if (landed && width !== (j.widths ?? [1440, 390])[0]) { await navigate(session, landed); await setViewport(session, width, j); await waitFor(session, "idle"); }
            for (const step of j.steps) {
                if (step.widths && !step.widths.includes(width)) continue;
                if (only && !only.test(step.screen)) continue;
                const name = `${step.screen} · ${width} · ${j.brand} · ${step.state ?? "default"}`;
                // A step that changes data on the site runs only when asked to: a dry run still clicks.
                if (step.mutates && dry && !args.mutate) { skipped++; console.log(`skip  ${name} | mutates: ${step.mutates === true ? "data" : step.mutates}`); continue; }
                try {
                    if (step.url) {
                        await navigate(session, step.url); await setViewport(session, width, j);
                        // stylesheets: fonts the page names but does not load itself (a component harness).
                        if (j.stylesheets) await evaluate(session, `(async () => { for (const h of ${JSON.stringify(j.stylesheets)}) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = h; document.head.appendChild(l); await new Promise((r) => { l.onload = l.onerror = r; }); } await document.fonts.ready; })()`);
                        await waitFor(session, "idle");
                    }
                    for (const a of stepActions(step)) await act(session, a);
                    if (step.wait !== undefined) await waitFor(session, step.wait);
                    if (step.capture) {
                        const mode = step.capture;
                        const snap = await capture(session, { mode: mode === "component" ? undefined : mode, component: mode === "component" ? step.selector ?? true : undefined, selector: mode === "component" ? undefined : step.selector, lazy: mode === "full" ? step.lazy ?? true : undefined, width, inlineImages: j.inlineImages });
                        if (dry) { const p = prepare(snap, false); projected.bytes += p.bytes; projected.layers += p.nodes; console.log(`dry   ${name} | ${snap.width}x${snap.height} | ${p.bytes} bytes | ${p.nodes} layers`); ok++; }
                        else {
                            const out = await push(snap, { file: j.file, page: step.page ?? j.page, name });
                            const shot = join(dir, `${out.artboardId}.png`);
                            await sourceShot(session, snap, mode, shot).catch(() => {});
                            manifest.push({ artboardId: out.artboardId, name, shot, mode, inset: snap.clip.inset, width: snap.clip.width, height: snap.clip.height });
                            console.log(`ok    ${name} | ${out.artboardId} | ${out.width}x${out.height} | ${out.bytes} bytes`);
                            ok++;
                        }
                    }
                } catch (e) {
                    failed++;
                    console.log(`FAIL  ${name} | ${e.message.split("\n")[0].slice(0, 420)}`);
                    if (/file is too large/i.test(e.message)) throw e;
                }
                for (const a of [].concat(step.restore ?? [])) await act(session, typeof a === "string" ? { key: a } : a).catch(() => {});
            }
        }
    } finally {
        if (manifest.length) {
            let prior = [];
            try { prior = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")); } catch {}
            writeFileSync(join(dir, "run.json"), JSON.stringify([...prior, ...manifest], null, 1));
        }
        if (own) await closeTab(session); else session.close();
    }
    if (j.title && !dry && !only && ok) { const l = await layout({ file: j.file, page: j.page, title: j.title, overline: j.overline, subtitle: j.subtitle, order: (j.order ?? [...new Set(j.steps.map((s) => s.screen))]).join(",") }); console.log(`layout ${l.groups} groups | band ${l.size.w}x${l.size.h}`); }
    if (dry) {
        const z = j.file ? await fileSize(j.file).catch(() => null) : null;
        console.log(`would add ${projected.layers} layers, ~${Math.round(projected.bytes / 1024)} KB${z ? ` | file now ${z.layers} layers, ~${Math.round(z.bytes / 1024)} KB` : ""}`);
    }
    console.log(`${ok} captured, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}${dry ? "" : ` | verify: node canvas.mjs verify --file ${j.file} --page ${j.page}`}`);
}

// ---------- layout ----------
// One graphite band (#24272C) per journey: a title block, then one page group (#33373D, white
// label) per screen stacked top to bottom; inside a group the frames run left to right in one row.
const GAP = 80, GROUP_GAP = 240, GROUP_PAD = 120, LABEL_SPACE = 360, BAND_PAD = 240, TITLE_SPACE = 900;
const stateRank = (name) => { const st = name.split(" · ")[3] ?? ""; if (/\(from code\)/.test(st)) return 3; return /^default\b/.test(st) ? 0 : 1; };
/** Groups from artboard names `<Screen> · <width> · <brand> · <state>`: desktop first, defaults first, notes last. */
function deriveGroups(list, order) {
    const frames = list.filter((b) => / · \d+ · /.test(b.name));
    const screens = order?.length ? order : [...new Set(frames.map((b) => b.name.split(" · ")[0]))];
    const groups = screens.map((name) => {
        const items = frames.filter((b) => b.name.startsWith(`${name} · `)).sort((a, b) => {
            const wa = Number(a.name.split(" · ")[1]), wb = Number(b.name.split(" · ")[1]);
            return (stateRank(a.name) === 3) - (stateRank(b.name) === 3) || wb - wa || stateRank(a.name) - stateRank(b.name) || a.name.localeCompare(b.name);
        });
        // A "(next)" frame, an approved change, sits directly after the frame it changes.
        for (const n of items.filter((b) => / \(next\)$/.test(b.name))) {
            const base = items.findIndex((b) => b.name === n.name.replace(/ \(next\)$/, ""));
            items.splice(items.indexOf(n), 1);
            items.splice(base >= 0 ? items.indexOf(items.find((b) => b.name === n.name.replace(/ \(next\)$/, ""))) + 1 : items.length, 0, n);
        }
        const widths = [...new Set(items.map((b) => b.name.split(" · ")[1]))].join(", ");
        const fromCode = items.filter((b) => stateRank(b.name) === 3).length;
        return { name, views: fromCode ? `${items.length - fromCode} captured · ${fromCode} from code` : `${items.length} frames · ${widths}`, artboards: items.map((b) => b.id) };
    }).filter((g) => g.artboards.length);
    const notes = list.filter((b) => /^Notes\b/.test(b.name));
    if (notes.length) groups.push({ name: "Notes", views: "", artboards: notes.map((b) => b.id) });
    return groups;
}
async function layout(o) {
    for (const k of ["file", "page", "title"]) if (!o[k]) throw new Error(`--${k} required`);
    const fileId = o.file, pageId = o.page;
    let { list } = await boards(fileId, pageId);
    // A previous layout's backgrounds and title are superseded by this one.
    const stale = list.filter((b) => / · background$/.test(b.name) || b.name === o.title);
    if (stale.length) await tool("delete_nodes", { fileId, nodeIds: stale.map((b) => b.id) });
    list = list.filter((b) => !stale.includes(b));
    const groups = o.groups ? JSON.parse(readFileSync(o.groups, "utf8")) : deriveGroups(list, o.order ? String(o.order).split(",").map((s) => s.trim()) : null);
    if (!groups.length) throw new Error("no frames named `<Screen> · <width> · <brand> · <state>` on the page");
    const placed = new Set(groups.flatMap((g) => g.artboards));
    const others = list.filter((a) => !placed.has(a.id));
    const x0 = Number(o.x ?? 0);
    const y0 = o.y !== undefined ? Number(o.y) : others.length ? Math.max(...others.map((a) => a.y + (a.h ?? 0))) + 400 : 0;
    const sizes = new Map(list.map((b) => [b.id, { w: b.w, h: b.h }]));
    // fit-content frames report no height until measured.
    for (const id of placed) if (!sizes.get(id)?.h || !sizes.get(id)?.w) { const n = await tool("get_node_info", { fileId, nodeId: id }); sizes.set(id, { w: n.width ?? 1440, h: n.height ?? 900 }); }

    const styleUpdates = [], groupBoxes = [];
    const gx = x0 + BAND_PAD;
    let gy = y0 + TITLE_SPACE;
    for (const g of groups) {
        let sx = gx + GROUP_PAD, maxH = 0;
        for (const id of g.artboards) {
            const { w, h } = sizes.get(id);
            styleUpdates.push({ nodeIds: [id], styles: { left: `${sx}px`, top: `${gy + LABEL_SPACE}px` } });
            sx += w + GAP; maxH = Math.max(maxH, h);
        }
        const box = { g, y: gy, width: sx - GAP + GROUP_PAD - gx, height: LABEL_SPACE + maxH + GROUP_PAD };
        groupBoxes.push(box);
        gy += box.height + GROUP_GAP;
    }
    const bandW = Math.max(...groupBoxes.map((b) => b.width), 4800) + 2 * BAND_PAD;
    const bandH = gy - GROUP_GAP + BAND_PAD - y0;
    const band = await tool("create_artboard", { fileId, pageId, name: `${o.title} · background`, styles: { width: `${bandW}px`, height: `${bandH}px`, backgroundColor: "#24272C", borderRadius: "48px" } });
    styleUpdates.push({ nodeIds: [band.id], styles: { left: `${x0}px`, top: `${y0}px` } });
    const title = await tool("create_artboard", { fileId, pageId, name: o.title, styles: { width: "4800px", height: "560px", backgroundColor: "#24272C", display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px" } });
    styleUpdates.push({ nodeIds: [title.id], styles: { left: `${x0 + BAND_PAD}px`, top: `${y0 + 200}px` } });
    await write(fileId, title.id, `<div style="font-family: Lato; font-size: 48px; line-height: 56px; letter-spacing: 0.06em; text-transform: uppercase; color: #B4B9C1;">${escapeHtml(o.overline ?? "Snapshot")}</div><div style="font-family: Geologica; font-weight: 700; font-size: 200px; line-height: 208px; letter-spacing: -0.025em; color: #FFFFFF;">${escapeHtml(o.title)}</div>${o.subtitle ? `<div style="font-family: Lato; font-size: 56px; line-height: 76px; max-width: 3600px; color: #B4B9C1;">${escapeHtml(o.subtitle)}</div>` : ""}`);
    const moves = [{ nodeId: band.id, parentId: "root", index: 0 }];
    let after = band.id;
    for (const b of groupBoxes) {
        const bg = await tool("create_artboard", { fileId, pageId, name: `${b.g.name} · background`, styles: { width: `${b.width}px`, height: `${b.height}px`, backgroundColor: "#33373D", borderRadius: "32px", display: "flex", flexDirection: "column", paddingTop: "110px", paddingLeft: "120px", gap: "16px" } });
        styleUpdates.push({ nodeIds: [bg.id], styles: { left: `${gx}px`, top: `${b.y}px` } });
        await write(fileId, bg.id, `<div layer-name="Page label" style="display: flex; align-items: baseline; gap: 32px;"><div layer-name="Page name" style="font-family: Geologica; font-weight: 700; font-size: 120px; line-height: 128px; letter-spacing: -0.02em; color: #FFFFFF;">${escapeHtml(b.g.name)}</div>${b.g.views ? `<div layer-name="Page views" style="font-family: Lato; font-size: 48px; line-height: 56px; color: #B4B9C1;">${escapeHtml(b.g.views)}</div>` : ""}</div>`);
        moves.push({ nodeId: bg.id, after });
        after = bg.id;
    }
    await tool("update_styles", { fileId, updates: styleUpdates });
    await tool("move_nodes", { fileId, moves });
    // Working indicators belong to this script's MCP session, so release them here.
    await tool("finish_working_on_nodes", { fileId, nodeIds: [band.id, title.id, ...moves.slice(1).map((m) => m.nodeId), ...placed] });
    return { band: band.id, title: title.id, origin: { x: x0, y: y0 }, size: { w: bandW, h: bandH }, groups: groupBoxes.length, superseded: stale.length, unplaced: others.map((b) => b.name) };
}
function escapeHtml(s) {
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// ---------- main ----------
/** The tab a single capture reads: its own, opened and prepared here (--url), or one prepared in the PAPER_CDP browser (--target). */
async function withTarget(fn) {
    if (args.target) { const session = await findTarget(args.target); try { return await fn(session); } finally { session.close(); } }
    if (!args.url || args.url === true) throw new Error("--url required (or --target for a tab prepared in the browser PAPER_CDP names)");
    const session = await newTab();
    try {
        const width = Number(args.width ?? 1440), j = args.height ? { height: Number(args.height) } : {};
        await setViewport(session, width, j);
        // --start: a one-time sign-in link, opened first so the page loads signed in.
        for (const url of [args.start, args.url]) if (typeof url === "string") { await navigate(session, url); await setViewport(session, width, j); await waitFor(session, "idle"); }
        if (typeof args.wait === "string") await waitFor(session, /^\d+$/.test(args.wait) ? Number(args.wait) : { selector: args.wait });
        return await fn(session);
    } finally { await closeTab(session); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
    try {
        let out;
        if (command === "journey") { await journey(); process.exit(0); }
        else if (command === "targets") out = (await cdpTargets()).map((t) => t.url);
        else if (command === "capture") { const r = await withTarget((s) => capture(s, args)); if (args.out) writeFileSync(args.out, JSON.stringify(r)); const p = prepare(r, !!args.raw); out = { width: r.width, height: r.height, bytes: p.bytes, nodes: p.nodes, beforeSimplify: p.before, stats: r.stats, title: r.title }; }
        else if (command === "push") out = await push(JSON.parse(readFileSync(args.in, "utf8")), args);
        else if (command === "snap") { const r = await withTarget((s) => capture(s, args)); out = { ...(await push(r, args)), stats: r.stats }; }
        else if (command === "layout") out = await layout(args);
        else if (command === "mcp") out = await tool(rest[0], JSON.parse(rest[1] ?? "{}"));
        else throw new Error("usage: snap.mjs journey | snap | capture | push | layout | targets | mcp  (see header)");
        console.log(JSON.stringify(out, null, 1));
    } catch (e) {
        console.error(`paper: ${e.message}`);
        process.exit(1);
    }
}
