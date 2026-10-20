// Page → Paper-ready HTML. Modelled on the Paper Snapshot extension's serialiser (v0.4.4):
// computed styles inlined as a diff against a neutral sibling probe, pseudo-elements as real
// children, tables/body rewritten to divs, SVG <use> inlined, canvas/video rasterised.
// Additions for agent capture: fixed elements hoisted to page coordinates, viewport mode,
// iframe placeholders, layer names, and a tree output so the pusher can chunk large pages.
//
// Evaluated as an expression: (SOURCE)({ selector, mode: "full" | "viewport", html? }).
// Resolves to { url, title, width, height, scrollY, stats, tree } where tree nodes are
// strings (leaf HTML) or { open, close, children } (element whose children may be split).
// With html: true it resolves to { width, height, stats, html } instead (MCP-only fallback).
(async (opts = {}) => {
    const { selector = "html", mode = "full" } = opts;
    const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    const BLOCK = new Set(["address", "article", "aside", "blockquote", "center", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "listing", "main", "menu", "nav", "ol", "p", "pre", "search", "section", "summary", "table", "ul"]);
    const ALWAYS = ["display", "appearance", "box-sizing"];
    // Properties Paper has no use for; dropping them keeps payloads small.
    const DROP = /^(transition|animation|cursor|pointer-events|user-select|-webkit-user-select|will-change|touch-action|scroll-|overscroll|caret-color|outline-offset|-webkit-tap-highlight|content-visibility|contain|view-transition|interpolate-size|speak|orphans|widows|page-break|break-|resize|tab-size|counter-|quotes|ruby-|text-size-adjust|-webkit-text-size-adjust|-webkit-locale|-webkit-font-smoothing|-webkit-rtl|-webkit-user-modify|-webkit-line-break|-webkit-highlight|-webkit-print|-webkit-writing-mode|text-rendering|font-optical-sizing|font-kerning|font-synthesis|image-rendering|shape-|math-|forced-color|color-scheme|accent-color|field-sizing|anchor-|position-anchor|position-try|position-visibility|timeline|animation-|app-region|buffered-rendering|dominant-baseline|alignment-baseline|baseline-shift|color-interpolation|color-rendering|flood-|lighting-color|marker|mask-type|stop-|vector-effect|zoom)/;
    const LAYOUT_INITIAL = { "flex-grow": "0", "flex-shrink": "1", "flex-basis": "auto", "align-self": "auto", "justify-self": "auto", order: "0", "grid-column-start": "auto", "grid-column-end": "auto", "grid-row-start": "auto", "grid-row-end": "auto" };
    const PROPS = Array.from(getComputedStyle(document.body))
        .concat(["aspect-ratio", "paint-order", "text-underline-offset", "text-decoration-thickness", "transform-box", "-webkit-text-stroke-color", "-webkit-text-stroke-width"])
        .filter((p) => !p.startsWith("--") && !DROP.test(p));

    // App-shell pages scroll inside a 100%-height container, so the document is one viewport tall.
    // In full mode, let the main scroller and its ancestors grow to their content for the capture.
    // Web-component storefronts keep the scroller inside shadow roots, so walk them too.
    function deepElements(root = document) {
        const out = [];
        const walk = (r) => { for (const e of r.querySelectorAll("*")) { out.push(e); if (e.shadowRoot) walk(e.shadowRoot); } };
        walk(root);
        return out;
    }
    function deepHit(x, y) {
        let el = document.elementFromPoint(x, y);
        while (el?.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; }
        return el;
    }
    function deepContains(a, b) { for (let e = b; e; e = upward(e)) if (e === a) return true; return false; }
    const upward = (e) => e.parentElement ?? (e.parentNode instanceof ShadowRoot ? e.parentNode.host : null);
    // scope: a component root; its own scrollers (a dialog body) unroll up to the root so the
    // whole dialog is captured, not just the part scrolled into view.
    function unroll(scope) {
        const undo = [];
        let scrollers = scope
            ? deepElements(scope).filter((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY))
            : deepElements().filter((e) => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY) && e.clientHeight >= innerHeight * 0.5 && e.clientWidth >= innerWidth * 0.5);
        if (scope && (scope.scrollHeight > scope.clientHeight + 1)) scrollers.push(scope);
        // A dialog laid out against a 0×0 portal keeps its width only while positioned; pin it.
        if (scope && scrollers.length) {
            const before = scope.getAttribute("style");
            scope.style.setProperty("width", `${scope.getBoundingClientRect().width}px`, "important");
            undo.push(() => (before === null ? scope.removeAttribute("style") : scope.setAttribute("style", before)));
        }
        // Stacked panes (a product panel slid over the results it came from) each scroll; only the
        // one on top is the page. Hide the panes underneath so they cannot shape the capture.
        if (!scope && scrollers.length > 1) {
            // A closed sheet can leave a transparent full-screen spacer on top; look through boxes
            // that paint nothing until something visible is hit.
            const paints = (e) => { const c = getComputedStyle(e); return (c.backgroundColor !== "rgba(0, 0, 0, 0)" && c.backgroundColor !== "transparent") || c.backgroundImage !== "none" || c.boxShadow !== "none" || /^(IMG|SVG|CANVAS|VIDEO)$/i.test(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); };
            const visibleHit = (x, y) => {
                const lifted = [];
                let hit = deepHit(x, y);
                while (hit && !paints(hit) && lifted.length < 20) { lifted.push([hit, hit.style.pointerEvents]); hit.style.setProperty("pointer-events", "none", "important"); hit = deepHit(x, y); }
                for (const [e, pe] of lifted) e.style.pointerEvents = pe;
                return hit;
            };
            // A pane slid off screen (a closed product pane parked to the right) is never the page;
            // among on-screen panes, the one hit-testing shows on top wins.
            const onScreen = scrollers.filter((s) => { const r = s.getBoundingClientRect(); return r.left < innerWidth / 2 && r.right > innerWidth / 2; });
            const hitTop = onScreen.filter((s) => { const r = s.getBoundingClientRect(); let hit = visibleHit(r.left + r.width / 2, r.top + Math.min(r.height / 2, 200)); for (; hit; hit = upward(hit)) if (hit === s) return true; return false; });
            let onTop = hitTop.length ? hitTop : onScreen.length === 1 ? onScreen : [];
            // The pane on top may not scroll at all (a short cart sheet over product and results):
            // then every scroller is underneath and none of them shapes the page.
            const centre = visibleHit(innerWidth / 2, innerHeight / 2);
            const coveredAll = centre && !scrollers.some((s) => deepContains(s, centre));
            if (coveredAll) onTop = [];
            if (onTop.length || coveredAll) {
                const hidden = new Set();
                for (const s of scrollers) if (!onTop.includes(s)) {
                    const keep = coveredAll ? [centre] : onTop;
                    let pane = s; while (upward(pane) && !keep.some((t) => deepContains(upward(pane), t))) pane = upward(pane);
                    // The covered pane and its stack-mates (the scrim between the panes) go.
                    for (const sib of upward(pane)?.children ?? []) {
                        if (hidden.has(sib) || keep.some((t) => deepContains(sib, t)) || getComputedStyle(sib).display === "none") continue;
                        hidden.add(sib);
                        const before = sib.getAttribute("style");
                        sib.style.setProperty("display", "none", "important");
                        undo.push(() => (before === null ? sib.removeAttribute("style") : sib.setAttribute("style", before)));
                    }
                }
                scrollers = onTop;
            }
        }
        const touched = new Set();
        for (const s of scrollers) for (let e = s; e && !touched.has(e); e = upward(e)) { touched.add(e); if (e === scope) break; }
        for (const e of touched) {
            const before = e.getAttribute("style");
            e.style.setProperty("height", "auto", "important");
            e.style.setProperty("max-height", "none", "important");
            // A horizontally scrolled ancestor (a pager that slid to its second page) would snap
            // back to scrollLeft 0 with overflow: visible; with height auto it no longer scrolls
            // vertically anyway, and the serialiser shifts its content by scrollLeft.
            if (e.scrollLeft === 0) e.style.setProperty("overflow", "visible", "important");
            // A full-screen fixed shell (inset: 0) pins its height to the viewport whatever
            // height says, so put it back in flow.
            // Absolute keeps its top/left offset (e.g. below a fixed header) but lets it grow.
            // An absolute pane stretched by insets (top and bottom set) keeps the container's
            // height whatever height says; put it in flow so it grows with its content.
            const pcs = getComputedStyle(e);
            if (pcs.position === "absolute" && pcs.top !== "auto" && pcs.bottom !== "auto") { e.style.setProperty("position", "relative", "important"); e.style.setProperty("inset", "auto", "important"); }
            if (getComputedStyle(e).position === "fixed") { e.style.setProperty("position", "absolute", "important"); e.style.setProperty("bottom", "auto", "important"); }
            undo.push(() => (before === null ? e.removeAttribute("style") : e.setAttribute("style", before)));
        }
        return () => undo.reverse().forEach((f) => f());
    }
    const scopeEl = mode === "component" ? (document.querySelector(selector) ?? deepElements().find((e) => e.matches(selector))) : null;
    const restoreScroll = mode === "full" ? unroll() : mode === "component" && scopeEl ? unroll(scopeEl) : () => {};

    // Selectors also reach into shadow roots (component captures tag their targets there).
    const root = document.querySelector(selector) ?? deepElements().find((e) => e.matches(selector));
    if (!root) throw new Error(`No element matches ${selector}`);
    const rootRect = root.getBoundingClientRect();
    const isDocRoot = root === document.documentElement || root === document.body;
    const stats = { elements: 0, skippedHidden: 0, iframes: 0, canvases: 0, images: 0 };
    const hoisted = [];

    const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    const escAttr = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    const styleText = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v};`).join(" ");
    const attrsText = (list) => list.map(([k, v]) => ` ${k}="${escAttr(String(v))}"`).join("");

    // Reduced-motion emulation + finished transitions, as the extension does, so menus/dialogs
    // are captured at their end state. Returns an undo function.
    function settleMotion() {
        const undo = [];
        const reduced = /\(\s*prefers-reduced-motion\s*(?::\s*reduce\s*)?\)/i;
        const rules = [];
        const walk = (list, seen) => {
            for (const r of Array.from(list)) {
                if (r instanceof CSSImportRule) { if (r.styleSheet && !seen.has(r.styleSheet)) { seen.add(r.styleSheet); try { walk(r.styleSheet.cssRules, seen); } catch {} } continue; }
                if (r instanceof CSSMediaRule) {
                    if (reduced.test(r.media.mediaText) && !/^\s*(only\s+)?not\b/i.test(r.media.mediaText)) {
                        rules.push(Array.from(r.cssRules, (c) => c.cssText).join("\n"));
                    } else walk(r.cssRules, seen);
                    continue;
                }
                if (r.cssRules && /^@(supports|layer|container|scope)/i.test(r.cssText)) walk(r.cssRules, seen);
            }
        };
        const seen = new WeakSet();
        for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])]) {
            if (seen.has(sheet)) continue;
            seen.add(sheet);
            try { walk(sheet.cssRules, seen); } catch {}
        }
        if (rules.length) {
            const extra = new CSSStyleSheet();
            try {
                extra.replaceSync(rules.join("\n"));
                const before = [...document.adoptedStyleSheets];
                document.adoptedStyleSheets = [...before, extra];
                undo.push(() => { document.adoptedStyleSheets = before; });
            } catch {}
        }
        for (const a of document.getAnimations()) {
            try { if (a instanceof CSSTransition || isFinite(a.effect?.getComputedTiming().endTime ?? Infinity)) a.finish(); } catch {}
        }
        return () => undo.forEach((f) => f());
    }

    function layoutParent(el) {
        let t = el;
        for (;;) {
            const p = t.assignedSlot ?? t.parentElement ?? (t.parentNode instanceof ShadowRoot ? t.parentNode.host : null);
            if (!p) return null;
            if (getComputedStyle(p).display !== "contents") return p;
            t = p;
        }
    }
    function inTopLayer(el) {
        for (let e = el; e; e = e.parentElement ?? (e.parentNode instanceof ShadowRoot ? e.parentNode.host : null)) {
            try { if (e.matches(":popover-open, :modal")) return true; } catch {}
        }
        return false;
    }
    function insideSvg(el) {
        for (let p = el.parentElement; p; p = p.parentElement) if (p instanceof SVGElement) return true;
        return false;
    }
    function inheritedBg(el) {
        for (let p = el.parentElement; p; p = p.parentElement) {
            const c = getComputedStyle(p).backgroundColor;
            if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
        }
        return "rgb(255, 255, 255)";
    }
    function readStyles(target, pseudo) {
        const out = new Map();
        if (pseudo) {
            const cs = getComputedStyle(target, pseudo);
            for (const p of PROPS) out.set(p, cs.getPropertyValue(p));
            return out;
        }
        const map = target.computedStyleMap();
        const cs = getComputedStyle(target);
        for (const p of PROPS) {
            let v = null;
            try { v = map.get(p); } catch {}
            if (v) out.set(p, v.toString());
            else { const g = cs.getPropertyValue(p); if (g) out.set(p, g); }
        }
        return out;
    }
    // The extension's core trick: compare against a <link> probe placed beside the element, so
    // inherited values and UA defaults cancel out and only meaningful declarations survive.
    function diffStyles(el, { isRoot = false, pseudo } = {}) {
        const mine = readStyles(el, pseudo);
        const probe = document.createElement("link");
        const neutral = { "background-color": "transparent", "border-color": "hotpink", "border-radius": "0", "border-width": "0px", "border-style": "none", "box-shadow": "none", fill: "black", "font-size": "1px", "font-weight": "400", height: "auto", margin: "0", overflow: "visible", position: "static", inset: "auto", transform: "none", translate: "none", rotate: "none", scale: "none", padding: "0", "text-align": "initial", width: "auto", "z-index": "auto" };
        for (const [k, v] of Object.entries(neutral)) probe.style.setProperty(k, v, "important");
        if (isRoot) Object.assign(probe.style, { color: "hotpink", lineHeight: "0.1234", fontFamily: '"Papyrus"', listStyleType: "initial" });
        if (el === document.documentElement) el.appendChild(probe);
        else if (el.parentElement?.lastElementChild === el) el.insertAdjacentElement("afterend", probe);
        else el.insertAdjacentElement("beforebegin", probe);
        const base = readStyles(probe, pseudo);
        probe.remove();
        const out = {};
        for (const p of PROPS) {
            const v = mine.get(p);
            if (v && (v !== base.get(p) || ALWAYS.includes(p))) out[p] = v;
        }
        // The probe picks up sibling-wide rules (`li > * { flex: 1 }`), which would cancel the
        // element's own flex/grid placement; judge those against their initial values instead.
        if (!pseudo) for (const [p, initial] of Object.entries(LAYOUT_INITIAL)) { const v = mine.get(p); if (v && v !== initial) out[p] = v; }
        if ((pseudo === "::before" || pseudo === "::after") && (!out.content || out.content === "none" || out.content === "normal")) return {};
        return prune(out, mine);
    }
    // Drop values that cannot render (colours of absent borders/outlines) and logical duplicates
    // of physical properties; this roughly halves the payload versus the extension's output.
    function prune(out, mine) {
        for (const k of Object.keys(out)) if (/-(block|inline)(-|$)|^(min-|max-)?(block|inline)-size$|^column-rule|^text-emphasis/.test(k)) delete out[k];
        for (const side of ["top", "right", "bottom", "left"]) {
            if (mine.get(`border-${side}-style`) === "none" || mine.get(`border-${side}-width`) === "0px") for (const p of ["color", "width", "style"]) delete out[`border-${side}-${p}`];
        }
        if (mine.get("outline-style") === "none") for (const k of Object.keys(out)) if (k.startsWith("outline")) delete out[k];
        // next/font hashes family names (__Inter_Tight_d65c78) and adds metric fallbacks; Paper
        // only knows the real family names.
        if (out["font-family"]) out["font-family"] = out["font-family"]
            .split(",").map((f) => f.trim())
            .filter((f) => !/^["']?__.+_Fallback_[0-9a-f]+["']?$/.test(f))
            .map((f) => f.replace(/^["']?__(.+?)_[0-9a-f]{5,}["']?$/, (_, n) => `"${n.replaceAll("_", " ")}"`))
            // Paper takes the first family and falls back to a serif when it is unknown, so the
            // OS system-font keywords become Inter (closest Paper-available match to SF/Segoe).
            .map((f) => (/^["']?(system-ui|-apple-system|BlinkMacSystemFont|Segoe UI|ui-sans-serif)["']?$/i.test(f) ? "Inter" : f))
            .filter((f, i, all) => all.indexOf(f) === i)
            .join(", ");
        if (out["background-image"]) out["background-image"] = out["background-image"].replace(/,\s*none\b/g, "");
        // Chrome reports display: -webkit-box as flow-root; Paper only clamps lines on -webkit-box.
        if (out["-webkit-line-clamp"] && out["-webkit-line-clamp"] !== "none" && /flow-root|block/.test(out.display ?? "")) out.display = "-webkit-box";
        if (mine.get("text-decoration-line") === "none") delete out["text-decoration-color"];
        if (mine.get("-webkit-text-fill-color") === mine.get("color")) delete out["-webkit-text-fill-color"];
        if (parseFloat(mine.get("-webkit-text-stroke-width") ?? "0") === 0) { delete out["-webkit-text-stroke-color"]; delete out["-webkit-text-stroke-width"]; }
        return out;
    }
    function collapsedScale(s) {
        return ["matrix(0, 0, 0, 1, 0, 0)", "matrix(0, 0, 0, 0, 0, 0)", "scaleX(0)", "scale(0)", "scaleY(0)"].includes(s.transform ?? "") && ["absolute", "fixed"].includes(s.position ?? "");
    }
    function pseudoHtml(s, tag) {
        const parts = [];
        for (const m of (s.content ?? "").split(" / ")[0].matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3/g)) {
            if (m[0].startsWith("url(")) { if (m[2]) parts.push({ url: m[2] }); } else parts.push({ text: m[4] });
        }
        delete s.content;
        const st = escAttr(styleText(s));
        if (parts.length === 1 && parts[0].url) return `<img src="${escAttr(parts[0].url)}" style="${st}">`;
        return `<${tag} style="${st}">${parts.map((p) => (p.url ? `<img src="${escAttr(p.url)}">` : esc(p.text))).join("")}</${tag}>`;
    }
    function textOf(node) {
        const t = node.textContent;
        if (!t) return "";
        const ws = node.parentElement ? getComputedStyle(node.parentElement).whiteSpace : "normal";
        if (ws === "pre" || ws === "pre-wrap") return t;
        if (ws === "pre-line") return t.replace(/[\t\f\r ]+/g, " ");
        const core = t.replace(/[\t\n\r\f ]+/g, " ").replace(/^ | $/g, "");
        const rendered = (a, b) => { const r = document.createRange(); r.setStart(node, a); r.setEnd(node, b); return r.getBoundingClientRect().width > 0; };
        if (core) {
            const lead = /^[\t\n\r\f ]*/.exec(t)[0].length;
            const trail = /[\t\n\r\f ]*$/.exec(t)[0].length;
            return (lead && rendered(0, lead) ? " " : "") + core + (trail && rendered(t.length - trail, t.length) ? " " : "");
        }
        const r = document.createRange();
        r.selectNode(node);
        return r.getBoundingClientRect().width === 0 ? "" : " ";
    }
    function layerName(el, tag) {
        const label = el.getAttribute("aria-label") || el.id || "";
        if (["header", "nav", "main", "footer", "section", "aside", "form", "dialog", "button", "ul", "ol", "li"].includes(tag)) return label ? `${tag} · ${label}` : tag;
        return label;
    }
    function raster(el) {
        try {
            if (el instanceof HTMLCanvasElement) return el.toDataURL("image/png");
            if (el instanceof HTMLVideoElement && el.readyState >= 2) {
                const c = document.createElement("canvas");
                c.width = el.videoWidth; c.height = el.videoHeight;
                c.getContext("2d").drawImage(el, 0, 0);
                return c.toDataURL("image/png");
            }
        } catch {}
        return null;
    }

    function serialise(node, scope, isRoot) {
        if (!(node instanceof Element)) return node instanceof Text ? esc(textOf(node)) : "";
        const tagName = node.tagName.toLowerCase();
        const cs = getComputedStyle(node);
        const positioned = ["absolute", "fixed"].includes(cs.position);
        const parentIsBlock = !!node.parentElement && ["block", "inline-block"].includes(getComputedStyle(node.parentElement).display);
        // A collapsed accordion row (`grid-template-rows: 0fr` over a clipping child): Paper does not
        // collapse the track, so the hidden panel would be drawn open.
        const parentIsGrid = !!node.parentElement && /grid/.test(getComputedStyle(node.parentElement).display);
        const zero = parseFloat(cs.height) === 0 || parseFloat(cs.width) === 0;
        const padded = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some((p) => parseFloat(cs[p]) > 0);
        const clips = cs.overflowX !== "visible" && cs.overflowY !== "visible";
        const parent = node.parentElement ?? (node.parentNode instanceof ShadowRoot ? node.parentNode : null);
        const svgChild = insideSvg(node);
        const invisible = cs.display !== "contents" && !svgChild && !node.checkVisibility();
        if (
            (zero && (positioned || parentIsBlock || (parentIsGrid && parseFloat(cs.height) === 0)) && !padded && clips) ||
            cs.display === "none" ||
            (cs.opacity === "0" && (positioned || parent?.childElementCount === 1)) ||
            ["script", "style", "meta", "link", "noscript", "template", "head", "title"].includes(tagName) ||
            invisible
        ) {
            if (invisible) stats.skippedHidden++;
            return "";
        }
        // A viewport capture only needs what is on screen; an off-screen block becomes an empty
        // box of the same size (keeps the flow), which keeps payloads and the Paper file small.
        if (mode === "viewport" && !isRoot && !keepForFixed.has(node) && !/^(inline|contents|table-)/.test(cs.display) && !positioned && cs.position !== "sticky") {
            const r = node.getBoundingClientRect();
            if (r.bottom < -100 || r.top > innerHeight + 100 || r.right < -100 || r.left > innerWidth + 100) {
                stats.offscreen = (stats.offscreen ?? 0) + 1;
                return `<div layer-name="off-screen" style="display: block; flex-shrink: 0; width: ${Math.round(r.width)}px; height: ${Math.round(r.height)}px; margin: ${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft};"></div>`;
            }
        }
        stats.elements++;
        const order = stats.elements;

        if (tagName === "iframe") {
            stats.iframes++;
            const r = node.getBoundingClientRect();
            let host = "";
            try { host = new URL(node.src).host; } catch {}
            return `<div layer-name="iframe${host ? ` · ${host}` : ""}" style="display: flex; align-items: center; justify-content: center; width: ${Math.round(r.width)}px; height: ${Math.round(r.height)}px; background-color: rgb(238, 238, 238); color: rgb(120, 120, 120); font-family: system-ui; font-size: 13px;">${esc(host || "embedded frame")}</div>`;
        }

        let tag = ["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col", "body", "html"].includes(tagName) ? "div" : tagName;
        const drawable = !(node instanceof SVGElement) || node instanceof SVGGraphicsElement;
        const rendersBox = svgChild || cs.display !== "contents";
        const childScope = rendersBox ? (tag === "p" ? { ...scope, inParagraph: true } : tag === "a" ? { ...scope, inAnchor: true } : tag === "button" ? { ...scope, inButton: true, inParagraph: false } : scope) : scope;
        const pseudoTag = childScope.inParagraph ? "span" : "div";
        const children = [];
        let style = {};
        if (drawable) {
            const before = diffStyles(node, { pseudo: "::before" });
            if (Object.keys(before).length && !collapsedScale(before)) children.push(pseudoHtml(before, pseudoTag));
            style = diffStyles(node, { isRoot });
        }
        const attrs = node.getAttributeNames().map((a) => [a, node.getAttribute(a) ?? ""]);
        let kids = node.shadowRoot ? Array.from(node.shadowRoot.childNodes) : Array.from(node.childNodes);
        if (node instanceof HTMLCanvasElement || node instanceof HTMLVideoElement || node instanceof HTMLSelectElement) kids = [];
        if (node instanceof HTMLSelectElement) {
            const o = node.options[node.selectedIndex];
            if (o) children.push(`<option selected>${esc(o.textContent ?? "")}</option>`);
        }
        for (const kid of kids) {
            const expanded = [];
            if (kid instanceof HTMLSlotElement) expanded.push(...kid.assignedNodes({ flatten: true }));
            else if (kid instanceof SVGElement && kid.tagName === "use") {
                const id = (kid.getAttribute("href") ?? kid.getAttribute("xlink:href") ?? "").replace("#", "");
                const rootNode = kid.getRootNode();
                const ref = id && rootNode.getElementById ? rootNode.getElementById(id) : null;
                if (ref && ["symbol", "svg"].includes(ref.tagName)) {
                    for (const a of ref.getAttributeNames()) {
                        if (["id", "class", "style"].includes(a)) continue;
                        if (a === "viewBox" || a === "preserveAspectRatio") {
                            const i = attrs.findIndex(([n]) => n === a);
                            if (i >= 0) attrs.splice(i, 1);
                            attrs.push([a, ref.getAttribute(a)]);
                        } else if (!node.hasAttribute(a)) attrs.push([a, ref.getAttribute(a)]);
                    }
                    expanded.push(...Array.from(ref.childNodes));
                } else if (ref) expanded.push(ref);
            } else expanded.push(kid);
            for (const n of expanded) children.push(serialise(n, childScope, false));
        }
        const after = diffStyles(node, { pseudo: "::after" });
        if (Object.keys(after).length && !collapsedScale(after)) children.push(pseudoHtml(after, pseudoTag));

        // A scrolled container (bottom sheet parked at its snap point, a carousel moved on) shows
        // its content offset by the scroll position, which Paper has no notion of; shift the
        // content with a wrapper that keeps the container's own layout.
        if (!isRoot && (node.scrollTop > 0 || node.scrollLeft > 0) && cs.overflowX !== "visible" && children.length) {
            const keep = ["display", "flex-direction", "flex-wrap", "align-items", "justify-content", "column-gap", "row-gap", "grid-template-columns", "grid-template-rows", "grid-auto-flow", "grid-auto-columns", "grid-auto-rows"];
            const ws = { ...Object.fromEntries(keep.filter((k) => style[k] !== undefined).map((k) => [k, style[k]])), "flex-shrink": "0", "margin-top": `${-Math.round(node.scrollTop)}px`, "margin-left": `${-Math.round(node.scrollLeft)}px` };
            // Sized like the container's content box so % sizes (a pager's 100%-wide pages) resolve
            // as they did in the browser; the scrolled-past content simply overflows.
            if (/flex|grid/.test(cs.display)) { ws.width = `${node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`; ws.height = `${node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)}px`; }
            ws.display ??= "block";
            children.splice(0, children.length, { open: `<div layer-name="scrolled content" style="${escAttr(styleText(ws))}">`, close: "</div>", children: [...children] });
        }
        // Paper's font metrics run a touch wider than Chrome's, so text that fits one line in the
        // browser can wrap in Paper ("1 / 20" stacking, badges losing a word); keep it on one line.
        if (!isRoot && children.length && children.every((c) => typeof c === "string") && /^(normal|break-spaces)$/.test(cs.whiteSpace) && !style["-webkit-line-clamp"] && node.textContent.trim()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
            // Only where the box hugs its text: nowrap makes Paper's text box hug too, which would
            // lose centring/right-alignment inside a wider box.
            const box = node.getBoundingClientRect(), pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
            if (tops.size === 1 && range.getBoundingClientRect().width >= box.width - pad - 2) style["white-space"] = "nowrap";
        }
        // Paper reads a block whose children are all inline-level boxes (a list of inline-block chips)
        // as one run of text and drops the boxes; lay such a row out as a wrapping flex row.
        if (!isRoot && /^(block|list-item|flow-root)$/.test(cs.display) && node instanceof HTMLElement && ![...node.childNodes].some((n) => n instanceof Text && n.textContent.trim())) {
            const kids = [...node.children].filter((k) => k.checkVisibility() && !["absolute", "fixed"].includes(getComputedStyle(k).position));
            if (kids.length >= 2 && kids.every((k) => /^inline-(block|flex|grid)$/.test(getComputedStyle(k).display))) {
                const r0 = kids[0].getBoundingClientRect(), r1 = kids[1].getBoundingClientRect();
                const m = parseFloat(getComputedStyle(kids[0]).marginRight) + parseFloat(getComputedStyle(kids[1]).marginLeft);
                const gap = Math.abs(r0.top - r1.top) < 2 ? Math.max(0, Math.round((r1.left - r0.right - m) * 100) / 100) : 0;
                Object.assign(style, { display: "flex", "flex-wrap": "wrap", "align-items": "baseline", "justify-content": /center/.test(cs.textAlign) ? "center" : /right|end/.test(cs.textAlign) ? "flex-end" : "flex-start" });
                if (gap) style["column-gap"] = `${gap}px`;
            }
        }
        // Paper turns a text-only element into a Text node, which only line-clamps while it sizes
        // itself (no height, no flex-grow) and never clips; text inside a clipping frame does clip.
        // So a clamped text box drops its fixed/flexed height, and other clipped text gets a span.
        const clipsText = (style["overflow-x"] === "hidden" || style["overflow-y"] === "hidden" || style["overflow-x"] === "clip") && !/^inline$/.test(cs.display);
        if (!isRoot && clipsText && children.length && children.every((c) => typeof c === "string") && !VOID.has(tag) && !(node instanceof SVGElement)) {
            if (style["-webkit-line-clamp"] && style["-webkit-line-clamp"] !== "none") {
                style.display = "-webkit-box";
                for (const k of ["height", "flex-grow", "flex-basis", "min-height", "max-height"]) delete style[k];
            } else children.splice(0, children.length, { open: "<span>", close: "</span>", children: [...children] });
        }
        // Paper only clamps a text-only layer. A clamped box whose text sits in inline children keeps
        // the height the browser clamped it to and clips an inner frame holding the text (the ellipsis is lost).
        if (!isRoot && clipsText && style["-webkit-line-clamp"] && style["-webkit-line-clamp"] !== "none" && children.some((c) => typeof c !== "string") && !VOID.has(tag) && !(node instanceof SVGElement)) {
            for (const k of ["-webkit-line-clamp", "-webkit-box-orient", "flex-grow", "flex-basis", "min-height", "max-height"]) delete style[k];
            Object.assign(style, { display: "block", height: `${Math.round(node.getBoundingClientRect().height * 100) / 100}px` });
            children.splice(0, children.length, { open: "<div>", close: "</div>", children: [...children] });
        }
        const out = [];
        if (node instanceof HTMLImageElement) {
            stats.images++;
            out.push(["src", node.currentSrc || node.src]);
            if (node.alt) out.push(["alt", node.alt]);
            if (!style.width && !style.height) { style.width = cs.width; style.height = cs.height; }
            for (const dim of ["width", "height"]) {
                if (!style[dim]?.includes("%")) continue;
                const p = layoutParent(node);
                if (!p) continue;
                const was = p.getBoundingClientRect()[dim];
                const inline = node.getAttribute("style");
                node.style.setProperty(dim, "0px", "important");
                const now = p.getBoundingClientRect()[dim];
                if (inline === null) node.removeAttribute("style"); else node.setAttribute("style", inline);
                if (now !== was) style[dim] = cs[dim];
            }
        }
        // A flex box holding only text becomes a Paper Text node that reads justify-content as text
        // alignment; in the browser a wrapping text item fills the line, so its own text-align rules.
        if (/flex/.test(cs.display) && children.length && children.every((c) => typeof c === "string")) {
            style["text-align"] = cs.textAlign === "start" ? "left" : cs.textAlign;
            const range = document.createRange(); range.selectNodeContents(node);
            if (new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size > 1) delete style["justify-content"];
        }
        // Paper centres button text by default; carry the button's real alignment.
        if (node instanceof HTMLButtonElement && !style["text-align"]) style["text-align"] = cs.textAlign === "start" ? "left" : cs.textAlign;
        if (node instanceof HTMLInputElement) {
            if (node.value) out.push(["value", node.value]);
            if (node.type) out.push(["type", node.type]);
            if (node.checked || node.defaultChecked) out.push(["checked", "true"]);
            if (node.placeholder) { out.push(["placeholder", node.placeholder]); out.push(["data-paper-placeholder-styles", styleText(diffStyles(node, { pseudo: "::placeholder" }))]); }
            if ((node.type === "checkbox" || node.type === "radio") && style.appearance === "none" && children.length) tag = "div";
        } else if (node instanceof HTMLTextAreaElement) {
            if (node.value) children.unshift(esc(node.value));
            if (node.placeholder) { out.push(["placeholder", node.placeholder]); out.push(["data-paper-placeholder-styles", styleText(diffStyles(node, { pseudo: "::placeholder" }))]); }
        }
        if (node instanceof HTMLCanvasElement || node instanceof HTMLVideoElement) {
            stats.canvases++;
            const data = raster(node);
            if (data) {
                tag = "img";
                out.push(["src", data]);
                if (!style.width || style.width === "auto") style.width = cs.width;
                if (!style.height || style.height === "auto") style.height = cs.height;
            }
        }
        if ((scope.inParagraph && BLOCK.has(tag)) || (scope.inAnchor && tag === "a") || (scope.inButton && tag === "button")) tag = "span";
        if (node instanceof SVGElement) {
            const svgCs = getComputedStyle(node);
            if (!style.width || style.width === "auto") style.width = svgCs.width;
            if (!style.height || style.height === "auto") style.height = svgCs.height;
            for (let [a, v] of attrs) {
                if (["class", "style", "display", "overflow"].includes(a) || !v) continue;
                if (["fill", "stroke", "color"].includes(a)) {
                    let resolved = style[a];
                    if (resolved === undefined && v.toLowerCase() === "currentcolor") resolved = style.color;
                    if (resolved) v = resolved;
                }
                out.push([a, v]);
                if (!["width", "height"].includes(a)) delete style[a];
            }
        }
        if (isRoot) {
            const doc = document.documentElement;
            style.width = `${Math.ceil(mode === "viewport" ? doc.clientWidth : rootRect.width)}px`;
            style.height = `${fullHeight}px`;
            for (const k of ["margin-top", "margin-right", "margin-bottom", "margin-left", "top", "left", "right", "bottom", "overflow-x", "overflow-y"]) delete style[k];
            // A component root is placed by its rect, which already includes any translation.
            if (mode === "component") for (const k of ["transform", "translate", "inset", "max-height", "max-width"]) delete style[k];
            if (mode === "viewport") Object.assign(style, { position: "absolute", top: `${Math.round(rootRect.top)}px`, left: "0px" });
            else style.position = "relative";
            if (!style["background-color"] || style["background-color"] === "rgba(0, 0, 0, 0)") style["background-color"] = mode === "component" ? inheritedBg(node) : [document.documentElement, document.body].map((e) => getComputedStyle(e).backgroundColor).find((c) => c !== "rgba(0, 0, 0, 0)") ?? inheritedBg(node);
        }
        // In a viewport capture a stuck sticky element (a Book bar pinned to the bottom of its
        // scroller) is drawn where it sits on screen, like a fixed one; a full page is unscrolled.
        // Only when it is actually on screen: a sticky bar in a pane covered by another pane
        // must not be lifted above it.
        const stuck = style.position === "sticky" && mode === "viewport" && (() => { const r = node.getBoundingClientRect(); for (let h = deepHit(r.left + r.width / 2, r.top + r.height / 2); h; h = upward(h)) if (h === node) return true; return false; })();
        if (stuck) style.position = "fixed";
        if (style.position === "sticky") { style.position = "relative"; for (const k of ["top", "left", "right", "bottom"]) delete style[k]; }
        // Paper lets a sticky bar's z-index (10) paint over a later modal scrim, so drop it while
        // an overlay is open; other in-flow z-indexes order card layers and must stay.
        if (overlayOpen && cs.position === "sticky") delete style["z-index"];
        let hoist = false;
        if (!isRoot && style.position === "fixed") {
            let r = node.getBoundingClientRect();
            const offY = mode === "viewport" ? 0 : -rootRect.top;
            const offX = -rootRect.left;
            // In a full-page capture a bar pinned to the viewport bottom (sticky Book bar, cookie
            // banner) belongs at the bottom of the page, not floating over mid-page content.
            const bottomPinned = mode === "full" && r.top >= innerHeight / 2 && Math.abs(r.bottom - innerHeight) <= 2;
            if (bottomPinned) r = { top: fullHeight - (innerHeight - r.top) - offY, left: r.left, width: r.width, height: r.height };
            Object.assign(style, { position: "absolute", top: `${Math.round(r.top + offY)}px`, left: `${Math.round(r.left + offX)}px`, width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px` });
            for (const k of ["right", "bottom", "inset", "margin-top", "margin-right", "margin-bottom", "margin-left"]) delete style[k];
            hoist = true;
            // getBoundingClientRect already includes a translation (floating-ui places popovers
            // with transform: translate(x, y)), so keeping it would offset the box twice.
            if (/^(matrix\(1, 0, 0, 1, [-\d.e]+, [-\d.e]+\)|translate(3d)?\([^)]*\))$/.test(style.transform ?? "")) delete style.transform;
            delete style.translate;
            // Hoisted out of <body>, it no longer inherits the page's text styles; carry them.
            for (const k of ["font-family", "color", "font-size", "line-height", "font-weight", "letter-spacing", "font-style"]) style[k] ??= cs.getPropertyValue(k);
            Object.assign(style, prune({ "font-family": style["font-family"] }, new Map()));
        }
        // Absolutely positioned boxes get their used size; Paper does not stretch auto/% sizes between insets.
        if (!isRoot && style.position === "absolute" && !hoist && node instanceof HTMLElement && !(node instanceof HTMLImageElement)) {
            const set = (k) => cs[k] !== "auto";
            if ((set("left") && set("right")) || style.width?.includes("%")) style.width = `${node.offsetWidth}px`;
            if ((set("top") && set("bottom")) || style.height?.includes("%")) style.height = `${node.offsetHeight}px`;
        }
        // Percentage heights resolve against the parent's definite height in the browser but
        // against Paper's auto-sized frames in the design; pin them to the used height.
        if (!isRoot && !hoist && node instanceof HTMLElement && !(node instanceof HTMLImageElement) && style.height?.includes("%") && style.position !== "absolute") style.height = `${Math.round(node.getBoundingClientRect().height * 100) / 100}px`;
        // Paper ignores implicit grid tracks (grid-auto-columns, auto-flow column carousels) and
        // shares the row out evenly, so pin each grid item to its used width.
        if (!isRoot && !hoist && node instanceof HTMLElement && /grid/.test(getComputedStyle(layoutParent(node) ?? document.body).display) && style.position !== "absolute" && (!style.width || style.width === "auto")) {
            const w = node.getBoundingClientRect().width;
            if (w > 0) { style.width = `${Math.round(w * 100) / 100}px`; style["flex-shrink"] = "0"; }
        }
        // A wrapping flex column that the browser kept in one column (auto height) can break into
        // a second column in Paper, where text runs a little taller inside a stretched card.
        if (!isRoot && node instanceof HTMLElement && /flex/.test(cs.display) && /^column/.test(cs.flexDirection) && /^wrap/.test(cs.flexWrap)) {
            const rects = [...node.children].filter((k) => k.checkVisibility() && !["absolute", "fixed"].includes(getComputedStyle(k).position)).map((k) => k.getBoundingClientRect()).filter((r) => r.width > 0);
            // (one column: no item starts where another ends; negative margins shift lefts, so those are not compared)
            if (!rects.length || Math.max(...rects.map((r) => r.left)) < Math.min(...rects.map((r) => r.right))) style["flex-wrap"] = "nowrap";
        }
        // Likewise a wrapping flex row the browser kept on one line: items that fill it to the pixel
        // (five 215.594px columns in 1078px) wrap in Paper once their widths are rounded.
        if (!isRoot && node instanceof HTMLElement && /flex/.test(cs.display) && /^row/.test(cs.flexDirection) && /^wrap/.test(cs.flexWrap)) {
            const rects = [...node.children].filter((k) => k.checkVisibility() && !["absolute", "fixed"].includes(getComputedStyle(k).position)).map((k) => k.getBoundingClientRect()).filter((r) => r.height > 0);
            if (rects.length > 1 && Math.max(...rects.map((r) => r.top)) < Math.min(...rects.map((r) => r.bottom))) style["flex-wrap"] = "nowrap";
        }
        if (Object.keys(style).length) {
            if (style.width || style.height) { style.width ??= "auto"; style.height ??= "auto"; }
            out.push(["style", styleText(style)]);
        }
        if (tag !== tagName) out.push(["paper-snapshot-original-tag", node.tagName]);
        const name = layerName(node, tagName);
        if (name && tag !== "img" && !(node instanceof SVGElement)) out.unshift(["layer-name", name.slice(0, 60)]);
        if (!rendersBox) return children.length === 1 ? children[0] : { open: "", close: "", children };
        const element = { open: `<${tag}${attrsText(out)}>`, close: VOID.has(tag) ? "" : `</${tag}>`, children: VOID.has(tag) ? [] : children };
        if (hoist) {
            const topLayer = inTopLayer(node);
            // Paper compares z-index across nesting, so a sticky bar (z-index 30) deep in the page
            // would paint over a modal scrim (z-index 40 in the top layer); lift top-layer boxes.
            if (topLayer) element.open = element.open.replace(/z-index: [^;]+;/, "").replace(/ style="/, ' style="z-index: 10000; ');
            // position: fixed always makes a stacking context in the browser; z-index: 0 does the
            // same in Paper, so z-indexed cards inside a fixed app shell stay under the overlay.
            // Other fixed/stuck boxes (headers, Book bars) sit above page content in the browser;
            // Paper compares z-index across nesting, so in-flow z-indexes (map tiles) would beat
            // them. Lift them above any in-flow value, keeping their order among themselves.
            else element.open = element.open.replace(/z-index: [^;]+;/, "").replace(/ style="/, ` style="z-index: ${5000 + (parseInt(cs.zIndex) || 0)}; `);
            hoisted.push({ element, order, topLayer, z: parseInt(cs.zIndex) || 0 });
            // A sticky element still takes its place in flow; keep that space.
            if (stuck) { const r = node.getBoundingClientRect(); return `<div layer-name="sticky placeholder" style="display: block; flex-shrink: 0; width: ${Math.round(r.width)}px; height: ${Math.round(r.height)}px;"></div>`; }
            return "";
        }
        return element;
    }

    // Hoisted boxes are collected after their children, so restore document (pre-)order, and put
    // top-layer content (open popovers, modal dialogs) above everything as the browser does.
    const stackHoisted = () => hoisted.sort((a, b) => a.topLayer - b.topLayer || a.z - b.z || a.order - b.order).map((h) => h.element);
    // Ancestors of fixed/sticky boxes stay serialised even off screen: those boxes are drawn
    // where they sit on screen.
    const keepForFixed = new Set();
    if (mode === "viewport") for (const e of deepElements()) if (/fixed|sticky/.test(getComputedStyle(e).position)) for (let a = e; a && !keepForFixed.has(a); a = upward(a)) keepForFixed.add(a);
    const overlayOpen = deepElements().some((e) => { try { return e.matches(":popover-open, :modal"); } catch { return false; } });
    const restore = settleMotion();
    // Measure while the page is still unrolled; restoring shrinks it back to one viewport.
    const fullHeight = Math.ceil(Math.max(root.getBoundingClientRect().height, isDocRoot ? document.documentElement.scrollHeight : 0));
    let tree;
    try {
        tree = serialise(root, { inParagraph: false, inAnchor: false, inButton: false }, true);
    } finally {
        restore();
        restoreScroll();
    }
    if (typeof tree === "string") tree = { open: `<div>`, close: `</div>`, children: [tree] };
    const doc = document.documentElement;
    const width = Math.ceil(mode === "viewport" ? doc.clientWidth : rootRect.width);
    if (mode === "viewport") {
        const vh = window.innerHeight;
        tree = { open: `<div layer-name="viewport" style="position: relative; overflow: hidden; width: ${width}px; height: ${vh}px; display: block;">`, close: "</div>", children: [tree, ...stackHoisted()] };
    } else tree.children.push(...stackHoisted());
    const height = mode === "viewport" ? window.innerHeight : fullHeight;
    const render = (n) => (typeof n === "string" ? n : n.open + n.children.map(render).join("") + n.close);
    if (opts.html) return { width, height, stats, html: render(tree) };
    return { url: location.href, title: document.title, width, height, scrollY: window.scrollY, stats, tree };
});
