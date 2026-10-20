#!/usr/bin/env node
// Lists how a built web page differs from a Paper frame, one line per difference, largest first.
// It reports; which side is right is the owner's call. Reads only: nothing is written to Paper or the page's data.
//
//   node fidelity.mjs --file <paperFileId> --node <frameId> --url <built page url>
//        --width N        viewport width (default: the frame's width)
//        --ready '<css>'  wait until this selector is visible (shadow roots are searched)
//        --json           everything, as JSON (default: compact text, the 40 largest differences)
//        --inject <file.css|file.js>   testing aid: apply CSS (to the document and every open shadow root) or run
//                         JS once the page has settled, to plant differences and check they are reported
//   exit 0: no difference beyond tolerance   1: differences   2: the comparison could not be made
//
// Both sides are measured by one function in one browser tab: the page as loaded, then the frame's
// get_jsx export laid out inside an isolated shadow root (Paper reports no position or size for
// auto-sized layers, so the browser's layout of the export stands in for Paper's).
import { readFileSync } from "node:fs";
import { closeTab, evaluate, newTab, parseArgs, sleep, tool } from "./lib.mjs";
import { navigate, setViewport } from "./snap.mjs";
import { exportFrame, html } from "./transfer.mjs";
import { comparePictures, paperShot } from "./canvas.mjs";

const args = parseArgs(process.argv.slice(2));
const TOLERANCE_PX = 4, TOLERANCE_RATIO = 0.02, JND = 2.3, CAP = 40, SETTLE_MS = 45_000;
const HALF = 0.5; // a frame section taller than this share of the frame is split into its children
const PAIR_PX = 24; // unmatched texts this close (relative to their sections) are one text reworded

class Unusable extends Error {}

// ---------- in the tab ----------
// Elements of the composed tree (shadow roots and slots followed) in document order:
// { p: parent index, x, y, w, h, leaf?: a childless box that paints, t?: text with its computed style }.
// A text is one block of inline content ("<b>2</b> hr 30 min" is one text, as Paper holds it in one layer).
// Left out: display:none, opacity:0, boxes clipped away by an ancestor or parked beside the viewport.
const MEASURE = `(root) => {
    const out = [], W = innerWidth;
    const ctx = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
    const seen = new Map();
    const rgba = (c) => { if (!seen.has(c)) { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); seen.set(c, [...ctx.getImageData(0, 0, 1, 1).data]); } return seen.get(c); };
    const SKIP = new Set(["script", "style", "template", "noscript", "link", "meta", "head", "title", "option"]);
    const LEAF = new Set(["svg", "img", "picture", "video", "canvas", "iframe"]);
    const kids = (e) => (e.shadowRoot ? [...e.shadowRoot.children] : e.localName === "slot" && e.assignedElements({ flatten: true }).length ? e.assignedElements({ flatten: true }) : [...e.children]);
    const nodes = (e) => (e.shadowRoot ? [...e.shadowRoot.childNodes] : e.localName === "slot" && e.assignedNodes({ flatten: true }).length ? e.assignedNodes({ flatten: true }) : [...e.childNodes]);
    // The text of e when everything inside it is inline, else null.
    const inlineText = (e) => {
        let s = "";
        for (const n of nodes(e)) {
            if (n.nodeType === 3) s += n.nodeValue;
            else if (n.nodeType === 1) {
                if (n.localName === "br") { s += " "; continue; }
                const d = getComputedStyle(n).display;
                if (d === "none") continue;
                const inner = d === "inline" && !LEAF.has(n.localName) ? inlineText(n) : null;
                if (inner === null) return null;
                s += inner;
            }
        }
        return s;
    };
    const clean = (s) => s.replace(/\\s+/g, " ").trim();
    const paints = (cs) => cs.backgroundImage !== "none" || cs.maskImage !== "none" || rgba(cs.backgroundColor)[3] > 0;
    const walk = (e, p, clip) => {
        if (SKIP.has(e.localName) || e.id === "__fidelity") return;
        const cs = getComputedStyle(e);
        if (cs.display === "none" || Number(cs.opacity) === 0) return;
        const r = e.getBoundingClientRect(), x = r.left + scrollX, y = r.top + scrollY, boxed = r.width > 0 && r.height > 0;
        if (boxed && (r.right <= 0 || r.left >= W || x + r.width <= clip.x0 || x >= clip.x1 || y + r.height <= clip.y0 || y >= clip.y1)) return;
        const node = { p, x, y, w: r.width, h: r.height };
        const i = out.push(node) - 1;
        if (LEAF.has(e.localName)) { if (boxed) node.leaf = true; return; }
        const whole = inlineText(e);
        const text = clean(whole ?? nodes(e).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(" "));
        if (!text && !kids(e).length && r.width >= 4 && r.height >= 4 && paints(cs)) node.leaf = true;
        if (text && cs.visibility !== "hidden" && r.width > 1 && r.height > 1) {
            // Its style is read from the innermost element that wraps the whole text.
            let inner = e;
            for (let only; whole !== null && (only = nodes(inner).filter((n) => n.nodeType === 1 || n.nodeValue.trim())).length === 1 && only[0].nodeType === 1; ) inner = only[0];
            const ts = getComputedStyle(inner), range = document.createRange();
            const glyphs = (n) => (n.nodeType === 3 ? (range.selectNode(n), [...range.getClientRects()]) : n.nodeType === 1 ? nodes(n).flatMap(glyphs) : []);
            const lines = glyphs(inner).filter((q) => q.width > 0);
            // The glyphs' own edges: a padded button and a bare text layer then agree on where the text is.
            if (lines.length) { node.tx = Math.min(...lines.map((q) => q.left)) + scrollX; node.tw = Math.max(...lines.map((q) => q.right)) + scrollX - node.tx; }
            // "normal" has no number to compare, so the height of the line the browser drew stands in for it.
            const normal = ts.lineHeight === "normal";
            node.t = { s: text, size: parseFloat(ts.fontSize), weight: Number(ts.fontWeight), line: normal ? lines[0]?.height ?? null : parseFloat(ts.lineHeight), normal, colour: rgba(ts.color), family: ts.fontFamily.split(",")[0].replace(/["']/g, "").trim() };
        }
        // A scroller is measured unrolled, so only a box that cannot scroll that way clips its content.
        const next = { ...clip };
        if (boxed && cs.overflowX !== "visible") { next.x0 = Math.max(clip.x0, x); next.x1 = Math.min(clip.x1, x + r.width); }
        if (boxed && (cs.overflowY === "hidden" || cs.overflowY === "clip")) { next.y0 = Math.max(clip.y0, y); next.y1 = Math.min(clip.y1, y + r.height); }
        else if (cs.overflowY !== "visible") { next.y0 = -Infinity; next.y1 = Infinity; }
        if (whole !== null) return;
        for (const c of kids(e)) walk(c, i, next);
    };
    walk(root, -1, { x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity });
    return out;
}`;
// What still keeps the page from being settled, or "" when nothing does. Two calls 400ms apart must agree on the layout.
const UNSETTLED = `(ready) => {
    const all = []; const walk = (r) => { for (const e of r.querySelectorAll("*")) { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document);
    if (document.readyState !== "complete") return "document still loading";
    if (document.fonts.status !== "loaded") return "fonts still loading";
    const pending = all.filter((e) => e.localName === "img" && !e.complete && e.checkVisibility() && (e.loading !== "lazy" || e.getBoundingClientRect().top < innerHeight));
    if (pending.length) return pending.length + " images still loading";
    if (ready && !all.some((e) => e.matches(ready) && e.checkVisibility())) return "--ready selector not visible: " + ready;
    const layout = all.length + ":" + all.reduce((n, e) => Math.max(n, e.scrollHeight), 0);
    const calm = window.__fidelityLayout === layout;
    window.__fidelityLayout = layout;
    return calm ? "" : "layout still changing";
}`;
const DECODE = `(async () => { const imgs = []; const walk = (r) => { for (const e of r.querySelectorAll("*")) { if (e.localName === "img" && e.complete && e.naturalWidth) imgs.push(e); if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document); await Promise.allSettled(imgs.map((i) => i.decode())); await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); })()`;
const INJECT_CSS = `(css) => { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); const walk = (r) => { r.adoptedStyleSheets = [...r.adoptedStyleSheets, sheet]; for (const e of r.querySelectorAll("*")) if (e.shadowRoot) walk(e.shadowRoot); }; walk(document); }`;
// The frame's export inside a shadow root: the page's fonts apply, its style rules do not.
const MOUNT_FRAME = `(markup, width) => {
    const host = document.createElement("div");
    host.id = "__fidelity";
    host.style.cssText = "all: initial; position: absolute; left: 0; top: 0; display: block; width: " + width + "px;";
    host.attachShadow({ mode: "open" }).innerHTML = markup;
    document.documentElement.append(host);
    scrollTo(0, 0);
    return document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}`;

/** Network idle, fonts loaded, images in, --ready visible and the layout still; throws Unusable if it never happens. */
async function settle(tab, ready) {
    const inflight = new Map();
    let last = Date.now();
    const done = ({ requestId }) => { inflight.delete(requestId); last = Date.now(); };
    tab.on("Network.requestWillBeSent", ({ requestId, type }) => { if (type !== "WebSocket" && type !== "EventSource") inflight.set(requestId, Date.now()); last = Date.now(); });
    tab.on("Network.loadingFinished", done);
    tab.on("Network.loadingFailed", done);
    return async () => {
        const end = Date.now() + SETTLE_MS;
        let why = "";
        while (Date.now() < end) {
            await sleep(400);
            // A request open for over 10s is a long poll, not page content.
            const open = [...inflight.values()].filter((since) => Date.now() - since < 10_000).length;
            if (open) { why = `${open} requests in flight`; continue; }
            if (Date.now() - last < 500) { why = "network active"; continue; }
            why = await evaluate(tab, `(${UNSETTLED})(${JSON.stringify(ready ?? null)})`).catch((e) => e.message);
            if (!why) return evaluate(tab, DECODE);
        }
        throw new Unusable(`page did not settle in ${SETTLE_MS / 1000}s: ${why}`);
    };
}

// ---------- sections ----------
const norm = (s) => s.toLowerCase();
const byPlace = (a, b) => Math.round(a.y / 8) - Math.round(b.y / 8) || a.x - b.x;
/** Adds index, subtree end and children to each node. */
function index(nodes) {
    nodes.forEach((n, i) => { n.i = i; n.end = i + 1; n.kids = []; });
    for (let i = nodes.length - 1; i > 0; i--) { const p = nodes[nodes[i].p]; p.end = Math.max(p.end, nodes[i].end); p.kids.unshift(nodes[i]); }
    return nodes;
}
const textsIn = (nodes, n) => nodes.slice(n.i, n.end).filter((m) => m.t);
/** Fills in what a section's neighbours decide: the gap to the nearest section above, and whether it starts or ends its row. */
function place(sections) {
    for (const s of sections) {
        const above = sections.filter((o) => o !== s && o.y + o.height <= s.y + 1);
        s.gap = above.length ? s.y - Math.max(...above.map((o) => o.y + o.height)) : null;
        const row = sections.filter((o) => Math.min(o.y + o.height, s.y + s.height) - Math.max(o.y, s.y) > Math.min(o.height, s.height) / 2);
        s.first = row.every((o) => o.x >= s.x - 1);
        s.last = row.every((o) => o.x + o.width <= s.x + s.width + 1);
    }
}
/** A block as a section: its texts, its heading (largest text, first on a tie) and its content's edges. */
function section(nodes, block, width) {
    const texts = textsIn(nodes, block).sort(byPlace);
    const heading = texts.reduce((best, t) => (t.t.size > best.t.size ? t : best), texts[0]);
    const content = nodes.slice(block.i, block.end).filter((m) => m.t || m.leaf);
    return { block, texts, heading, name: heading.t.s, x: block.x, y: block.y, width: block.w, height: block.h, left: Math.min(...content.map((m) => m.tx ?? m.x)), right: width - Math.max(...content.map((m) => (m.tx ?? m.x) + (m.tw ?? m.w))) };
}
/** The frame's sections: top-level children that hold text, looking through lone wrappers and splitting a child over half the frame's height. */
function frameSections(nodes, width) {
    const limit = nodes[0].h * HALF;
    const split = (n, top) => {
        const kids = n.kids.filter((k) => textsIn(nodes, k).length);
        if (n.t || !kids.length || (!top && n.h <= limit)) return [n];
        const parts = kids.flatMap((k) => split(k, false));
        return kids.length === 1 && parts[0] === kids[0] ? [n] : parts;
    };
    const list = split(nodes[0], true).map((b) => section(nodes, b, width)).sort(byPlace);
    place(list);
    return list;
}
/** Pairs each frame section with the largest page block that holds its heading and no other section's. */
function matchSections(frame, page, width) {
    const pageTexts = new Map();
    for (const n of page) if (n.t) pageTexts.set(norm(n.t.s), [...(pageTexts.get(norm(n.t.s)) ?? []), n]);
    const anchors = new Map(); // frame section → page text node
    const taken = new Set();
    // Of several page texts with the wording, the one nearest the frame's position.
    const nearest = (text, free) => (pageTexts.get(norm(text.t.s)) ?? []).filter(free).sort((a, b) => Math.hypot(a.x - text.x, a.y - text.y) - Math.hypot(b.x - text.x, b.y - text.y))[0];
    for (const s of frame) { const hit = nearest(s.heading, (n) => !taken.has(n)); if (hit) { anchors.set(s, hit); taken.add(hit); } }
    const blockOf = (anchor) => {
        let b = anchor;
        while (b.p > 0 && ![...taken].some((a) => a !== anchor && a.i >= page[b.p].i && a.i < page[b.p].end)) b = page[b.p];
        return b;
    };
    // A section whose heading is not on the page is found by its other texts, when at least half of them sit in one unclaimed block.
    for (const s of frame.filter((x) => !anchors.has(x))) {
        const claimed = [...anchors.values()].map(blockOf);
        const free = (n) => !taken.has(n) && !claimed.some((b) => n.i >= b.i && n.i < b.end);
        const others = s.texts.filter((t) => t !== s.heading);
        for (const t of [...others].sort((a, b) => b.t.size - a.t.size)) {
            const hit = nearest(t, free);
            if (!hit) continue;
            taken.add(hit);
            const inside = new Map();
            for (const m of textsIn(page, blockOf(hit))) inside.set(norm(m.t.s), (inside.get(norm(m.t.s)) ?? 0) + 1);
            const found = others.filter((o) => { const k = norm(o.t.s); if (!inside.get(k)) return false; inside.set(k, inside.get(k) - 1); return true; }).length;
            if (found * 2 >= others.length) { anchors.set(s, hit); break; }
            taken.delete(hit);
        }
    }
    const pairs = [...anchors].map(([f, anchor]) => ({ frame: f, built: section(page, blockOf(anchor), width) }));
    // What is left of the page: the largest text-holding blocks that touch no matched block.
    const blocks = pairs.map((p) => p.built.block);
    const extra = [];
    const sweep = (n) => {
        if (blocks.includes(n)) return;
        if (!blocks.some((b) => b.i >= n.i && b.i < n.end)) { if (textsIn(page, n).length) extra.push(section(page, n, width)); return; }
        n.kids.forEach(sweep);
    };
    sweep(page[0]);
    place([...pairs.map((p) => p.built), ...extra]);
    return { pairs, missing: frame.filter((s) => !anchors.has(s)), extra };
}

// ---------- differences ----------
const trim = (s, n = 32) => `"${s.length > n ? s.slice(0, n - 1) + "…" : s}"`;
const px = (v) => `${Math.round(v * 10) / 10}px`;
const hex = ([r, g, b, a]) => "#" + [r, g, b, ...(a < 255 ? [a] : [])].map((v) => v.toString(16).padStart(2, "0")).join("");
function lab([r, g, b]) {
    const [x, y, z] = [r, g, b].map((v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; }).reduce((xyz, v, k) => xyz.map((s, row) => s + v * [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]][row][k]), [0, 0, 0]);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x / 0.95047) - f(y)), 200 * (f(y) - f(z / 1.08883))];
}
/** CIE76 distance; about 2.3 is just noticeable. An alpha step counts on the same scale. */
const colourDistance = (a, b) => Math.hypot(...lab(a).map((v, k) => v - lab(b)[k]), (a[3] - b[3]) / 2.55);
const beyond = (a, b) => Math.abs(a - b) > Math.max(TOLERANCE_PX, TOLERANCE_RATIO * Math.max(Math.abs(a), Math.abs(b)));

function differences({ pairs, missing, extra }) {
    const out = [];
    // size orders the list: pixels, or the nearest thing to pixels the kind has.
    const add = (kind, s, element, property, frame, built, size) => out.push({ kind, section: s.name, element: element ?? null, property, frame, built, size });
    for (const s of missing) add("structure", s, null, "section", "present", "missing", s.height);
    for (const s of extra) add("structure", s, null, "section", "absent", "present", s.height);

    // Order: sections outside the longest run that keeps the frame's order.
    pairs.sort((a, b) => byPlace(a.frame, b.frame));
    const rank = new Map([...pairs].sort((a, b) => byPlace(a.built, b.built)).map((p, k) => [p, k]));
    const run = pairs.map(() => 1), from = pairs.map(() => -1);
    pairs.forEach((p, k) => { for (let j = 0; j < k; j++) if (rank.get(pairs[j]) < rank.get(p) && run[j] + 1 > run[k]) { run[k] = run[j] + 1; from[k] = j; } });
    const kept = new Set();
    for (let k = run.indexOf(Math.max(...run)); k >= 0; k = from[k]) kept.add(pairs[k]);
    const built = [...rank.keys()], after = (list, p) => (list.indexOf(p) ? `after ${trim(list[list.indexOf(p) - 1].frame.name, 24)}` : "first");
    for (const p of pairs) if (!kept.has(p)) add("structure", p.frame, null, "order", after(pairs, p), after(built, p), p.frame.height);

    pairs.forEach((p) => {
        const f = p.frame, b = p.built;
        const size = (property, fv, bv) => { if (beyond(fv, bv)) add("size", f, null, property, px(fv), px(bv), Math.abs(fv - bv)); };
        size("height", f.height, b.height);
        if (f.gap !== null && b.gap !== null) size("gap above", f.gap, b.gap);
        // The page margin shows at the ends of a row; inside a row an edge only says which cell the section sits in.
        if (f.first && b.first) size("content left", f.left, b.left);
        if (f.last && b.last) size("content right", f.right, b.right);

        // Texts with the same wording pair up in reading order.
        const left = new Map();
        for (const t of b.texts) left.set(norm(t.t.s), [...(left.get(norm(t.t.s)) ?? []), t]);
        const loneFrame = [];
        for (const ft of f.texts) {
            const bt = left.get(norm(ft.t.s))?.shift();
            if (!bt) { loneFrame.push(ft); continue; }
            p.texts = (p.texts ?? 0) + 1;
            const a = ft.t, c = bt.t, style = (property, fv, bv, d) => add("style", f, a.s, property, fv, bv, d);
            if (Math.abs(a.size - c.size) > 0.5) style("font-size", px(a.size), px(c.size), Math.abs(a.size - c.size));
            if (a.weight !== c.weight) style("font-weight", a.weight, c.weight, Math.abs(a.weight - c.weight) / 50);
            const line = (t) => (t.normal ? `normal (${px(t.line)})` : px(t.line));
            if (a.line !== null && c.line !== null && Math.abs(a.line - c.line) > 1) style("line-height", line(a), line(c), Math.abs(a.line - c.line));
            if (colourDistance(a.colour, c.colour) > JND) style("colour", hex(a.colour), hex(c.colour), colourDistance(a.colour, c.colour) / 2);
            if (norm(a.family) !== norm(c.family)) style("font-family", a.family, c.family, 8);
        }
        // Texts left over on both sides at the same place in the section are one text reworded.
        const loneBuilt = [...left.values()].flat();
        for (const ft of loneFrame) {
            const at = (t, s) => [t.x - s.x, t.y - s.y];
            const d = (bt) => Math.max(...at(ft, f).map((v, axis) => Math.abs(v - at(bt, b)[axis])));
            const bt = loneBuilt.filter((t) => d(t) <= PAIR_PX).sort((x, y) => d(x) - d(y))[0];
            if (bt) { loneBuilt.splice(loneBuilt.indexOf(bt), 1); add("text", f, ft.t.s, "wording", trim(ft.t.s, 48), trim(bt.t.s, 48), 6); } else add("text", f, ft.t.s, "wording", trim(ft.t.s, 48), "missing", 3);
        }
        for (const bt of loneBuilt) add("text", f, bt.t.s, "wording", "absent", trim(bt.t.s, 48), 3);
    });
    const kinds = ["structure", "size", "style", "text"];
    return out.sort((a, b) => b.size - a.size || kinds.indexOf(a.kind) - kinds.indexOf(b.kind));
}

// ---------- main ----------
const box = (s) => [s.x, s.y, s.width, s.height].map(Math.round).join(" ");
async function run() {
    for (const k of ["file", "node", "url"]) if (!args[k] || args[k] === true) throw new Unusable(`--${k} required (usage in the header of fidelity.mjs)`);
    const started = Date.now();
    const info = await tool("get_node_info", { fileId: args.file, nodeId: args.node });
    if (!info?.width) throw new Unusable(`frame ${args.node} not found in ${args.file}`);
    const width = Number(args.width ?? info.width);
    const [tree, frameShot] = await Promise.all([exportFrame(args.file, args.node), paperShot(args.file, args.node)]);
    tree.style = { ...tree.style, width: `${info.width}px` };

    const tab = await newTab();
    try {
        await tab.send("Network.enable");
        await tab.send("Page.setBypassCSP", { enabled: true }); // the frame's inline styles must apply on a page with a strict policy
        await setViewport(tab, width, {});
        const settled = await settle(tab, args.ready === true ? null : args.ready);
        await navigate(tab, args.url).catch((e) => { throw new Unusable(e.message); });
        await settled();
        if (args.inject) {
            const source = readFileSync(args.inject, "utf8");
            await evaluate(tab, args.inject.endsWith(".css") ? `(${INJECT_CSS})(${JSON.stringify(source)})` : source);
            await evaluate(tab, DECODE);
        }
        const page = index(await evaluate(tab, `(${MEASURE})(document.body)`));
        const pageShot = { mimeType: "image/png", data: (await tab.send("Page.captureScreenshot", { format: "png" })).data };
        const viewport = await evaluate(tab, "innerHeight");

        await evaluate(tab, `(${MOUNT_FRAME})(${JSON.stringify(html(tree))}, ${width})`);
        const frame = index(await evaluate(tab, `(${MEASURE})(document.getElementById("__fidelity").shadowRoot.firstElementChild)`));
        const visual = await comparePictures(tab, pageShot, frameShot, { frameWidth: info.width });

        const sections = frameSections(frame, width);
        if (!sections.length) throw new Unusable("the frame holds no text to match by");
        const matched = matchSections(sections, page, width);
        if (!matched.pairs.length) throw new Unusable(`none of the frame's ${sections.length} sections was found on the page (first heading: ${trim(sections[0].name)})`);
        const list = differences(matched);
        const frameTexts = sections.reduce((n, s) => n + s.texts.length, 0);
        return {
            frame: { id: args.node, name: info.name, width: info.width, height: info.height, laidOutHeight: Math.round(frame[0].h) },
            built: { url: args.url, width, comparedHeight: Math.min(viewport, info.height) },
            visual: { match: Math.round(visual.match * 10) / 10, worst: visual.worst },
            matched: { sections: matched.pairs.length, frameSections: sections.length, texts: matched.pairs.reduce((n, p) => n + (p.texts ?? 0), 0), frameTexts },
            seconds: Math.round((Date.now() - started) / 100) / 10,
            differences: list,
            sections: [...matched.pairs.map((p) => ({ section: p.frame.name, frame: box(p.frame), built: box(p.built), texts: `${p.texts ?? 0}/${p.frame.texts.length}` })), ...matched.missing.map((f) => ({ section: f.name, frame: box(f), built: null }))],
        };
    } finally { await closeTab(tab); }
}

function print(r) {
    const w = r.visual.worst, m = r.matched, count = (kind) => r.differences.filter((d) => d.kind === kind).length;
    console.log(`visual ${r.visual.match}% over the top ${r.built.comparedHeight}px  worst ${w ? `x${w.x} y${w.y} ${w.w}×${w.h} (${w.miss}% off)` : "none"}`);
    console.log(`${r.frame.name} ${r.frame.width}×${r.frame.height} vs ${r.built.url}  matched ${m.sections}/${m.frameSections} sections, ${m.texts}/${m.frameTexts} texts`);
    if (Math.abs(r.frame.laidOutHeight - r.frame.height) > TOLERANCE_PX) console.log(`note: the frame's export lays out ${r.frame.laidOutHeight}px tall in the browser, ${r.frame.height}px in Paper; sizes below carry that error`);
    console.log(`${r.differences.length} differences: ${["structure", "size", "style", "text"].map((k) => `${count(k)} ${k}`).join(", ")}  (frame → built)`);
    for (const d of r.differences.slice(0, CAP)) console.log(`${d.kind.padEnd(9)}  ${trim(d.section)}${d.element && d.element !== d.section ? ` › ${trim(d.element)}` : ""}  ${d.property}  ${d.frame} → ${d.built}`);
    if (r.differences.length > CAP) console.log(`… ${r.differences.length - CAP} more (--json lists all)`);
}

try {
    const result = await run();
    if (args.json) console.log(JSON.stringify(result, null, 1)); else print(result);
    process.exit(result.differences.length ? 1 : 0);
} catch (e) {
    console.error(`fidelity: ${e.message}`);
    process.exit(2);
}
