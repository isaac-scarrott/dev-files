/*
 * Page preparation, the metrics that core.js does not carry, and the probe helpers.
 * `window.__pd`: prepareBegin / scrollMain / pending → freeze → fold → full, then probeTargets / snap / diff for the probes.
 * Every list is in document order and every number is rounded, so two runs of one page agree.
 */
(function () {
    const nativeTimeout = window.__pdNative?.setTimeout ?? window.setTimeout.bind(window);
    const sleep = (ms) => new Promise((r) => nativeTimeout(r, ms));
    const round = (n, d = 2) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
    const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const up = (el) => el.parentElement ?? (el.getRootNode() instanceof ShadowRoot ? el.getRootNode().host : null);
    function all() {
        const out = [];
        (function walk(root) { for (const el of root.querySelectorAll("*")) { out.push(el); if (el.shadowRoot) walk(el.shadowRoot); } })(document);
        return out;
    }
    const closest = (el, test) => { for (let n = el; n; n = up(n)) if (test(n)) return n; return null; };

    // ---------- colour ----------
    const colourCache = new Map();
    let canvasCtx = null;
    /** Any CSS colour → [r, g, b, a]. */
    function rgba(str) {
        if (colourCache.has(str)) return colourCache.get(str);
        let out;
        const m = str && str.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
        if (m) out = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]];
        else if (!str || str === "transparent") out = [0, 0, 0, 0];
        else {
            canvasCtx ??= Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
            canvasCtx.clearRect(0, 0, 1, 1);
            canvasCtx.fillStyle = "#000";
            canvasCtx.fillStyle = str;
            canvasCtx.fillRect(0, 0, 1, 1);
            const d = canvasCtx.getImageData(0, 0, 1, 1).data;
            out = [d[0], d[1], d[2], round(d[3] / 255, 2)];
        }
        colourCache.set(str, out);
        return out;
    }
    const over = (top, bottom) => { const a = top[3]; return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1]; };
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const hsv = (c) => { const max = Math.max(c[0], c[1], c[2]), min = Math.min(c[0], c[1], c[2]); return { s: max ? (max - min) / max : 0, v: max / 255 }; };
    const isAccent = (c) => { const { s, v } = hsv(c); return s >= 0.25 && v >= 0.3; };
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const hex = (c) => "#" + [c[0], c[1], c[2]].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
    function pageBackground() {
        for (const e of [document.body, document.documentElement]) { const c = e && rgba(getComputedStyle(e).backgroundColor); if (c && c[3] >= 0.5) return over(c, [255, 255, 255, 1]); }
        return [255, 255, 255, 1];
    }
    /** The solid colour painted behind `el` by its ancestors; `pixels` when only the screenshot can tell. */
    function backdrop(el, cs) {
        const layers = [];
        let pixels = false, base = null;
        for (let n = el; n; n = up(n)) {
            const s = cs(n);
            if (s.backgroundImage && s.backgroundImage !== "none") { pixels = true; break; }
            const c = rgba(s.backgroundColor);
            if (c[3] >= 0.99) { base = c; break; }
            if (c[3] > 0.02) layers.push(c);
            // whatever sits under a positioned box is not one of its ancestors
            if (/absolute|fixed|sticky/.test(s.position)) { pixels = true; break; }
        }
        base ??= pageBackground();
        for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
        return { colour: base, pixels };
    }

    // ---------- naming elements ----------
    function selector(el) {
        const parts = [];
        for (let n = el, i = 0; n && i < 4; i++) {
            let p = n.tagName.toLowerCase();
            const test = n.getAttribute("data-testid") ?? n.getAttribute("data-test");
            if (n.id && /^[a-zA-Z][\w-]{0,40}$/.test(n.id) && !/\d{4,}|^radix|^react|^:/.test(n.id)) { parts.unshift(`${p}#${n.id}`); break; }
            if (test && test.length < 40) { parts.unshift(`${p}[data-testid="${test}"]`); break; }
            const cls = [...n.classList].filter((c) => /^[a-zA-Z][\w-]{1,30}$/.test(c) && !/^(css|sc|jsx|svelte)-|[0-9a-f]{6,}|__/.test(c)).slice(0, 2);
            if (cls.length) p += "." + cls.join(".");
            const par = n.parentElement;
            if (par) { const same = [...par.children].filter((k) => k.tagName === n.tagName); if (same.length > 1) p += `:nth-of-type(${same.indexOf(n) + 1})`; }
            parts.unshift(p);
            if (!par && n.getRootNode() instanceof ShadowRoot) { parts.unshift(">>>"); n = n.getRootNode().host; continue; }
            n = par;
        }
        return parts.join(" > ").replace(/ > >>> > /g, " >>> ").replace(/^>>> > /, "");
    }
    const labelOf = (el) => ((el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim() || el.value || el.getAttribute?.("aria-label") || el.getAttribute?.("title") || "").trim();

    const PRICE = /(?:[$£€¥₹₩₺]|\b(?:USD|EUR|GBP|AED|AUD|CAD|CHF|JPY|INR|SEK|NOK|DKK|PLN|SGD)\b)\s?\d|\d[\d.,]*\s?(?:[$£€¥₹]|\b(?:USD|EUR|GBP|AED|kr|zł)\b)/i;
    const RATING_TEXT = /[★⭐]|\b[1-5][.,]\d{1,2}\s*(?:\(|\/\s*5|stars?\b|out of)|\b\d[\d,.]*k?\+?\s+(?:reviews?|ratings?)\b/i;
    const RATING_LABEL = /\b(?:rat(?:ed|ing)|stars?|out of 5|reviews?)\b/i;
    const DURATION = /\b\d+(?:[.,]\d)?\s?(?:h|hr|hrs|hours?|min|mins|minutes?|days?|nights?)\b/i;
    const MARKETING_CTA = /^(get started|start (now|free|for free|building|selling|your)|sign up|try (it |us )?(for )?free|request (a )?demo|book a demo|get a demo|contact sales|talk to (sales|us|an expert)|become a (host|partner|supplier|member)|join (now|us|the waitlist)|get in touch|see pricing|view pricing|partner with us|list your|apply now|download)\b/i;
    const KEBAB_TEXT = /^(?:⋯|…|\.\.\.|⋮|︙|•••|···|⋮|…)$/;
    const KEBAB_LABEL = /^(?:more|more (?:options|actions)|actions|options|open menu|row actions|show more actions)$/i;

    // ---------- preparation ----------
    const CONSENT = [
        "#onetrust-consent-sdk", "#CybotCookiebotDialog", "#CybotCookiebotDialogBodyUnderlay", ".fc-consent-root", "#didomi-host", "#usercentrics-root", "#truste-consent-track", ".truste_overlay", ".truste_box_overlay",
        "#cookie-banner", "#cookiebanner", ".cookie-banner", ".cc-window", "#cmpbox", "#cmpbox2", ".qc-cmp2-container", "[id^='sp_message_container']", ".osano-cm-window", "#iubenda-cs-banner", "#cookie-law-info-bar",
        ".cky-consent-container", ".cky-overlay", "#hs-eu-cookie-confirmation", "#axeptio_overlay", "#global-cookie-message", "#cookieConsent", "#cookie-consent", "[aria-label='cookieconsent']", "[data-testid='cookie-banner']",
    ].join(",");
    /** Hides consent banners instead of answering them, so nothing on the site is clicked. */
    function hideOverlays() {
        let hidden = 0;
        for (const el of all()) {
            let hit = false;
            try { hit = el.matches(CONSENT); } catch {}
            if (!hit) {
                const s = getComputedStyle(el);
                if ((s.position === "fixed" || s.position === "sticky") && s.display !== "none") {
                    const r = el.getBoundingClientRect();
                    if (r.width * r.height > 8000) {
                        const t = (el.innerText ?? "").slice(0, 1600);
                        hit = t.length < 1500 && /cookie|consent|gdpr|we value your privacy/i.test(t) && !!el.querySelector("button, a, [role=button]") && !el.querySelector("nav, h1, main, [role=search]");
                    }
                }
            }
            if (hit && el.style.display !== "none") { el.style.setProperty("display", "none", "important"); hidden++; }
        }
        if (hidden) for (const e of [document.documentElement, document.body]) if (e && getComputedStyle(e).overflowY === "hidden") e.style.setProperty("overflow", "auto", "important");
        return hidden;
    }

    function mainScroller() {
        const doc = document.scrollingElement ?? document.documentElement;
        if (doc.scrollHeight > innerHeight + 5) return { el: doc, inner: false };
        let best = null;
        for (const c of all()) {
            if (c.hasAttribute("data-pd-scroller")) return { el: c, inner: true };
            const s = getComputedStyle(c);
            if (!/(auto|scroll)/.test(s.overflowY) || c.scrollHeight <= c.clientHeight + 5 || s.visibility === "hidden") continue;
            const r = c.getBoundingClientRect();
            if (r.width < innerWidth * 0.8 || r.height < innerHeight * 0.5 || r.top >= innerHeight || r.bottom <= 0) continue;
            const a = c.clientWidth * c.clientHeight;
            if (!best || a > best.a) best = { a, el: c };
        }
        if (best) best.el.setAttribute("data-pd-scroller", "1");
        return best ? { el: best.el, inner: true } : { el: doc, inner: false };
    }

    // Preparation is paced from outside the page (begin → scroll steps → pending polls): a
    // snapshot document runs no timers or event handlers, so nothing in here may wait on one.
    const bgCache = (window.__pdBgCache ??= new Map());
    function warmBackgrounds() {
        for (const el of all()) {
            const m = getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
            if (m && !bgCache.has(m[1])) { const i = new Image(); i.src = m[1]; bgCache.set(m[1], i); }
        }
    }
    /** Hides consent banners, makes lazy images eager; → how far to scroll and in what steps. */
    function prepareBegin({ cap }) {
        const consentHidden = hideOverlays();
        for (const img of all()) if (img.tagName === "IMG" && img.loading === "lazy") img.loading = "eager";
        const { el } = mainScroller();
        return { consentHidden, max: Math.min(el.scrollHeight, cap), step: Math.round(innerHeight * 0.7) };
    }
    function scrollMain(y) { mainScroller().el.scrollTo({ top: y, behavior: "instant" }); return true; }
    /** What is still loading: images above the cap, background pictures, fonts. */
    function pending(cap) {
        warmBackgrounds();
        return {
            images: all().filter((i) => i.tagName === "IMG" && !i.complete && i.getBoundingClientRect().top < cap).length,
            backgrounds: [...bgCache.values()].filter((i) => !i.complete).length,
            fonts: document.fonts.status === "loading" ? 1 : 0,
        };
    }

    /** What still says "loading": skeletons, spinners, busy regions, and sizeable pictures that have not arrived. */
    function loading(cap) {
        const out = [];
        for (const el of all()) {
            const r = el.getBoundingClientRect();
            if (r.width < 16 || r.height < 8 || r.top + scrollY > cap) continue;
            const cls = el.className?.toString?.() ?? "";
            const arrived = el.tagName === "IMG" && el.complete && el.naturalWidth > 0; // a loaded picture often keeps its placeholder class
            // a placeholder block: it pulses or shimmers for ever and holds no words and no picture
            const st = getComputedStyle(el);
            const pulsing = st.animationName !== "none" && /infinite/.test(st.animationIterationCount) && r.width * r.height >= 1500 && !(el.textContent ?? "").trim() && !el.querySelector("img, video, canvas, svg") && !["IMG", "VIDEO", "CANVAS", "svg"].includes(el.tagName);
            const busy = pulsing || !arrived && (el.getAttribute("aria-busy") === "true" || (el.getAttribute("role") === "progressbar" && !el.hasAttribute("aria-valuenow")) || /(^|[\s_-])(skeleton|shimmer|spinner|placeholder-glow)([\s_-]|$)/i.test(cls));
            // a picture parked off to the side in a carousel is not on the page yet
            const late = el.tagName === "IMG" && !el.complete && r.width >= 48 && r.height >= 48 && r.right > 0 && r.left < innerWidth;
            if (!busy && !late) continue;
            const s = getComputedStyle(el);
            if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.05) continue;
            if (closest(up(el), (n) => { const p = getComputedStyle(n); return p.display === "none" || p.visibility === "hidden" || +p.opacity < 0.05; })) continue;
            out.push(late ? "picture still loading" : selector(el));
            if (out.length >= 5) break;
        }
        return out;
    }

    /** Resolves when every picture is decoded and every font is in, so the screenshot shows what the DOM says. */
    async function settle(cap) {
        const imgs = all().filter((i) => i.tagName === "IMG" && i.complete && i.naturalWidth && i.getBoundingClientRect().top + scrollY < cap);
        await Promise.all([document.fonts.ready.catch(() => {}), ...imgs.map((i) => i.decode().catch(() => {}))]);
        return imgs.length;
    }

    /** How far an inner scroller still overflows: the runner grows the viewport by this much. */
    function overflow() {
        const { el, inner } = mainScroller();
        return inner ? el.scrollHeight - el.clientHeight : 0;
    }

    /** Stops the clock: timers and frames no longer fire, animations sit at their end state. */
    function freeze() {
        const consentHidden = hideOverlays();
        window.__pdNative?.freeze();
        for (const v of all()) if (v.tagName === "VIDEO") { try { v.pause(); } catch {} }
        for (const a of document.getAnimations()) {
            try { const t = a.effect?.getComputedTiming(); if (t && Number.isFinite(t.endTime)) a.finish(); else { a.pause(); a.currentTime = 0; } } catch {}
        }
        const { el } = mainScroller();
        el.scrollTo({ top: 0, behavior: "instant" });
        scrollTo(0, 0);
        // does the document really pan sideways?
        const doc = document.scrollingElement ?? document.documentElement;
        doc.scrollLeft = 10000;
        const hScrollPx = Math.round(doc.scrollLeft);
        doc.scrollLeft = 0;
        state.hScrollPx = hScrollPx;
        return { consentHidden, hScrollPx };
    }
    /** Transitions off, so a probed state shows its end style at once. */
    function stillStyles() { addStyle("*,*::before,*::after{transition:none!important;animation-play-state:paused!important;scroll-behavior:auto!important}"); }
    function addStyle(css) {
        (function walk(root) {
            const st = document.createElement("style");
            st.textContent = css;
            (root === document ? document.head ?? document.documentElement : root).appendChild(st);
            for (const el of root.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
        })(document);
    }

    const state = { fold: null, hScrollPx: 0, probes: [], base: new Map() };

    // ---------- shared detectors ----------
    function buttonList(ctx) {
        const { vis, boxOf, cs } = ctx;
        const out = [];
        for (const el of vis) {
            const tag = el.tagName, role = el.getAttribute("role");
            const isButton = tag === "BUTTON" || role === "button" || tag === "A" || (tag === "INPUT" && /^(submit|button)$/.test(el.type));
            if (!isButton) continue;
            const f = boxOf.get(el).full;
            if (f.h < 24 || f.h > 96 || f.w < 40 || f.w > 520) continue;
            const text = labelOf(el);
            if (!text || text.length > 40) continue;
            const s = cs(el);
            const bg = rgba(s.backgroundColor);
            const gradient = /gradient/.test(s.backgroundImage);
            const filled = bg[3] >= 0.8 || gradient;
            const behind = backdrop(up(el) ?? el, cs).colour;
            const fill = filled ? over(bg, behind) : null;
            const loud = filled && (gradient || isAccent(fill) || contrast(fill, behind) >= 3);
            const bordered = parseFloat(s.borderTopWidth) > 0 && rgba(s.borderTopColor)[3] > 0.2;
            out.push({ el, text, box: f, kind: loud ? "primary" : filled || bordered ? "secondary" : "ghost", fill });
        }
        // a button wrapping a button: keep the outer one
        const set = new Set(out.map((b) => b.el));
        return out.filter((b) => !closest(up(b.el), (n) => set.has(n)));
    }
    function searchPresent(ctx) {
        return ctx.vis.find((el) => {
            const tag = el.tagName, role = el.getAttribute("role");
            if (role === "search" || role === "searchbox") return true;
            if (tag === "INPUT" && (el.type === "search" || /search|where to|destination|find /i.test(`${el.name} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""} ${el.id}`))) return true;
            if ((tag === "BUTTON" || tag === "A" || role === "button") && /^search\b/i.test(el.getAttribute("aria-label") ?? labelOf(el)) && labelOf(el).length < 30) return true;
            return false;
        }) ?? null;
    }
    const inChrome = (el) => !!closest(el, (n) => ["HEADER", "FOOTER", "NAV"].includes(n.tagName) || ["banner", "contentinfo", "navigation"].includes(n.getAttribute("role")));

    function foldBlock(F) {
        const { ctx, out } = F;
        const buttons = buttonList(ctx).filter((b) => b.kind === "primary" && !ctx.inCard(b.el));
        const search = searchPresent(ctx);
        const area = innerWidth * innerHeight;
        const hero = ctx.imageList.reduce((m, i) => Math.max(m, i.box.w * i.box.h), 0);
        const outside = ctx.textRuns.filter((t) => !ctx.inCard(t.el));
        const priceRun = outside.find((t) => PRICE.test(t.text));
        const h1 = ctx.vis.find((el) => el.tagName === "H1");
        return {
            metrics: {
                "fold.cards": out.density.cards,
                "fold.items": out.density.totalItems,
                "fold.words": ctx.textRuns.reduce((a, t) => a + t.words, 0),
                "fold.imageShare": round(out.imagery.share, 2),
                "fold.heroShare": round(hero / area, 2),
                "fold.textOverShare": round(out.depth.textCharsOverImageryShare, 2),
                "fold.primaryButtons": buttons.length,
                "fold.search": search ? 1 : 0,
                "fold.primaryAction": buttons.length || search ? 1 : 0,
                "detail.priceInFold": priceRun ? 1 : 0,
                "detail.titleInFold": h1 ? 1 : 0,
            },
            evidence: {
                "fold.heroShare": ctx.imageList.slice().sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).slice(0, 1).map((i) => i.el),
                "fold.primaryButtons": buttons.map((b) => b.el),
                "fold.textOverShare": ctx.textOverImage.map((t) => t.el),
            },
            legacy: out,
            imageRects: out.imageRects, coverRects: out.coverRects,
        };
    }

    async function fold(opts) {
        scrollTo(0, 0);
        const F = await window.__pdCore({ mode: "fold", vh: opts.vh, cap: opts.cap });
        const block = foldBlock(F);
        state.fold = { ...block, evidence: evidenceOf(block.evidence, F.ctx) };
        return true;
    }

    // True when something opaque that is neither inside nor around `el` is drawn over the whole of it (the page behind
    // an open cart or dialog): a mark there would point at the wrong thing. What lies outside the window cannot be
    // hit-tested where it is, so it is tested against whatever is drawn at its place across in the middle of the window:
    // a cover as tall as the page covers it too.
    function coveredAt(el, ctx) {
        const r = el.getBoundingClientRect(), x = r.left + r.width / 2, mid = r.top + r.height / 2, y = mid >= 0 && mid < innerHeight ? mid : innerHeight / 2;
        if (r.width < 1 || r.height < 1 || x < 0 || x >= innerWidth) return false;
        let hit = document.elementFromPoint(x, y);
        while (hit?.shadowRoot) { const inner = hit.shadowRoot.elementFromPoint(x, y); if (!inner || inner === hit) break; hit = inner; }
        if (!hit || ctx.contains(el, hit)) return false;
        for (let n = hit; n && !ctx.contains(n, el); n = ctx.parentOf(n)) { const s = ctx.cs(n), c = n.getBoundingClientRect(); if ((n.tagName === "IMG" || ctx.bgUrl(s) || !ctx.isTransparent(s.backgroundColor)) && c.left <= r.left + 1 && c.top <= r.top + 1 && c.right >= r.right - 1 && c.bottom >= r.bottom - 1) return true; }
        return false;
    }
    function evidenceOf(map, ctx) {
        const out = {};
        for (const [key, list] of Object.entries(map)) {
            if (!list) continue;
            const seen = new Set();
            const rows = [];
            for (const item of list) {
                const el = item.el ?? item, note = item.note;
                if (!el || seen.has(el)) continue;
                seen.add(el);
                const b = ctx.boxOf.get(el)?.full ?? (() => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; })();
                rows.push({ sel: selector(el), text: labelOf(el).slice(0, 60), rect: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)], ...(note ? { note } : {}), ...(coveredAt(el, ctx) ? { covered: true } : {}) });
                if (rows.length >= 5) break;
            }
            if (rows.length) out[key] = rows;
        }
        return out;
    }

    // ---------- the full pass ----------
    async function full(opts) {
        const U = await window.__pdCore({ mode: "full", vh: opts.vh, cap: opts.cap });
        const { ctx, out } = U;
        const { vis, boxOf, cs, textRuns, cardList, imageList, inCard, inRow, rowList } = ctx;
        const M = {}, E = {};
        const screens = ctx.screens;
        const totalChars = ctx.totalChars;
        const pageBg = pageBackground();

        // ----- content -----
        const content = out.sections.list.filter((s) => !s.chrome);
        const shapeCount = new Map();
        for (const s of content) shapeCount.set(s.shape, (shapeCount.get(s.shape) ?? 0) + 1);
        const topShape = [...shapeCount.entries()].sort((a, b) => b[1] - a[1])[0];
        const words = textRuns.reduce((a, t) => a + t.words, 0);
        Object.assign(M, {
            "page.screens": round(screens, 1),
            "page.height": ctx.pageHeight,
            "page.domNodes": ctx.els.length,
            "content.sections": out.sections.contentCount,
            "content.shapes": out.sections.distinctShapeCount,
            "content.topShapeShare": content.length >= 3 ? round(topShape[1] / content.length, 2) : null,
            "content.cards": out.density.cards,
            "content.cardsPerScreen": out.density.cardsPerScreen,
            "content.itemsPerScreen": out.density.itemsPerScreen,
            "content.charsPerScreen": out.density.textCharsPerScreen,
            "content.wordsPerScreen": Math.round(words / screens),
            "content.headings": out.density.headings,
        });
        const sectionDetail = ctx.sectionAll.map((s, i) => ({ shape: s.shape, y: s.y, h: s.h, chrome: s.chrome, cards: s.cards, sel: selector(ctx.sectionEls[i]) }));
        if (topShape) E["content.topShapeShare"] = ctx.sectionEls.filter((_, i) => !ctx.sectionAll[i].chrome && ctx.sectionAll[i].shape === topShape[0]).map((el) => ({ el, note: topShape[0] }));
        E["content.shapes"] = E["content.topShapeShare"];

        // ----- type -----
        const T = out.typeScale;
        const families = Object.values(T.familyShare).filter((s) => s >= 0.02).length;
        const smallRuns = textRuns.filter((t) => t.size < 12);
        const paraMap = new Map(); // block element → chars, for line length
        for (const t of textRuns) {
            const block = closest(t.el, (n) => !/^inline/.test(cs(n).display)) ?? t.el;
            const p = paraMap.get(block) ?? { chars: 0, size: t.size, lineHeight: t.lineHeight };
            p.chars += t.chars;
            paraMap.set(block, p);
        }
        const lineLengths = [], lineHeights = [], longLineEls = [];
        for (const [el, p] of paraMap) {
            const r = el.getBoundingClientRect();
            const lh = parseFloat(p.lineHeight) || p.size * 1.2;
            const lines = Math.round(r.height / lh);
            if (lines < 3 || p.chars < 150 || ![...el.children].every((k) => k.tagName === "BR" || /^inline/.test(cs(k).display))) continue;
            const perLine = p.chars / lines;
            lineLengths.push(perLine);
            lineHeights.push(lh / p.size);
            longLineEls.push({ el, perLine });
        }
        Object.assign(M, {
            "type.sizes": T.sizeLevelCountSignificant,
            "type.sizesAll": T.sizeLevelCount,
            "type.pairs": T.pairCount,
            "type.bodySize": T.bodySize,
            "type.largestToBody": T.largestToBody,
            "type.medianAdjacentRatio": T.medianAdjacentRatio,
            "type.minAdjacentRatio": T.adjacentRatiosSignificant.length ? Math.min(...T.adjacentRatiosSignificant) : null,
            "type.boldShare": round(T.boldShare, 2),
            "type.weight500Share": round(textRuns.filter((t) => t.rawWeight >= 500).reduce((a, t) => a + t.chars, 0) / totalChars, 2),
            "type.families": families,
            "type.smallTextShare": round(smallRuns.reduce((a, t) => a + t.chars, 0) / totalChars, 2),
            "type.lineLength": lineLengths.length ? Math.round(median(lineLengths)) : null,
            "type.lineHeight": lineHeights.length ? round(median(lineHeights), 2) : null,
        });
        // where the bold is: each bold run is put in the first group that fits, the most specific thing it is first
        const cardTitle = new Map();
        for (const t of textRuns) { const c = closest(t.el, (n) => ctx.cardSet.has(n)); const now = cardTitle.get(c); if (c && (!now || t.size > now.size || (t.size === now.size && t.chars > now.chars))) cardTitle.set(c, t); } // a card's title: its largest text, the longer run when a price is set as large
        const titles = new Set(cardTitle.values());
        // a price is often split over elements ("£26", ".00", "GBP"): a run inside a short price is part of it
        const inPrice = (t) => PRICE.test(t.text) || [t.el, up(t.el)].some((n) => n && n.textContent.length <= 20 && PRICE.test(n.textContent));
        // a button is something pressed to act: a pressable card, or a wrapper round a picture, is not one
        const isButton = (n) => (n.tagName === "BUTTON" || n.getAttribute("role") === "button" || (n.tagName === "INPUT" && /submit|button/.test(n.type))) && !ctx.cardSet.has(n) && !ctx.descImages.has(n);
        const groupOf = (t) => {
            if (inPrice(t)) return "prices";
            if (/^[1-5][.,]\d{1,2}$/.test(t.text) || RATING_TEXT.test(t.text)) return "ratings";
            if (closest(t.el, (n) => n.tagName === "TH")) return "table headings";
            if (closest(t.el, (n) => n.tagName === "TD")) return "table cells";
            if (titles.has(t)) return "card titles";
            if (closest(t.el, isButton)) return "buttons";
            if (ctx.inCard(t.el)) return t.chars <= 28 ? "badges and labels in cards" : "other card text";
            if (closest(t.el, (n) => /^H[1-6]$/.test(n.tagName) || n.getAttribute("role") === "heading") || t.size >= (T.bodySize ?? 16) * 1.2) return "headings";
            if (closest(t.el, (n) => n.tagName === "A")) return "links";
            if (closest(t.el, (n) => n.tagName === "LABEL")) return "form labels";
            return t.chars <= 28 ? "short labels" : "running text";
        };
        const boldBy = new Map();
        // the example quoted for a group is its longest run, so it shows what most of the group is
        for (const t of textRuns) if (t.rawWeight >= 600) { const what = groupOf(t), g = boldBy.get(what) ?? { chars: 0, longest: t }; g.chars += t.chars; if (t.chars > g.longest.chars) g.longest = t; boldBy.set(what, g); }
        const boldGroups = [...boldBy.entries()].map(([what, g]) => ({ what, share: round(g.chars / totalChars, 2), sample: g.longest.text.slice(0, 40) })).filter((g) => g.share >= 0.01).sort((a, b) => b.share - a.share || (a.what < b.what ? -1 : 1));
        const sizeUse = new Map(), familyUse = new Map();
        for (const t of textRuns) {
            const a = sizeUse.get(t.size) ?? { chars: 0, sample: t.text.slice(0, 30) }; a.chars += t.chars; sizeUse.set(t.size, a);
            const b = familyUse.get(t.family) ?? { chars: 0, sample: t.text.slice(0, 30) }; b.chars += t.chars; familyUse.set(t.family, b);
        }
        const typeUse = { sizes: [...sizeUse.entries()].sort((a, b) => b[0] - a[0]).map(([size, u]) => ({ size, share: round(u.chars / totalChars, 3), sample: u.sample })), families: [...familyUse.entries()].sort((a, b) => b[1].chars - a[1].chars || (a[0] < b[0] ? -1 : 1)).map(([name, u]) => ({ name, share: round(u.chars / totalChars, 3), sample: u.sample })) };
        // the longest run, then the runs nearest to it down the page: a picture of them shows one stretch with every run in it marked
        const aroundLongest = (runs) => { const lead = [...runs].sort((a, b) => b.chars - a.chars)[0]; return lead ? [...runs].sort((a, b) => Math.abs(a.box.y - lead.box.y) - Math.abs(b.box.y - lead.box.y) || b.chars - a.chars).map((t) => t.el) : []; };
        E["type.boldShare"] = aroundLongest(textRuns.filter((t) => t.rawWeight >= 600 && t.size <= (T.bodySize ?? 16) * 1.2));
        const sizeFirst = new Map();
        for (const t of textRuns) if (!sizeFirst.has(t.size)) sizeFirst.set(t.size, t.el);
        E["type.sizes"] = [...sizeFirst.entries()].sort((a, b) => a[0] - b[0]).map(([size, el]) => ({ el, note: `${size}px` }));
        E["type.sizesAll"] = E["type.sizes"];
        E["type.smallTextShare"] = aroundLongest(smallRuns);
        E["type.lineLength"] = longLineEls.sort((a, b) => b.perLine - a.perLine).map((x) => ({ el: x.el, note: `${Math.round(x.perLine)} chars/line` }));
        E["type.largestToBody"] = textRuns.filter((t) => t.size === T.largestSize).map((t) => t.el);

        // ----- imagery -----
        // Words on the hero picture are the one accepted case of text on a photo, so they are not counted:
        // the hero is the largest picture that starts in the first screen and covers at least a fifth of it.
        const heroImg = imageList.filter((i) => i.box.full.y < ctx.VH && i.box.full.w * Math.min(i.box.full.h, ctx.VH) >= innerWidth * ctx.VH * 0.2).sort((a, b) => b.box.full.w * b.box.full.h - a.box.full.w * a.box.full.h)[0];
        const onHero = (t) => !!heroImg && ctx.overlapArea(t.box, heroImg.box) > 0.5 * t.box.w * t.box.h;
        const offHero = ctx.textOverImage.filter((t) => !onHero(t));
        const sized = imageList.filter((i) => i.natural && i.box.w * i.box.h > 5000);
        // Not counted as stretched: a picture blurred on purpose (a backdrop), and a low-resolution stand-in that a loaded picture sits on top of.
        const blurred = (el) => !!closest(el, (n) => /blur\(/.test(cs(n).filter));
        const standIn = (i) => imageList.some((j) => j !== i && j.natural && j.natural.w > i.natural.w && Math.abs(j.box.full.x - i.box.full.x) < 12 && Math.abs(j.box.full.y - i.box.full.y) < 12 && Math.abs(j.box.full.w - i.box.full.w) < 24 && Math.abs(j.box.full.h - i.box.full.h) < 24);
        const upscaled = sized.filter((i) => Math.max(i.box.full.w / i.natural.w, i.box.full.h / i.natural.h) > 1.05 && !blurred(i.el) && !standIn(i));
        const rowsOfImages = new Map();
        for (const i of imageList) {
            const f = i.box.full;
            if (f.w > innerWidth * 0.7) continue;
            const key = `${Math.round(f.y / 8)}`;
            if (!rowsOfImages.has(key)) rowsOfImages.set(key, []);
            rowsOfImages.get(key).push(i);
        }
        let imageRows = 0;
        const ragged = [];
        for (const row of rowsOfImages.values()) {
            if (row.length < 3) continue;
            imageRows++;
            const aspects = row.map((i) => i.box.full.w / i.box.full.h);
            if (Math.max(...aspects) / Math.min(...aspects) > 1.08) ragged.push(row);
        }
        // images that sit side by side but start at different heights are the same defect seen from the other side
        const cardImages = cardList.map((c) => (ctx.descImages.get(c) ?? [])[0]).filter(Boolean).map((el) => boxOf.get(el)?.full).filter(Boolean);
        const cardAspects = cardImages.map((f) => round(f.w / f.h, 1));
        const aspectKinds = new Set(cardAspects).size;
        const broken = vis.filter((el) => el.tagName === "IMG" && el.complete && el.naturalWidth === 0 && boxOf.get(el).full.w >= 24 && !/\.svg(\?|$)/i.test(el.currentSrc || el.src || ""));
        Object.assign(M, {
            "image.share": round(out.imagery.share, 2),
            "image.count": out.imagery.count,
            "image.perScreen": round(out.imagery.count / screens, 1),
            "image.upscaled": upscaled.length,
            "image.upscaledShare": sized.length >= 2 ? round(upscaled.length / sized.length, 2) : sized.length ? upscaled.length : null,
            "image.raggedRows": ragged.length,
            "image.raggedRowShare": imageRows ? round(ragged.length / imageRows, 2) : null,
            "image.cardAspects": cardImages.length >= 3 ? aspectKinds : null,
            "image.broken": broken.length,
            "image.textOverShare": round(offHero.reduce((a, t) => a + t.chars, 0) / totalChars, 2),
            "image.overlays": out.depth.overlaysOnImagery,
        });
        E["image.upscaledShare"] = upscaled.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h).map((i) => ({ el: i.el, note: `${i.natural.w}×${i.natural.h} shown at ${Math.round(i.box.full.w)}×${Math.round(i.box.full.h)}` }));
        E["image.upscaled"] = E["image.upscaledShare"];
        E["image.raggedRowShare"] = ragged.flatMap((row) => row.map((i) => ({ el: i.el, note: `${Math.round(i.box.full.w)}×${Math.round(i.box.full.h)}` })));
        E["image.raggedRows"] = E["image.raggedRowShare"];
        E["image.broken"] = broken;
        E["image.textOverShare"] = offHero.slice().sort((a, b) => b.chars - a.chars).map((t) => t.el);

        // ----- depth and motion -----
        Object.assign(M, {
            "depth.surfaces": out.depth.distinctSurfaceColours,
            "depth.shadowsPerScreen": round(out.depth.boxShadowElements / screens, 1),
            "depth.radii": out.depth.distinctBorderRadii,
            "depth.sticky": out.depth.stickyElements + out.depth.fixedElements,
            "depth.gradients": out.depth.gradientSurfaces,
            "motion.transitionsPerScreen": out.motion.perScreenTransitions,
            "motion.transitions": out.motion.transitionElements,
            "motion.animated": out.motion.animatedElements,
        });

        // ----- spacing rhythm and alignment -----
        const gapCount = new Map();
        const gapEls = new Map();
        let gapTotal = 0;
        for (const el of vis) {
            const kids = ctx.layoutChildren(el);
            for (let i = 1; i < kids.length; i++) {
                const a = boxOf.get(kids[i - 1]).full, b = boxOf.get(kids[i]).full;
                const g = Math.round(b.y - (a.y + a.h));
                if (g < 2 || g > 240 || a.h < 8 || b.h < 8) continue;
                gapCount.set(g, (gapCount.get(g) ?? 0) + 1);
                if (!gapEls.has(g)) gapEls.set(g, kids[i]);
                gapTotal++;
            }
        }
        const gapSorted = [...gapCount.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        let covered = 0, gapValues = 0;
        for (const [, n] of gapSorted) { if (covered >= gapTotal * 0.9) break; covered += n; gapValues++; }
        const offGrid = gapSorted.filter(([g]) => g % 4 !== 0);
        const edgeCount = new Map();
        const edgeEls = new Map();
        let edgeTotal = 0;
        for (const t of textRuns) {
            if (t.chars < 3) continue;
            const x = Math.round(t.box.full.x / 2) * 2;
            edgeCount.set(x, (edgeCount.get(x) ?? 0) + 1);
            if (!edgeEls.has(x)) edgeEls.set(x, t.el);
            edgeTotal++;
        }
        const edgeSorted = [...edgeCount.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        let edgeCovered = 0, leftEdges = 0;
        for (const [, n] of edgeSorted) { if (edgeCovered >= edgeTotal * 0.8) break; edgeCovered += n; leftEdges++; }
        Object.assign(M, {
            "space.gapValues": gapTotal >= 5 ? gapValues : null,
            "space.offGridShare": gapTotal >= 5 ? round(offGrid.reduce((a, [, n]) => a + n, 0) / gapTotal, 2) : null,
            "layout.leftEdges": edgeTotal >= 5 ? leftEdges : null,
            "layout.hScrollPx": state.hScrollPx,
        });
        E["space.gapValues"] = gapSorted.slice().reverse().map(([g]) => ({ el: gapEls.get(g), note: `${g}px gap above` }));
        E["space.offGridShare"] = offGrid.map(([g]) => ({ el: gapEls.get(g), note: `${g}px gap above` }));
        E["layout.leftEdges"] = edgeSorted.slice().reverse().map(([x]) => ({ el: edgeEls.get(x), note: `starts at x=${x}` }));
        E["layout.hScrollPx"] = state.hScrollPx ? vis.filter((el) => { const f = boxOf.get(el).full; return f.x + f.w > innerWidth + 4 && f.w < innerWidth * 3 && !closest(up(el), (n) => { const s = cs(n); return s.overflowX !== "visible" && n !== document.body && n !== document.documentElement; }); }).sort((a, b) => (boxOf.get(b).full.x + boxOf.get(b).full.w) - (boxOf.get(a).full.x + boxOf.get(a).full.w)) : [];

        // ----- colour (DOM side; the pixel side is computed from the screenshot) -----
        const textColour = new Map();
        for (const t of textRuns) { const k = hex(rgba(t.color)); textColour.set(k, (textColour.get(k) ?? 0) + t.chars); }
        const fills = new Map();
        for (const el of vis) {
            const b = boxOf.get(el);
            if (b.w * b.h < 400) continue;
            const c = rgba(cs(el).backgroundColor);
            if (c[3] < 0.5 || !isAccent(c)) continue;
            const k = hex([c[0] >> 4 << 4, c[1] >> 4 << 4, c[2] >> 4 << 4]);
            fills.set(k, (fills.get(k) ?? 0) + b.w * b.h);
        }
        const brandGround = ctx.sectionEls.filter((el, i) => {
            const s = ctx.sectionAll[i];
            if (s.h < 80 || s.y >= ctx.REGION.bottom) return false;
            const own = rgba(cs(el).backgroundColor);
            if (own[3] >= 0.5) return isAccent(own);
            // a full-bleed child can carry the ground
            return ctx.layoutChildren(el).some((k) => { const f = boxOf.get(k).full, c = rgba(cs(k).backgroundColor); return f.h >= s.h * 0.8 && f.w >= innerWidth * 0.9 && c[3] >= 0.5 && isAccent(c); });
        });
        Object.assign(M, {
            "colour.textColours": [...textColour.values()].filter((n) => n / totalChars >= 0.01).length,
            "colour.fills": fills.size,
            "colour.brandGroundSections": brandGround.length,
        });
        E["colour.brandGroundSections"] = brandGround;
        const firstOfColour = new Map();
        for (const t of textRuns) { const k = hex(rgba(t.color)); if (!firstOfColour.has(k)) firstOfColour.set(k, t.el); }
        E["colour.textColours"] = [...textColour.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => ({ el: firstOfColour.get(k), note: k }));

        // ----- contrast -----
        const contrastJobs = [];
        let checked = 0, failed = 0;
        const failRuns = [];
        for (const t of textRuns) {
            if (t.box.w * t.box.h < 16 || t.chars < 2) continue;
            const s = cs(t.el);
            let fg = rgba(s.webkitTextFillColor && s.webkitTextFillColor !== s.color ? s.webkitTextFillColor : s.color);
            let opacity = 1;
            for (let n = t.el; n; n = up(n)) opacity *= +cs(n).opacity;
            fg = [fg[0], fg[1], fg[2], fg[3] * opacity];
            if (fg[3] < 0.1) continue;
            const large = t.size >= 24 || (t.size >= 18.66 && t.rawWeight >= 700);
            const back = backdrop(t.el, cs);
            const overImage = back.pixels || ctx.textOverImage.includes(t);
            if (overImage) { contrastJobs.push({ rect: [Math.round(t.box.x), Math.round(t.box.y), Math.round(t.box.w), Math.round(t.box.h)], fg: fg.map((v, i) => (i < 3 ? Math.round(v) : round(v, 2))), large, chars: t.chars, sel: selector(t.el), text: t.text.slice(0, 60) }); continue; }
            const ratio = contrast(over(fg, back.colour), back.colour);
            checked += t.chars;
            if (ratio < (large ? 3 : 4.5)) { failed += t.chars; failRuns.push({ t, ratio }); }
        }
        failRuns.sort((a, b) => b.t.chars - a.t.chars);
        const contrastDom = { checked, failed, runs: failRuns.length, list: failRuns.slice(0, 200).map(({ t, ratio }) => ({ sel: selector(t.el), text: t.text.slice(0, 60), rect: [Math.round(t.box.full.x), Math.round(t.box.full.y), Math.round(t.box.full.w), Math.round(t.box.full.h)], note: `${round(ratio, 1)}:1`, chars: t.chars, fg: over(rgba(t.color), [255, 255, 255, 1]).slice(0, 3).map(Math.round) })) };

        // ----- buttons and actions -----
        const buttons = buttonList(ctx);
        const primaries = buttons.filter((b) => b.kind === "primary" && !inCard(b.el) && !inRow(b.el));
        const group = primaries.map((_, i) => i);
        const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
        for (let i = 0; i < primaries.length; i++) for (let j = i + 1; j < primaries.length; j++) {
            const a = primaries[i], b = primaries[j];
            if (a.text.toLowerCase() === b.text.toLowerCase() || dist(a.fill, b.fill) > 40) continue;
            const sameRow = Math.abs(a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2)) <= 12 && Math.max(b.box.x - (a.box.x + a.box.w), a.box.x - (b.box.x + b.box.w)) <= 48;
            const stacked = Math.abs(a.box.x - b.box.x) <= 8 && Math.max(b.box.y - (a.box.y + a.box.h), a.box.y - (b.box.y + b.box.h)) <= 24;
            if (sameRow || stacked) group[find(j)] = find(i);
        }
        const groupSize = new Map();
        primaries.forEach((_, i) => groupSize.set(find(i), (groupSize.get(find(i)) ?? 0) + 1));
        const competing = primaries.filter((_, i) => groupSize.get(find(i)) >= 2);
        // repeated containers and what they offer: a labelled action, or only a "more" button
        const isKebab = (el) => {
            const tag = el.tagName, role = el.getAttribute("role");
            if (!(tag === "BUTTON" || role === "button" || tag === "SUMMARY" || tag === "A")) return false;
            const text = (el.innerText ?? "").replace(/\s+/g, " ").trim();
            if (KEBAB_TEXT.test(text)) return true;
            const name = (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "").trim();
            return !text && KEBAB_LABEL.test(name) && !inChrome(el);
        };
        const kebabs = vis.filter(isKebab);
        const kebabSet = new Set(kebabs);
        const solidButtons = new Set(buttons.filter((b) => b.kind !== "ghost").map((b) => b.el));
        const isAction = (el) => {
            const tag = el.tagName, role = el.getAttribute("role");
            if (kebabSet.has(el)) return false;
            if (tag === "BUTTON" || role === "button" || (tag === "INPUT" && /^(submit|button)$/.test(el.type))) return labelOf(el).length > 0;
            return solidButtons.has(el);
        };
        const containers = [...rowList, ...vis.filter((el) => (el.tagName === "LI" || el.getAttribute("role") === "listitem" || el.getAttribute("role") === "row") && !inRow(el) && boxOf.get(el).full.h >= 32), ...cardList.filter((c) => c.tagName !== "LI")];
        let withAction = 0, onlyKebab = 0;
        const hiddenRows = [];
        for (const c of containers) {
            const inside = [...c.querySelectorAll("button, [role=button], summary, a, input")].filter((e) => boxOf.has(e));
            const k = inside.some((e) => kebabSet.has(e)), a = inside.some(isAction);
            if (k || a) withAction++;
            if (k && !a) { onlyKebab++; hiddenRows.push(inside.find((e) => kebabSet.has(e))); }
        }
        Object.assign(M, {
            "actions.primary": primaries.length,
            "actions.primaryPerScreen": round(primaries.length / screens, 1),
            "actions.competingPrimaries": new Set(competing.map((b) => find(primaries.indexOf(b)))).size,
            "actions.hidden": kebabs.length,
            "actions.hiddenShare": withAction >= 3 ? round(onlyKebab / withAction, 2) : kebabs.length ? 1 : null,
            "actions.labelled": buttons.filter((b) => b.kind !== "ghost").length,
        });
        E["actions.competingPrimaries"] = competing.map((b) => ({ el: b.el, note: "primary fill" }));
        E["actions.primaryPerScreen"] = primaries.map((b) => b.el);
        E["actions.hiddenShare"] = hiddenRows.length ? hiddenRows : kebabs;
        E["actions.hidden"] = kebabs;

        // ----- cards -----
        const runsOfCard = new Map(cardList.map((c) => [c, []]));
        for (const t of textRuns) { const c = closest(t.el, (n) => ctx.cardSet.has(n)); if (c) runsOfCard.get(c).push(t); }
        const facts = cardList.map((card) => {
            const runs = runsOfCard.get(card);
            const text = runs.map((t) => t.text).join(" · ");
            const price = PRICE.test(text) || /\bfree\b/i.test(text) && /\bfrom\b|\bentry\b|\badmission\b/i.test(text);
            let rating = RATING_TEXT.test(text) || runs.some((t) => /^[1-5][.,]\d{1,2}$/.test(t.text));
            if (!rating) rating = [...card.querySelectorAll("[aria-label],[title]")].some((e) => RATING_LABEL.test(e.getAttribute("aria-label") ?? e.getAttribute("title") ?? "") && /\d/.test(e.getAttribute("aria-label") ?? e.getAttribute("title") ?? ""));
            const cardBg = backdrop(card, cs).colour;
            const badge = runs.some((t) => {
                if (t.chars > 28) return false;
                const host = closest(t.el, (n) => n === card || rgba(cs(n).backgroundColor)[3] >= 0.5);
                if (!host || host === card || ["A", "BUTTON"].includes(host.tagName) || host.getAttribute("role") === "button") return false;
                const f = boxOf.get(host)?.full;
                return !!f && f.h <= 36 && f.w <= 240 && dist(over(rgba(cs(host).backgroundColor), cardBg), cardBg) > 24;
            });
            return { card, price, rating, badge, duration: DURATION.test(text), n: 0 };
        });
        for (const f of facts) f.n = +f.price + +f.rating + +f.badge + +f.duration;
        const enoughCards = cardList.length >= 3;
        const share = (k) => (enoughCards ? round(facts.filter((f) => f[k]).length / facts.length, 2) : null);
        Object.assign(M, {
            "cards.priceShare": share("price"),
            "cards.ratingShare": share("rating"),
            "cards.badgeShare": share("badge"),
            "cards.durationShare": share("duration"),
            "cards.factsMedian": enoughCards ? median(facts.map((f) => f.n)) : null,
            "cards.wordsMedian": enoughCards ? median(cardList.map((c) => runsOfCard.get(c).reduce((a, t) => a + t.words, 0))) : null,
        });
        const bare = facts.slice().sort((a, b) => a.n - b.n).map((f) => ({ el: f.card, note: `price ${f.price ? "yes" : "no"}, rating ${f.rating ? "yes" : "no"}, badge ${f.badge ? "yes" : "no"}` }));
        for (const k of ["cards.priceShare", "cards.ratingShare", "cards.badgeShare", "cards.factsMedian"]) E[k] = bare;
        E["content.cardsPerScreen"] = cardList;

        // ----- patterns -----
        const textOfEl = (el) => (el.getAttribute("aria-label") ?? "") + " " + (el.children.length <= 3 ? (el.innerText ?? "").slice(0, 60) : "");
        const controls = vis.filter((el) => ["BUTTON", "SELECT", "A", "SUMMARY", "LABEL", "LEGEND", "H2", "H3", "H4"].includes(el.tagName) || el.getAttribute("role") === "button" || el.getAttribute("role") === "combobox");
        const has = (re) => controls.some((el) => re.test(textOfEl(el).trim())) ? 1 : 0;
        const checkboxes = vis.filter((el) => el.tagName === "INPUT" && /checkbox|radio/.test(el.type)).length;
        const breadcrumb = vis.find((el) => /breadcrumb/i.test(`${el.getAttribute("aria-label") ?? ""} ${el.className?.toString?.() ?? ""} ${el.getAttribute("itemtype") ?? ""}`) && boxOf.get(el).full.h >= 10);
        const stickyBars = vis.filter((el) => { const s = cs(el), f = boxOf.get(el).full; return (s.position === "fixed" || s.position === "sticky") && f.w >= innerWidth * 0.8 && f.h >= 36 && f.h <= 160; });
        const pagination = vis.find((el) => /pagination/i.test(`${el.getAttribute("aria-label") ?? ""} ${el.className?.toString?.() ?? ""}`)) || controls.find((el) => /^(load more|show more|next page|next|see more results|view more)\b/i.test(textOfEl(el).trim()));
        Object.assign(M, {
            "pattern.search": searchPresent(ctx) ? 1 : 0,
            "pattern.filters": has(/^(all )?filters?\b|^filter by|^refine/i) || (checkboxes >= 4 && !!vis.find((el) => el.tagName === "ASIDE" || /filter|facet/i.test(el.className?.toString?.() ?? ""))) ? 1 : 0,
            "pattern.sort": has(/^sort\b|^sorted by|^recommended$|^most popular$|price.{0,6}low/i),
            "pattern.breadcrumb": breadcrumb ? 1 : 0,
            "pattern.stickyBar": stickyBars.length ? 1 : 0,
            "pattern.pagination": pagination ? 1 : 0,
        });

        // ----- phone ergonomics -----
        const targets = [];
        for (const el of vis) {
            const tag = el.tagName, role = el.getAttribute("role");
            const interactive = (tag === "A" && el.hasAttribute("href")) || tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA" || tag === "SUMMARY" || (tag === "INPUT" && el.type !== "hidden") || ["button", "link", "tab", "checkbox", "radio", "switch", "menuitem", "combobox"].includes(role);
            if (!interactive || el.disabled) continue;
            if (closest(up(el), (n) => n.tagName === "A" || n.tagName === "BUTTON")) continue;
            let f = boxOf.get(el).full;
            if (tag === "INPUT" && /checkbox|radio/.test(el.type)) { const label = el.labels?.[0]; const lf = label && boxOf.get(label)?.full; if (lf) f = lf; }
            // a link inside running text is exempt (WCAG 2.5.8 inline exception)
            if (tag === "A" && /^inline/.test(cs(el).display)) {
                const parentText = [...(up(el)?.childNodes ?? [])].some((n) => n.nodeType === 3 && n.textContent.trim().length > 8);
                if (parentText) continue;
            }
            targets.push({ el, w: f.w, h: f.h });
        }
        const small = targets.filter((t) => Math.min(t.w, t.h) < 44), tiny = targets.filter((t) => Math.min(t.w, t.h) < 32);
        const inputs = vis.filter((el) => (el.tagName === "INPUT" && !/^(checkbox|radio|submit|button|hidden|range|file|image|color|reset)$/.test(el.type)) || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
        const smallInputs = inputs.filter((el) => parseFloat(cs(el).fontSize) < 16);
        Object.assign(M, {
            "touch.targets": targets.length,
            "touch.smallTargetShare": targets.length >= 3 ? round(small.length / targets.length, 2) : null,
            "touch.tinyTargetShare": targets.length >= 3 ? round(tiny.length / targets.length, 2) : null,
            "touch.smallInputs": smallInputs.length,
            "touch.smallInputShare": inputs.length ? round(smallInputs.length / inputs.length, 2) : null,
        });
        const bySize = (list) => list.slice().sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).map((t) => ({ el: t.el, note: `${Math.round(t.w)}×${Math.round(t.h)}px` }));
        E["touch.smallTargetShare"] = bySize(small);
        E["touch.tinyTargetShare"] = bySize(tiny);
        E["touch.smallInputs"] = smallInputs.map((el) => ({ el, note: `${cs(el).fontSize} text` }));
        E["touch.smallInputShare"] = E["touch.smallInputs"];

        // ----- forms -----
        const isSearchField = (el) => el.type === "search" || !!closest(el, (n) => n.getAttribute("role") === "search") || /search/i.test(`${el.name} ${el.placeholder ?? ""} ${el.getAttribute("aria-label") ?? ""}`);
        const radioNames = new Set();
        const fields = vis.filter((el) => {
            if (!((el.tagName === "INPUT" && !/^(submit|button|hidden|image|reset)$/.test(el.type)) || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return false;
            if (isSearchField(el) || inChrome(el)) return false;
            if (/radio/.test(el.type)) { const k = el.name || el.id; if (radioNames.has(k)) return false; radioNames.add(k); }
            return true;
        });
        const labelText = (el) => {
            if (el.labels?.length) return [...el.labels].map((l) => l.innerText).join(" ").trim();
            const by = el.getAttribute("aria-labelledby");
            if (by) return by.split(/\s+/).map((id) => el.getRootNode().getElementById?.(id)?.innerText ?? "").join(" ").trim();
            const group = /radio|checkbox/.test(el.type ?? "") && closest(el, (n) => n.tagName === "FIELDSET");
            if (group) return group.querySelector("legend")?.innerText?.trim() ?? "";
            return (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "").trim();
        };
        const unlabelled = fields.filter((el) => !labelText(el));
        const placeholderOnly = unlabelled.filter((el) => el.placeholder);
        const withHelp = fields.filter((el) => el.hasAttribute("aria-describedby") || !!closest(el, (n) => n !== el && boxOf.has(n) && boxOf.get(n).full.h < 200 && !!n.querySelector?.("[class*=hint i],[class*=help i],[class*=description i],small")));
        const labelsAbove = fields.filter((el) => { const l = el.labels?.[0]; const lf = l && boxOf.get(l)?.full, f = boxOf.get(el).full; return lf && lf.y + lf.h <= f.y + 4; });
        const rowsOfFields = new Map();
        for (const el of fields) { if (/checkbox|radio/.test(el.type ?? "")) continue; const k = Math.round(boxOf.get(el).full.y / 12); rowsOfFields.set(k, (rowsOfFields.get(k) ?? 0) + 1); }
        const stepHint = vis.find((el) => el.getAttribute("aria-current") === "step" || /\bstep\s+\d+\s+(of|\/)\s+\d+\b/i.test(el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.textContent : "") || /stepper|progress-?steps|step-indicator|wizard/i.test(el.className?.toString?.() ?? ""));
        const submit = buttons.find((b) => b.kind === "primary" && (b.el.type === "submit" || !!closest(b.el, (n) => n.tagName === "FORM")));
        Object.assign(M, {
            "form.fields": fields.length,
            "form.fieldsPerScreen": round(fields.length / screens, 1),
            "form.unlabelledShare": fields.length >= 2 ? round(unlabelled.length / fields.length, 2) : null,
            "form.placeholderOnly": placeholderOnly.length,
            "form.helpTexts": withHelp.length,
            "form.labelsAboveShare": fields.length - unlabelled.length >= 2 ? round(labelsAbove.length / (fields.length - unlabelled.length), 2) : null,
            "form.multiColumnRows": [...rowsOfFields.values()].filter((n) => n >= 2).length,
            "form.steps": stepHint ? 1 : 0,
            "form.groups": vis.filter((el) => el.tagName === "FIELDSET" || (el.tagName === "LEGEND")).length,
            "form.submit": submit ? 1 : 0,
        });
        E["form.unlabelledShare"] = unlabelled.map((el) => ({ el, note: el.placeholder ? `placeholder "${el.placeholder}" only` : "no label" }));
        E["form.placeholderOnly"] = E["form.unlabelledShare"];
        E["form.fields"] = fields;
        E["form.multiColumnRows"] = fields.filter((el) => rowsOfFields.get(Math.round(boxOf.get(el).full.y / 12)) >= 2);

        // ----- tables -----
        const tables = vis.filter((el) => el.tagName === "TABLE" || el.getAttribute("role") === "grid" || el.getAttribute("role") === "table");
        let table = null;
        for (const t of tables) {
            const rows = [...t.querySelectorAll("tbody tr, [role=row]")].filter((r) => boxOf.has(r) && !r.querySelector("th[scope=col]") && !closest(r, (n) => n.tagName === "THEAD"));
            if (rows.length >= 3 && (!table || rows.length > table.rows.length)) table = { el: t, rows };
        }
        if (table) {
            const { rows } = table;
            const cellsOf = (r) => [...r.children].filter((c) => boxOf.has(c));
            const cols = median(rows.map((r) => cellsOf(r).length));
            const heights = rows.map((r) => boxOf.get(r).full.h);
            const actionCols = [];
            let rowsWithAction = 0;
            for (const r of rows) {
                const cells = cellsOf(r);
                const idx = cells.findIndex((c) => [...c.querySelectorAll("button, [role=button], summary, a")].some((e) => boxOf.has(e) && (kebabSet.has(e) || isAction(e))));
                if (idx >= 0) { rowsWithAction++; actionCols.push(idx / Math.max(1, cells.length - 1)); }
            }
            const numeric = [], rightAligned = [];
            for (const r of rows) for (const c of cellsOf(r)) {
                const t = (c.innerText ?? "").trim();
                if (/^[-+]?[$£€]?\s?\d[\d,.]*\s?(%|[kKmM]|[$£€])?$/.test(t)) { numeric.push(c); if (/right|end/.test(cs(c).textAlign)) rightAligned.push(c); }
            }
            const firstCell = cellsOf(rows[0])[0];
            const head = table.el.querySelector("thead, [role=columnheader]");
            const headCell = table.el.querySelector("th, [role=columnheader]");
            let stickyHead = false;
            for (let n = headCell; n && n !== table.el; n = up(n)) if (/sticky|fixed/.test(cs(n).position)) stickyHead = true;
            const separated = rows.slice(0, 6).filter((r) => { const c = cellsOf(r)[0]; return (parseFloat(cs(r).borderBottomWidth) > 0 || (c && parseFloat(cs(c).borderBottomWidth) > 0) || (c && parseFloat(cs(c).borderTopWidth) > 0)); }).length >= Math.min(3, rows.length - 1) || new Set(rows.slice(0, 4).map((r) => cs(r).backgroundColor)).size > 1;
            Object.assign(M, {
                "table.rows": rows.length,
                "table.cols": cols,
                "table.rowHeight": Math.round(median(heights)),
                "table.cellPadX": firstCell ? Math.round(parseFloat(cs(firstCell).paddingLeft) + parseFloat(cs(firstCell).paddingRight)) / 2 : null,
                "table.rowsWithActionShare": round(rowsWithAction / rows.length, 2),
                "table.actionsAtEnd": actionCols.length ? (median(actionCols) >= 0.75 ? 1 : 0) : null,
                "table.header": headCell && boxOf.has(headCell) ? 1 : 0,
                "table.headerSticky": stickyHead ? 1 : 0,
                "table.numericRightShare": numeric.length >= 3 ? round(rightAligned.length / numeric.length, 2) : null,
                "table.separated": separated ? 1 : 0,
            });
            E["table.rowHeight"] = rows;
            E["table.cellPadX"] = rows.map((r) => cellsOf(r)[0]).filter(Boolean);
            E["table.numericRightShare"] = numeric.filter((c) => !rightAligned.includes(c));
            E["table.actionsAtEnd"] = rows;
            E["table.separated"] = rows;
            E["table.header"] = [table.el];
        } else Object.assign(M, { "table.rows": 0, "table.cols": null, "table.rowHeight": null, "table.cellPadX": null, "table.rowsWithActionShare": null, "table.actionsAtEnd": null, "table.header": null, "table.headerSticky": null, "table.numericRightShare": null, "table.separated": null });

        // ----- detail page -----
        const outside = textRuns.filter((t) => !inCard(t.el));
        const firstScreens = imageList.filter((i) => i.box.full.y < ctx.VH * 1.5 && i.box.full.w >= 200 && i.box.full.h >= 150);
        Object.assign(M, {
            "detail.price": outside.some((t) => PRICE.test(t.text)) ? 1 : 0,
            "detail.galleryImages": firstScreens.length,
        });

        // ----- signals for page-type detection -----
        const longParas = vis.filter((el) => el.tagName === "P" && (el.innerText ?? "").trim().split(/\s+/).length >= 40);
        const paraWords = vis.filter((el) => el.tagName === "P").reduce((a, el) => a + (el.innerText ?? "").trim().split(/\s+/).filter(Boolean).length, 0);
        const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => { try { const j = JSON.parse(s.textContent); return (Array.isArray(j) ? j : j["@graph"] ?? [j]).map((x) => [].concat(x?.["@type"] ?? []).join(",")); } catch { return []; } }).filter(Boolean).sort();
        const buyRe = /^(add to (cart|bag|basket)|buy( now)?|book( now)?|check availability|reserve( now)?|select (tickets|options|dates?)|see tickets|get tickets|find tickets|order now|add to trip|choose (date|options))\b/i;
        const buy = buttons.filter((b) => !inCard(b.el) && buyRe.test(b.text));
        const cardArea = cardList.reduce((a, c) => a + boxOf.get(c).w * boxOf.get(c).h, 0);
        const asUrl = window.__pdAsUrl ? new URL(window.__pdAsUrl) : location; // a snapshot answers for the page it was taken from
        const signals = {
            path: asUrl.pathname, queryKeys: [...new URLSearchParams(asUrl.search).keys()].slice(0, 10),
            ogType: document.querySelector('meta[property="og:type"]')?.content ?? null,
            ldTypes: [...new Set(ld)].slice(0, 12),
            h1: vis.filter((el) => el.tagName === "H1").length,
            longParagraphs: longParas.length,
            paragraphWordShare: words ? round(paraWords / words, 2) : 0,
            words,
            buyButtons: buy.length,
            priceOutsideCards: M["detail.price"],
            cards: cardList.length,
            cardAreaShare: round(cardArea / ctx.regionArea, 2),
            formFields: fields.length,
            tableRows: table ? table.rows.length : 0,
            tableAreaShare: table ? round(boxOf.get(table.el).w * boxOf.get(table.el).h / ctx.regionArea, 2) : 0,
            filters: M["pattern.filters"], sort: M["pattern.sort"], pagination: M["pattern.pagination"],
            articleTag: vis.some((el) => el.tagName === "ARTICLE" && (el.innerText ?? "").split(/\s+/).length > 250) ? 1 : 0,
            // marketing or transactional: is there a catalogue to search, compare and buy from?
            search: M["pattern.search"],
            pricedCardShare: facts.length ? round(facts.filter((f) => f.price).length / facts.length, 2) : 0,
            priceRuns: textRuns.filter((t) => PRICE.test(t.text)).length,
            cartLink: vis.some((el) => (el.tagName === "A" || el.tagName === "BUTTON") && /(^|[^a-z])(cart|basket|checkout|bag|warenkorb|carrello)([^a-z]|$)/i.test(`${el.getAttribute("href") ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""} ${el.id} ${el.className?.toString?.() ?? ""}`)) ? 1 : 0,
            buyLinks: vis.filter((el) => (el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button") && buyRe.test(labelOf(el))).length,
            bookWords: vis.filter((el) => (el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button") && /\b(book(ing)?|tickets?|reserve|availability|add to (cart|basket))\b/i.test(labelOf(el).slice(0, 60))).length,
            marketingCtas: buttons.filter((b) => !inCard(b.el) && MARKETING_CTA.test(b.text)).length,
            screens: round(screens, 1),
        };
        E["detail.price"] = buy.map((b) => b.el);

        // fold metrics were taken before any viewport growth
        const F = state.fold;
        Object.assign(M, F.metrics);
        if (!M["detail.price"]) M["detail.priceInFold"] = null;

        // what the probes will poke, tagged so the runner can find them
        for (const el of all()) if (el.hasAttribute("data-pd-probe")) el.removeAttribute("data-pd-probe");
        const fits = (el) => { const f = boxOf.get(el)?.full; return f && f.x >= 0 && f.x + f.w <= innerWidth && f.w > 8 && f.h > 8; };
        const pick = (list, n) => { const seen = new Set(), out = []; for (const el of list) { if (!fits(el)) continue; const f = boxOf.get(el).full; const k = `${labelOf(el).slice(0, 20)}|${Math.round(f.w)}x${Math.round(f.h)}`; if (seen.has(k) && list !== cardList) continue; seen.add(k); out.push(el); if (out.length >= n) break; } return out; };
        const probeButtons = pick(buttons.filter((b) => b.kind !== "ghost" && !inCard(b.el)).map((b) => b.el), 5);
        const probeList = [
            ...pick(cardList, 5).map((el) => ({ el, kind: "card" })),
            ...probeButtons.map((el) => ({ el, kind: "button" })),
            ...pick(ctx.linkList.filter((el) => !probeButtons.includes(el)), 3).map((el) => ({ el, kind: "link" })),
            ...pick(fields.filter((el) => !/checkbox|radio/.test(el.type ?? "")), 3).map((el) => ({ el, kind: "input" })),
            ...pick(rowList, 3).map((el) => ({ el, kind: "row" })),
        ];
        state.probes = probeList.map((p) => p.el);
        probeList.forEach((p, i) => p.el.setAttribute("data-pd-probe", String(i)));
        const probes = probeList.map((p, i) => { const f = boxOf.get(p.el).full; return { i, kind: p.kind, sel: selector(p.el), text: labelOf(p.el).slice(0, 40), rect: [Math.round(f.x), Math.round(f.y), Math.round(f.w), Math.round(f.h)] }; });

        const evidence = { ...F.evidence, ...evidenceOf(E, ctx) };
        return {
            metrics: M, evidence, signals, probes,
            detail: { boldGroups, typeUse, sections: sectionDetail, typePairs: T.pairs.slice(0, 12), sizeList: T.sizeList, surfaces: out.depth.surfaceColours.slice(0, 6), gaps: gapSorted.slice(0, 12), title: document.title, url: asUrl.href, pageBackground: hex(pageBg) },
            pixel: { fold: { imageRects: F.imageRects, coverRects: F.coverRects }, full: { imageRects: out.imageRects, coverRects: out.coverRects }, contrastJobs, contrastDom, regionHeight: out.regionHeight },
            legacy: opts.legacy ? { fold: strip(F.legacy), full: strip(out) } : undefined,
        };
    }
    const strip = (o) => { const c = { ...o }; delete c.imageRects; delete c.coverRects; return c; };

    // ---------- probes ----------
    const PROPS = ["transform", "scale", "translate", "boxShadow", "backgroundColor", "backgroundImage", "color", "opacity", "filter", "textDecorationLine", "borderTopColor", "borderBottomColor", "outlineStyle", "outlineWidth", "outlineColor", "outlineOffset"];
    function snapshot(i) {
        const target = state.probes[i];
        const list = [target, ...target.querySelectorAll("*")].slice(0, 150);
        // design systems often draw hover, pressed and focus states on ::before or ::after (a tint layer, a ring)
        return list.map((e) => [null, "::before", "::after"].flatMap((pseudo) => { const s = getComputedStyle(e, pseudo); return PROPS.map((p) => s[p]); }));
    }
    /** Scrolls probe i into the middle of the viewport; returns where to point and whether the point lands on it. */
    function aim(i) {
        const target = state.probes[i];
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        const r = target.getBoundingClientRect();
        const x = Math.round(Math.min(Math.max(r.left + r.width / 2, 2), innerWidth - 2)), y = Math.round(Math.min(Math.max(r.top + Math.min(r.height / 2, 40), 2), innerHeight - 2));
        let hit = document.elementFromPoint(x, y);
        while (hit?.shadowRoot) { const inner = hit.shadowRoot.elementFromPoint(x, y); if (!inner || inner === hit) break; hit = inner; }
        const lands = !!closest(hit, (n) => n === target);
        state.base.set(i, snapshot(i));
        return { x, y, lands };
    }
    function changed(i) {
        const before = state.base.get(i), after = snapshot(i);
        const props = new Set();
        for (let k = 0; k < Math.min(before.length, after.length); k++) for (let p = 0; p < before[k].length; p++) if (before[k][p] !== after[k][p]) props.add(PROPS[p % PROPS.length]);
        return [...props].sort();
    }

    window.__pd = { prepareBegin, scrollMain, pending, loading, settle, overflow, freeze, stillStyles, fold, full, aim, changed, probeEl: (i) => state.probes[i] };
})();
