// collect: one page at one width → a metrics record plus its screenshots on disk.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openPage, sleep } from "./cdp.mjs";
import { decode } from "./png.mjs";
import { analyse, textContrast } from "./pixels.mjs";
import { resolveSnapshot } from "./snapshot.mjs";

export const SCHEMA = 2;
export const CAP = 16000; // px of page measured and captured
const HERE = dirname(fileURLToPath(import.meta.url));
const IN_PAGE = readFileSync(join(HERE, "page/core.js"), "utf8") + "\n" + readFileSync(join(HERE, "page/extra.js"), "utf8");

// Runs before the page's own scripts: lets us stop timers later, keeps slow auto-advancing
// intervals (carousels, tickers) from ever starting, and records layout shift and LCP.
const PRELOAD = `(() => {
    if (window.__pdNative) return;
    const st = window.setTimeout.bind(window), si = window.setInterval.bind(window), raf = window.requestAnimationFrame.bind(window);
    let frozen = false;
    window.__pdNative = { setTimeout: st, freeze: () => { frozen = true; }, thaw: () => { frozen = false; } };
    const wrap = (fn) => (typeof fn === "function" ? function (...a) { if (!frozen) return fn.apply(this, a); } : fn);
    window.setTimeout = (fn, ms, ...a) => st(wrap(fn), ms, ...a);
    window.setInterval = (fn, ms, ...a) => (ms >= 2000 ? 0 : si(wrap(fn), ms, ...a));
    window.requestAnimationFrame = (fn) => raf(wrap(fn));
    window.__pdPerf = { cls: 0, lcp: 0 };
    try {
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__pdPerf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__pdPerf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
})()`;

// What a mutation (--inject, or a planted defect in the evals) can call: shadow-root aware.
export const MUTATE_HELPERS = `
const all = (sel = "*") => { const out = []; (function walk(root) { for (const el of root.querySelectorAll("*")) { if (sel === "*" || el.matches(sel)) out.push(el); if (el.shadowRoot) walk(el.shadowRoot); } })(document); return out; };
const css = (text) => { let n = 0; (function walk(root) { const st = document.createElement("style"); st.setAttribute("data-pd-planted", ""); st.textContent = text; (root === document ? document.head ?? document.documentElement : root).appendChild(st); n++; for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot); })(document); return n; };
const shown = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05; };
const top = (el) => el.getBoundingClientRect().top + scrollY;
`;

const DESIGN_BLIND = ["detail.titleInFold", "content.headings", "form.submit", "pattern.stickyBar", "depth.sticky", "page.innerScroller", "image.upscaled", "image.upscaledShare"]; // Paper re-hosts a frame's pictures at its own sizes
const BLOCK_RE = /access denied|verify you are (a )?human|are you a robot|captcha|just a moment|pardon our interruption|request unsuccessful|attention required|temporarily restricted|unusual activity|slide to verify|security check|checking your browser|enable javascript and cookies/i;

/**
 * A tab holding `url`, loaded, lazy content pulled in, clock stopped, scrolled to the top,
 * with the in-page scripts present. → { page, rec, perf, prep, frozen, loaded }; rec.status says
 * whether the page is measurable. The caller closes the page.
 */
export async function openPrepared(browser, url, width, opts = {}) {
    const page = await openPage(browser, { width });
    const rec = { schema: SCHEMA, url, width, viewport: [width, page.height], status: "ok" };
    try {
        // a frozen copy on disk stands in for the page it was taken from
        const snap = resolveSnapshot(url, width);
        if (snap?.missing) { rec.status = "error"; rec.reason = `no snapshot file ${snap.file}`; return { page, rec }; }
        if (snap) rec.source = snap.source;
        // a Paper frame arrives already exported to a static file (see paper.mjs): a design, with no behaviour to probe
        const frame = opts.frame ?? null;
        if (frame) { rec.source = frame.source; rec.design = true; rec.frame = { name: frame.name, width: frame.width, height: frame.height, notes: frame.notes }; }
        await page.preload(PRELOAD);
        const loaded = await page.navigate(snap ? snap.href : frame ? frame.href : url);
        await page.idle(700, 12_000);
        await sleep(snap ? 300 : 800);
        rec.finalUrl = snap ? snap.source : frame ? frame.source : await page.evaluate("location.href");
        if (snap) await page.evaluate(`window.__pdAsUrl = ${JSON.stringify(snap.source)}`);
        if (frame) await page.evaluate(`window.__pdAsUrl = "https://paper.invalid/frame"`);
        rec.title = await page.evaluate("document.title");
        const bodyText = await page.evaluate(`(() => { let t = document.body?.innerText ?? ""; (function walk(root) { for (const el of root.querySelectorAll("*")) if (el.shadowRoot) { for (const k of el.shadowRoot.children) t += " " + (k.innerText ?? ""); walk(el.shadowRoot); } })(document); return t.slice(0, 2000); })()`);
        if (BLOCK_RE.test(rec.title) || (bodyText.length < 600 && BLOCK_RE.test(bodyText)) || ([401, 403, 429, 503].includes(page.net.status) && bodyText.length < 1500) || bodyText.trim().length === 0) {
            rec.status = "blocked";
            rec.reason = `HTTP ${page.net.status ?? "?"}; "${(rec.title || bodyText).slice(0, 80).replace(/\s+/g, " ")}"`;
            return { page, rec };
        }
        const perf = await page.evaluate("window.__pdPerf ?? null");
        if (opts.mutate) rec.mutation = (await page.evaluate(`(() => { ${MUTATE_HELPERS}\nreturn (${opts.mutate})(); })()`)) ?? null;
        await page.evaluate(IN_PAGE);
        const prep = await page.evaluate(`__pd.prepareBegin({ cap: ${CAP} })`);
        // scroll pass: pulls in what scrolling would load, then back to the top
        for (let y = 0; y < prep.max; y += prep.step) { await page.evaluate(`__pd.scrollMain(${y})`); await sleep(snap ? 30 : 220); }
        await page.evaluate("__pd.scrollMain(0)");
        await sleep(snap ? 50 : 300);
        for (const end = Date.now() + 6000; Date.now() < end; await sleep(100)) { const p = await page.evaluate(`__pd.pending(${CAP})`); if (!p.images && !p.backgrounds && !p.fonts) break; }
        await page.idle(snap ? 150 : 700, 8000);
        // Gate: a page still showing skeletons, spinners or missing pictures is not measured. A frozen copy
        // cannot finish loading, so it gets one look; a live page gets 15 seconds.
        let still = [];
        for (const end = Date.now() + (snap || frame ? 0 : 15_000); ; await sleep(500)) { still = await page.evaluate(`__pd.loading(${CAP})`); if (!still.length || Date.now() >= end) break; }
        if (still.length) { rec.status = "unsettled"; rec.reason = `still loading: ${still.slice(0, 3).join(" | ")}`; return { page, rec }; }
        await page.evaluate(`__pd.settle(${CAP})`, 20_000).catch(() => {});
        const frozen = await page.evaluate("__pd.freeze()");
        await sleep(200);
        return { page, rec, perf, prep, frozen, loaded };
    } catch (e) {
        rec.status = "error";
        rec.reason = String(e.message ?? e).slice(0, 300);
        return { page, rec };
    }
}

/**
 * opts: { dir, name, mutate, frame (an exported Paper frame) }. `mutate` is the source of a
 * function run in the page before measuring (see MUTATE_HELPERS); its return value lands in rec.mutation.
 * Returns the record; writes `<name>-<width>.png` (full page) and `<name>-<width>-fold.jpg`.
 */
export async function collectPage(browser, url, width, opts = {}) {
    const { page, rec, perf, prep, frozen, loaded } = await openPrepared(browser, url, width, opts);
    try {
        if (rec.status !== "ok") return rec;
        const thumb = await page.thumbnail();
        await page.evaluate(`__pd.fold({ vh: ${page.height}, cap: ${CAP} })`);
        const foldShot = decode(await page.screenshot({ x: 0, y: 0, width, height: page.height }));

        // a page that scrolls inside its own box is measured with the viewport grown to fit it
        let grown = page.height;
        for (let i = 0; i < 4; i++) {
            const extra = await page.evaluate("__pd.overflow()");
            if (extra <= 2 || grown >= CAP) break;
            grown = Math.min(grown + extra, CAP);
            // a resize can make an app draw itself again: the clock runs while it does, and the loading gate is applied again
            await page.evaluate("window.__pdNative?.thaw()");
            await page.setHeight(grown);
            await sleep(600);
            let still = [];
            for (const end = Date.now() + 10_000; ; await sleep(400)) { still = await page.evaluate(`__pd.loading(${CAP})`); if (!still.length || Date.now() >= end) break; }
            if (still.length) { rec.status = "unsettled"; rec.reason = `still loading after the page was laid out at full height: ${still.slice(0, 3).join(" | ")}`; return rec; }
            await page.evaluate(`__pd.settle(${CAP})`, 20_000).catch(() => {});
            await page.evaluate("window.__pdNative?.freeze()");
        }
        const res = await page.evaluate(`__pd.full({ vh: ${page.height}, cap: ${CAP} })`);
        const fullH = Math.min(res.metrics["page.height"], CAP);
        const fullPng = await page.screenshot({ x: 0, y: 0, width, height: fullH });
        const fullShot = decode(fullPng);

        const M = res.metrics, E = res.evidence;
        M["page.capped"] = res.metrics["page.height"] > CAP ? 1 : 0;
        M["page.innerScroller"] = grown > page.height ? 1 : 0;

        // pixels
        const pf = analyse(foldShot, res.pixel.fold.imageRects, res.pixel.fold.coverRects);
        const pu = analyse(fullShot, res.pixel.full.imageRects, res.pixel.full.coverRects);
        // a page that paints only what is on screen gives a blank full-page capture
        const fullValid = pu.whitespace.blankRowShare < 0.9;
        // Gate: a first screen that is nearly one colour is a failed capture, not a page.
        if (pf.whitespace.blankRowShare >= 0.97) { rec.status = "blank"; rec.reason = "the first screen rendered blank"; return rec; }
        rec.capture = { full: fullValid };
        Object.assign(M, {
            "colour.accentShareFold": pf.colour.accentShare,
            "colour.accentShare": fullValid ? pu.colour.accentShare : null,
            "colour.neutralShare": fullValid ? pu.colour.neutralShare : null,
            "colour.photoShare": fullValid ? pu.colour.photoShare : null,
            "colour.brandShare": fullValid ? pu.colour.topAccentColours[0]?.share ?? 0 : null,
            "colour.hues": fullValid ? pu.colour.hueCount : null,
            "colour.count": fullValid ? pu.colour.colourCount : null,
            "space.blankRowShare": fullValid ? Math.round(pu.whitespace.blankRowShare * 100) / 100 : null,
            "space.medianBand": fullValid ? pu.whitespace.medianInnerBandPx : null,
            "space.maxBand": fullValid ? pu.whitespace.maxInnerBandPx : null,
            "space.bandValues": fullValid ? pu.whitespace.distinctInnerBandsPx8.length : null,
        });
        res.detail.accentColours = pu.colour.topAccentColours;

        // contrast: DOM-resolved runs plus the runs only the screenshot can judge
        let checked = res.pixel.contrastDom.checked, failed = res.pixel.contrastDom.failed, runs = res.pixel.contrastDom.runs;
        // A failing run counts only if its colour is actually in the screenshot where it should be: hidden text
        // and stand-in labels fail on paper and are read by nobody.
        const painted = ({ rect: [x, y, w, h], fg }) => {
            if (!fg || y + h > fullShot.h || w < 2 || h < 2) return true;
            for (let yy = Math.max(0, y); yy < y + h; yy++) for (let xx = Math.max(0, x); xx < Math.min(fullShot.w, x + w); xx++) { const i = (yy * fullShot.w + xx) * 4; if (Math.abs(fullShot.data[i] - fg[0]) + Math.abs(fullShot.data[i + 1] - fg[1]) + Math.abs(fullShot.data[i + 2] - fg[2]) <= 90) return true; }
            return false;
        };
        const failList = [];
        for (const { fg, ...f } of res.pixel.contrastDom.list) { if (painted({ ...f, fg })) failList.push(f); else { checked -= f.chars; failed -= f.chars; runs--; } }
        for (const job of res.pixel.contrastJobs) {
            if (job.rect[1] + job.rect[3] > fullShot.h) continue;
            const ratio = textContrast(fullShot, job);
            if (ratio == null) continue;
            checked += job.chars;
            if (ratio < (job.large ? 3 : 4.5)) { failed += job.chars; runs++; failList.push({ sel: job.sel, text: job.text, rect: job.rect, note: `${Math.round(ratio * 10) / 10}:1 on image`, chars: job.chars }); }
        }
        M["contrast.failShare"] = checked ? Math.round((failed / checked) * 100) / 100 : null;
        M["contrast.failRuns"] = runs;
        if (failList.length) E["contrast.failShare"] = failList.sort((a, b) => b.chars - a.chars || a.rect[1] - b.rect[1]).slice(0, 5).map(({ chars, ...rest }) => rest);

        // a design cannot respond or move: those metrics are absent, never zero
        // (nor does an exported frame keep heading tags, form controls or sticky positioning)
        if (rec.design) for (const k of Object.keys(M)) if (k.startsWith("motion.") || DESIGN_BLIND.includes(k)) M[k] = null;
        // probes
        if (!rec.design) {
            const pr = await probe(page, res.probes);
            Object.assign(M, pr.metrics);
            Object.assign(E, pr.evidence);
            rec.probes = pr.results;
        }

        // timing-dependent, so informational: never judged, never part of the determinism check
        rec.info = {
            "perf.weightKB": Math.round(page.net.bytes / 1024),
            "perf.requests": page.net.requests,
            "perf.cls": perf ? Math.round(perf.cls * 1000) / 1000 : null,
            "perf.lcpMs": perf?.lcp ? Math.round(perf.lcp) : null,
            loadEventSeen: loaded, consentHidden: prep.consentHidden + frozen.consentHidden, httpStatus: page.net.status,
        };
        rec.metrics = Object.fromEntries(Object.entries(M).sort(([a], [b]) => (a < b ? -1 : 1)));
        rec.evidence = E;
        rec.signals = res.signals;
        rec.detail = res.detail;
        if (opts.dir) {
            mkdirSync(opts.dir, { recursive: true });
            rec.files = { full: `${opts.name}-${width}.png`, fold: `${opts.name}-${width}-fold.jpg` };
            writeFileSync(join(opts.dir, rec.files.full), fullPng);
            writeFileSync(join(opts.dir, rec.files.fold), thumb);
        }
        return rec;
    } catch (e) {
        rec.status = "error";
        rec.reason = String(e.message ?? e).slice(0, 300);
        return rec;
    } finally {
        await page.close();
    }
}

/**
 * Read-only interaction probes. Hover is a real pointer move; press and focus are forced
 * pseudo-states, so nothing is clicked, focused or submitted.
 */
async function probe(page, probes) {
    const results = [];
    await page.evaluate("__pd.stillStyles()");
    await page.send("DOM.enable");
    await page.send("CSS.enable");
    await page.send("DOM.getDocument", { depth: 0 });
    const force = async (i, classes) => {
        const { result } = await page.send("Runtime.evaluate", { expression: `__pd.probeEl(${i})` });
        const { nodeId } = await page.send("DOM.requestNode", { objectId: result.objectId });
        await page.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: classes });
    };
    for (const p of probes) {
        const r = { i: p.i, kind: p.kind, sel: p.sel, text: p.text, rect: p.rect, hover: null, press: null, focus: null };
        try {
            if (!page.mobile) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
            const aim = await page.evaluate(`__pd.aim(${p.i})`);
            if (!page.mobile && p.kind !== "input") {
                if (aim.lands) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: aim.x, y: aim.y });
                else await force(p.i, ["hover"]);
                await sleep(80);
                r.hover = await page.evaluate(`__pd.changed(${p.i})`);
                if (aim.lands) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
                else await force(p.i, []);
            }
            if (p.kind === "button") {
                await force(p.i, ["hover"]);
                await page.evaluate(`__pd.aim(${p.i})`);
                await force(p.i, ["hover", "active"]);
                r.press = await page.evaluate(`__pd.changed(${p.i})`);
                await force(p.i, []);
            }
            if (p.kind !== "row") {
                await page.evaluate(`__pd.aim(${p.i})`);
                await force(p.i, ["focus", "focus-visible", "focus-within"]);
                r.focus = await page.evaluate(`__pd.changed(${p.i})`);
                await force(p.i, []);
            }
        } catch (e) { r.error = String(e.message ?? e).slice(0, 120); }
        results.push(r);
    }
    if (!page.mobile) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 }).catch(() => {});
    const share = (list, key) => { const got = list.filter((r) => r[key] != null); return got.length ? Math.round((got.filter((r) => r[key].length).length / got.length) * 100) / 100 : null; };
    const of = (...kinds) => results.filter((r) => kinds.includes(r.kind));
    const metrics = {
        "probe.hoverCards": share(of("card", "row"), "hover"),
        "probe.hoverButtons": share(of("button", "link"), "hover"),
        "probe.pressButtons": share(of("button"), "press"),
        "probe.focusVisible": share(of("button", "link", "input"), "focus"),
    };
    const dead = (list, key) => list.filter((r) => r[key] != null && !r[key].length).slice(0, 5).map((r) => ({ sel: r.sel, text: r.text, rect: r.rect, note: `no change on ${key}` }));
    const evidence = {};
    for (const [k, list, key] of [["probe.hoverCards", of("card", "row"), "hover"], ["probe.hoverButtons", of("button", "link"), "hover"], ["probe.pressButtons", of("button"), "press"], ["probe.focusVisible", of("button", "link", "input"), "focus"]]) { const d = dead(list, key); if (d.length) evidence[k] = d; }
    return { results, metrics, evidence };
}
