/*
 * In-page measurement. Same script for every page/viewport.
 * Usage: inject, then `await window.__measure({ mode: "fold" | "full" })`.
 *  fold: region = [0, innerHeight) at scrollY 0.
 *  full: region = whole document (rect + scrollY).
 * Traverses open shadow roots. Clips each element to its overflow-clipping ancestors and the
 * horizontal viewport, so off-screen carousel items do not count.
 */
(function () {
    const MIN_IMAGE_SIDE = 48; // px; smaller <img>/bg-images are treated as icons, not imagery
    const GRID = 4; // px cell for area unions

    function parentOf(el) {
        if (el.parentElement) return el.parentElement;
        const root = el.getRootNode();
        return root && root.host ? root.host : null;
    }

    function allElements() {
        const out = [];
        (function walk(root) {
            for (const el of root.querySelectorAll("*")) {
                out.push(el);
                if (el.shadowRoot) walk(el.shadowRoot);
            }
        })(document);
        return out;
    }

    const styleCache = new Map();
    function cs(el) {
        let s = styleCache.get(el);
        if (!s) {
            s = getComputedStyle(el);
            styleCache.set(el, s);
        }
        return s;
    }

    const clipCache = new Map();
    function clipRectOf(el) {
        // the visible box allowed by ancestors (viewport coords)
        if (clipCache.has(el)) return clipCache.get(el);
        const p = parentOf(el);
        let clip;
        if (!p) clip = { l: 0, t: -1e9, r: innerWidth, b: 1e9 };
        else {
            clip = { ...clipRectOf(p) };
            const s = cs(p);
            if (s.overflowX !== "visible" || s.overflowY !== "visible") {
                const r = p.getBoundingClientRect();
                if (s.overflowX !== "visible") {
                    clip.l = Math.max(clip.l, r.left);
                    clip.r = Math.min(clip.r, r.right);
                }
                if (s.overflowY !== "visible") {
                    clip.t = Math.max(clip.t, r.top);
                    clip.b = Math.min(clip.b, r.bottom);
                }
            }
            if (s.position === "fixed") clip = { l: 0, t: -1e9, r: innerWidth, b: 1e9 };
        }
        clipCache.set(el, clip);
        return clip;
    }

    const hiddenCache = new Map();
    function isHidden(el) {
        if (hiddenCache.has(el)) return hiddenCache.get(el);
        const s = cs(el);
        let h = s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse" || +s.opacity < 0.05;
        if (!h && s.display !== "contents") {
            const p = parentOf(el);
            if (p) h = isHidden(p);
        } else if (!h) {
            const p = parentOf(el);
            if (p) h = isHidden(p);
        }
        hiddenCache.set(el, h);
        return h;
    }

    let REGION; // {top, bottom} in page coords
    let SCROLL_Y;
    function visibleBox(el, rectIn) {
        const r = rectIn ?? el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return null;
        const c = clipRectOf(el);
        const l = Math.max(r.left, c.l, 0);
        const rr = Math.min(r.right, c.r, innerWidth);
        let t = Math.max(r.top, c.t);
        let b = Math.min(r.bottom, c.b);
        const pt = t + SCROLL_Y;
        const pb = b + SCROLL_Y;
        const ct = Math.max(pt, REGION.top);
        const cb = Math.min(pb, REGION.bottom);
        if (rr - l < 1 || cb - ct < 1) return null;
        return { x: l, y: ct, w: rr - l, h: cb - ct, full: { x: r.left, y: r.top + SCROLL_Y, w: r.width, h: r.height } };
    }

    function regionGrid() {
        const cols = Math.ceil(innerWidth / GRID);
        const rows = Math.ceil((REGION.bottom - REGION.top) / GRID);
        return { cols, rows, cells: new Uint8Array(cols * rows) };
    }
    function paint(g, box) {
        const c0 = Math.floor(box.x / GRID), c1 = Math.ceil((box.x + box.w) / GRID);
        const r0 = Math.floor((box.y - REGION.top) / GRID), r1 = Math.ceil((box.y + box.h - REGION.top) / GRID);
        for (let r = Math.max(0, r0); r < Math.min(g.rows, r1); r++)
            for (let c = Math.max(0, c0); c < Math.min(g.cols, c1); c++) g.cells[r * g.cols + c] = 1;
    }
    function gridShare(g) {
        let n = 0;
        for (const v of g.cells) n += v;
        return n / g.cells.length;
    }

    function isTransparent(color) {
        if (!color || color === "transparent") return true;
        const m = color.match(/rgba?\(([^)]+)\)/);
        if (!m) return false;
        const parts = m[1].split(/[ ,/]+/).filter(Boolean);
        return parts.length === 4 && +parts[3] < 0.05;
    }
    function bgUrl(s) {
        const m = s.backgroundImage && s.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
        return m ? m[1] : null;
    }
    const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
    const median = (a) => {
        if (!a.length) return null;
        const s = [...a].sort((x, y) => x - y);
        return s[Math.floor(s.length / 2)];
    };
    function inside(a, b) {
        return a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
    }
    function overlapArea(a, b) {
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return w > 0 && h > 0 ? w * h : 0;
    }
    function contains(a, b) {
        // DOM containment across shadow boundaries
        for (let n = b; n; n = parentOf(n)) if (n === a) return true;
        return false;
    }
    function loadNatural(url) {
        return new Promise((resolve) => {
            const i = new Image();
            const t = setTimeout(() => resolve(null), 3000);
            i.onload = () => { clearTimeout(t); resolve({ w: i.naturalWidth, h: i.naturalHeight }); };
            i.onerror = () => { clearTimeout(t); resolve(null); };
            i.src = url;
        });
    }

    async function measure({ mode, vh }) {
        const VH = vh ?? innerHeight;
        styleCache.clear(); clipCache.clear(); hiddenCache.clear();
        SCROLL_Y = scrollY;
        const pageHeight = Math.max(document.documentElement.scrollHeight, innerHeight);
        REGION = mode === "fold" ? { top: SCROLL_Y, bottom: SCROLL_Y + innerHeight } : { top: 0, bottom: pageHeight };
        const regionArea = innerWidth * (REGION.bottom - REGION.top);
        const screens = (REGION.bottom - REGION.top) / VH;
        const els = allElements().filter((el) => !isHidden(el) && !["SCRIPT", "STYLE", "LINK", "META", "HEAD", "NOSCRIPT", "TEMPLATE"].includes(el.tagName));
        const boxOf = new Map();
        for (const el of els) {
            const b = visibleBox(el);
            if (b) boxOf.set(el, b);
        }
        const vis = els.filter((el) => boxOf.has(el));

        // ---------- imagery ----------
        const imageList = [];
        for (const el of vis) {
            const s = cs(el);
            const b = boxOf.get(el);
            let kind = null, src = null, natural = null;
            if (el.tagName === "IMG") { kind = "img"; src = el.currentSrc || el.src; natural = el.naturalWidth ? { w: el.naturalWidth, h: el.naturalHeight } : null; }
            else if (el.tagName === "VIDEO") { kind = "video"; src = el.currentSrc; natural = el.videoWidth ? { w: el.videoWidth, h: el.videoHeight } : null; }
            else if (bgUrl(s) && !/\.svg(\?|$)/i.test(bgUrl(s))) { kind = "bg"; src = bgUrl(s); }
            if (!kind) continue;
            if (kind === "img" && /\.svg(\?|$)/i.test(src || "")) continue;
            if (b.full.w < MIN_IMAGE_SIDE || b.full.h < MIN_IMAGE_SIDE) continue;
            imageList.push({ el, kind, src, natural, box: b, fit: s.objectFit });
        }
        await Promise.all(imageList.filter((i) => i.kind === "bg" && i.src).map(async (i) => { i.natural = await loadNatural(i.src); }));
        const imgGrid = regionGrid();
        for (const i of imageList) paint(imgGrid, i.box);
        const imageryShare = gridShare(imgGrid);
        const dpr = devicePixelRatio;
        const photoList = imageList.map((i) => {
            const rw = i.box.full.w, rh = i.box.full.h;
            // for cover-fit, the natural must cover the larger scale axis
            const upscale = i.natural ? Math.max(rw / i.natural.w, rh / i.natural.h) : null;
            return {
                kind: i.kind,
                rendered: [Math.round(rw), Math.round(rh)],
                natural: i.natural ? [i.natural.w, i.natural.h] : null,
                aspect: round(rw / rh),
                upscaleCssPx: upscale ? round(upscale) : null, // >1 = natural smaller than CSS px
                upscaleAt2x: upscale ? round(upscale * 2) : null, // >1 = soft on a 2x screen
                visibleArea: Math.round(i.box.w * i.box.h),
            };
        });

        // ---------- text / type scale ----------
        const textRuns = [];
        const range = document.createRange();
        for (const el of vis) {
            for (const n of el.childNodes) {
                if (n.nodeType !== 3) continue;
                const txt = n.textContent.replace(/\s+/g, " ").trim();
                if (!txt) continue;
                range.selectNodeContents(n);
                const r = range.getBoundingClientRect();
                const b = visibleBox(el, r);
                if (!b) continue;
                const s = cs(el);
                textRuns.push({ el, chars: txt.length, size: round(parseFloat(s.fontSize), 1), weight: +s.fontWeight >= 600 ? (+s.fontWeight >= 700 ? 700 : 600) : (+s.fontWeight <= 300 ? 300 : +s.fontWeight), rawWeight: +s.fontWeight, family: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(), box: b, color: s.color });
            }
        }
        const totalChars = textRuns.reduce((a, t) => a + t.chars, 0) || 1;
        const pairMap = new Map(), sizeMap = new Map(), weightMap = new Map(), familyMap = new Map();
        for (const t of textRuns) {
            const k = `${t.size}/${t.rawWeight}`;
            pairMap.set(k, (pairMap.get(k) ?? 0) + t.chars);
            sizeMap.set(t.size, (sizeMap.get(t.size) ?? 0) + t.chars);
            weightMap.set(t.rawWeight, (weightMap.get(t.rawWeight) ?? 0) + t.chars);
            familyMap.set(t.family, (familyMap.get(t.family) ?? 0) + t.chars);
        }
        const bodySize = [...sizeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const sizeList = [...sizeMap.keys()].sort((a, b) => a - b);
        const sizeListSignificant = sizeList.filter((s) => sizeMap.get(s) / totalChars >= 0.005 || s > (bodySize ?? 0) * 1.5);
        const adjacent = sizeListSignificant.slice(1).map((s, i) => round(s / sizeListSignificant[i]));
        const typeScale = {
            pairs: [...pairMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => ({ sizeWeight: k, charShare: round(c / totalChars, 3) })),
            pairCount: pairMap.size,
            sizeLevelCount: sizeList.length,
            sizeLevelCountSignificant: sizeListSignificant.length, // sizes with >=0.5% of chars, or display sizes
            sizeList,
            bodySize,
            largestSize: sizeList.at(-1) ?? null,
            largestToBody: bodySize ? round(sizeList.at(-1) / bodySize) : null,
            adjacentRatiosSignificant: adjacent,
            medianAdjacentRatio: median(adjacent),
            weightShare: Object.fromEntries([...weightMap.entries()].sort((a, b) => a[0] - b[0]).map(([w, c]) => [w, round(c / totalChars, 3)])),
            boldShare: round(textRuns.filter((t) => t.rawWeight >= 600).reduce((a, t) => a + t.chars, 0) / totalChars, 3),
            familyShare: Object.fromEntries([...familyMap.entries()].map(([f, c]) => [f, round(c / totalChars, 3)])),
            totalChars,
        };

        // ---------- cards / items ----------
        const bigImages = imageList.map((i) => i.el);
        const isInteractive = (el) => el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.getAttribute("role") === "link";
        function hasSurface(el) {
            const s = cs(el);
            return !isTransparent(s.backgroundColor) || s.boxShadow !== "none" || (parseFloat(s.borderTopWidth) > 0 && !isTransparent(s.borderTopColor) && parseFloat(s.borderLeftWidth) > 0);
        }
        const maxCardW = innerWidth * (innerWidth < 600 ? 0.97 : 0.6);
        const descImages = new Map(), descChars = new Map();
        for (const i of bigImages) for (let n = parentOf(i); n; n = parentOf(n)) { if (!descImages.has(n)) descImages.set(n, []); descImages.get(n).push(i); }
        for (const t of textRuns) for (let n = t.el; n; n = parentOf(n)) descChars.set(n, (descChars.get(n) ?? 0) + t.chars);
        const cardCandidates = [];
        for (const el of vis) {
            const f = boxOf.get(el).full;
            if (f.w < 110 || f.h < 90 || f.w > maxCardW || f.h > 760) continue;
            const imgs = descImages.get(el) ?? [];
            const surface = hasSurface(el);
            const semantic = isInteractive(el) || ["ARTICLE", "LI"].includes(el.tagName) || el.getAttribute("role") === "listitem";
            if (imgs.length > 1) {
                // a card can hold one image (or one carousel of images stacked in the same box)
                const first = boxOf.get(imgs[0]).full;
                if (!imgs.every((i) => Math.abs(boxOf.get(i).full.w - first.w) < 2)) continue;
            }
            const textChars = Math.max(descChars.get(el) ?? 0, (el.textContent ?? "").replace(/\s+/g, "").length);
            if (textChars < 3) continue;
            let repeated = false;
            if (imgs.length >= 1 && !semantic && !surface && f.w < innerWidth * 0.85) {
                const par = parentOf(el);
                if (par) {
                    const sibs = [...(par.shadowRoot ? par.shadowRoot.children : []), ...par.children].filter((k) => k !== el && boxOf.has(k));
                    repeated = sibs.filter((k) => { const kf = boxOf.get(k).full; return Math.abs(kf.w - f.w) <= f.w * 0.1 && Math.abs(kf.h - f.h) <= f.h * 0.25 && (descImages.get(k) ?? []).length >= 1; }).length >= 1;
                }
            }
            if ((imgs.length >= 1 && (semantic || surface || repeated)) || (surface && semantic && textChars > 10)) cardCandidates.push(el);
        }
        const candSet = new Set(cardCandidates);
        const hasAncestorIn = (el, set) => { for (let n = parentOf(el); n; n = parentOf(n)) if (set.has(n)) return true; return false; };
        const cardList = cardCandidates.filter((el) => !hasAncestorIn(el, candSet));
        const cardSet = new Set(cardList);
        const inCard = (el) => cardSet.has(el) || hasAncestorIn(el, cardSet);
        const rowList = vis.filter((el) => el.tagName === "TR" && !el.closest("thead") && !inCard(el));
        const rowSet = new Set(rowList);
        const inRow = (el) => rowSet.has(el) || hasAncestorIn(el, rowSet);
        const headingList = [];
        for (const el of vis) {
            if (inCard(el) || inRow(el)) continue;
            const isH = /^H[1-6]$/.test(el.tagName) || el.getAttribute("role") === "heading";
            const t = textRuns.find((r) => r.el === el);
            const looksH = t && bodySize && t.size >= bodySize * 1.2 && t.rawWeight >= 600 && t.chars > 2;
            if ((isH || looksH) && !headingList.some((h) => contains(h, el))) headingList.push(el);
        }
        const textOf = (el) => (el.innerText ?? el.textContent ?? "").trim();
        const ctaList = vis.filter((el) => {
            if (inCard(el) || inRow(el)) return false;
            if (!(el.tagName === "BUTTON" || el.getAttribute("role") === "button" || el.tagName === "A")) return false;
            const s = cs(el);
            const filled = !isTransparent(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && !isTransparent(s.borderTopColor));
            return filled && textOf(el).length > 0;
        });
        const linkList = vis.filter((el) => el.tagName === "A" && el.hasAttribute("href") && !inCard(el) && !inRow(el) && !ctaList.includes(el) && textOf(el).length > 0);
        const itemCount = cardList.length + rowList.length + headingList.length + ctaList.length + linkList.length;
        const density = {
            cards: cardList.length,
            listRows: rowList.length,
            headings: headingList.length,
            ctas: ctaList.length,
            links: linkList.length,
            totalItems: itemCount,
            screens: round(screens),
            itemsPerScreen: round(itemCount / screens, 1),
            cardsPerScreen: round(cardList.length / screens, 1),
            textCharsPerScreen: Math.round(totalChars / screens),
        };
        // mark a card for the hover probe (first card fully visible in region, else first row)
        document.querySelectorAll("[data-measure-card]").forEach((e) => e.removeAttribute("data-measure-card"));
        for (const el of allElements()) if (el.hasAttribute && el.hasAttribute("data-measure-card")) el.removeAttribute("data-measure-card");
        const hoverTarget = cardList.find((c) => { const f = boxOf.get(c).full; return f.x >= 0 && f.x + f.w <= innerWidth; }) ?? rowList[0] ?? null;
        if (hoverTarget) hoverTarget.setAttribute("data-measure-card", mode);

        // ---------- depth / surfaces ----------
        const surfaceMap = new Map();
        const pageBackgrounds = new Set();
        let gradientCount = 0, shadowCount = 0, stickyCount = 0, fixedCount = 0, blurCount = 0;
        const radiusMap = new Map();
        for (const el of vis) {
            const s = cs(el);
            const b = boxOf.get(el);
            const area = b.w * b.h;
            if (b.full.w >= innerWidth * 0.98 && b.full.h >= (REGION.bottom - REGION.top) * 0.9) { if (!isTransparent(s.backgroundColor)) pageBackgrounds.add(s.backgroundColor); }
            else if (!isTransparent(s.backgroundColor) && area >= 4000) surfaceMap.set(s.backgroundColor, (surfaceMap.get(s.backgroundColor) ?? 0) + area);
            if (/gradient/.test(s.backgroundImage) && area >= 4000) gradientCount++;
            if (s.boxShadow !== "none") shadowCount++;
            if (s.position === "sticky") stickyCount++;
            if (s.position === "fixed") fixedCount++;
            if (s.backdropFilter && s.backdropFilter !== "none") blurCount++;
            const rad = s.borderTopLeftRadius;
            if (rad && rad !== "0px" && (hasSurface(el) || el.tagName === "IMG" || s.overflow !== "visible" || bgUrl(s))) {
                const key = /%/.test(rad) ? rad : parseFloat(rad) >= 999 ? "pill" : Math.round(parseFloat(rad)) + "px";
                radiusMap.set(key, (radiusMap.get(key) ?? 0) + 1);
            }
        }
        const imageBoxes = imageList.map((i) => ({ el: i.el, b: i.box }));
        const textOverImage = textRuns.filter((t) => imageBoxes.some((i) => overlapArea(t.box, i.b) > 0.5 * t.box.w * t.box.h && !contains(i.el, t.el)));
        const overlayOnImage = vis.filter((el) => {
            const s = cs(el);
            if (s.position !== "absolute" && s.position !== "fixed" && s.position !== "sticky") return false;
            if (bigImages.includes(el)) return false;
            if ((descImages.get(el) ?? []).length) return false;
            const b = boxOf.get(el);
            if (b.w * b.h < 200) return false;
            return imageBoxes.some((i) => overlapArea(b, i.b) > 0.5 * b.w * b.h) && (hasSurface(el) || (descChars.get(el) ?? 0) > 0);
        }).filter((el, _, arr) => !arr.some((o) => o !== el && contains(o, el)));
        const depth = {
            pageBackgrounds: [...pageBackgrounds],
            distinctSurfaceColours: surfaceMap.size, // excludes page-covering backgrounds; areaShare sums nested boxes
            surfaceColours: [...surfaceMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, a]) => ({ colour: c, areaShare: round(a / regionArea, 3) })),
            gradientSurfaces: gradientCount,
            boxShadowElements: shadowCount,
            stickyElements: stickyCount,
            fixedElements: fixedCount,
            backdropBlurElements: blurCount,
            textRunsOverImagery: textOverImage.length,
            textCharsOverImageryShare: round(textOverImage.reduce((a, t) => a + t.chars, 0) / totalChars, 3),
            overlaysOnImagery: overlayOnImage.length,
            borderRadiusValues: Object.fromEntries([...radiusMap.entries()].sort((a, b) => b[1] - a[1])),
            distinctBorderRadii: radiusMap.size,
        };

        // ---------- motion ----------
        let transitionCount = 0, animationCount = 0, transformTransitionCount = 0;
        for (const el of vis) {
            const s = cs(el);
            if (s.transitionDuration.split(",").some((d) => parseFloat(d) > 0)) {
                transitionCount++;
                if (/all|transform|scale|box-shadow/.test(s.transitionProperty)) transformTransitionCount++;
            }
            if (s.animationName && s.animationName !== "none" && s.animationPlayState !== "paused") animationCount++;
        }
        const motion = { transitionElements: transitionCount, transformOrShadowTransitionElements: transformTransitionCount, animatedElements: animationCount, perScreenTransitions: round(transitionCount / screens, 1) };

        // ---------- sections ----------
        const H = REGION.bottom - REGION.top;
        function layoutChildren(el) {
            const kids = [...(el.shadowRoot ? el.shadowRoot.children : []), ...el.children];
            const out = [];
            for (const k of kids) {
                const ks = cs(k);
                if (ks.position === "absolute" || ks.position === "fixed") continue;
                if (ks.display === "contents" || (!boxOf.has(k) && (k.shadowRoot || k.children.length))) out.push(...layoutChildren(k));
                else if (boxOf.has(k) && boxOf.get(k).full.h >= 8) out.push(k);
            }
            return out;
        }
        // Full-document section structure is computed in both modes, then clipped for fold.
        const savedRegion = REGION;
        let list = layoutChildren(document.body);
        for (let i = 0; i < 60; i++) {
            const next = [];
            let changed = false;
            for (const el of list) {
                const kids = layoutChildren(el);
                const f = boxOf.get(el).full;
                if (f.h >= 0.55 * pageHeight && kids.length >= 1 && f.h > VH * 0.8) {
                    // wrapper: descend unless its children sit side by side (a real multi-column layout)
                    const side = kids.length >= 2 && kids.every((k) => Math.abs(boxOf.get(k).full.y - boxOf.get(kids[0]).full.y) < 4);
                    if (!side) { next.push(...kids); changed = true; continue; }
                }
                next.push(el);
            }
            list = next;
            if (!changed) break;
        }
        // flatten: sections stacked vertically, drop zero-height / tiny ones and overlays
        list = list.filter((el) => { const s = cs(el); return s.position !== "fixed" && s.position !== "absolute" && boxOf.get(el).full.h >= 24; });
        list.sort((a, b) => boxOf.get(a).full.y - boxOf.get(b).full.y);
        const chromeRe = /(^|[-_ ])(header|footer|nav|navbar|breadcrumb|cookie)/i;
        function isChrome(el) {
            return ["HEADER", "FOOTER", "NAV"].includes(el.tagName) || ["banner", "contentinfo", "navigation"].includes(el.getAttribute("role")) || chromeRe.test(el.className?.toString?.() ?? "") || chromeRe.test(el.id ?? "");
        }
        function trackItemCount(d) {
            let kids = layoutChildren(d);
            for (let k = 0; k < 5 && kids.length === 1; k++) kids = layoutChildren(kids[0]);
            return kids.length;
        }
        function classifySection(el, index) {
            const f = boxOf.get(el).full;
            const imageRatio = imageShareIn(f);
            // horizontal scroll: a descendant scrolls on x, or a nowrap flex row overflows
            let hScroll = false;
            for (const d of vis) {
                if (!contains(el, d)) continue;
                const s = cs(d);
                if (s.overflowX !== "visible" && d.scrollWidth > d.clientWidth + 8 && d.clientWidth > 200 && trackItemCount(d) >= 3) { hScroll = true; break; }
                if ((d.tagName === "BUTTON" || d.getAttribute("role") === "button") && /\b(next|previous|prev|scroll|forward|backward)\b/i.test(d.getAttribute("aria-label") ?? "")) { hScroll = true; break; }
                if (s.display.includes("flex") && s.flexWrap === "nowrap" && s.flexDirection.startsWith("row") && d.scrollWidth > d.clientWidth + 40 && d.children.length >= 3) { hScroll = true; break; }
            }
            // repeated-item group: the descendant with the most similar-sized visible children
            let best = { n: 0, cols: 1, rows: 1 };
            for (const d of [el, ...vis.filter((x) => contains(el, x))]) {
                const kids = layoutChildren(d);
                if (kids.length < 2) continue;
                const w0 = median(kids.map((k) => boxOf.get(k).full.w));
                const sim = kids.filter((k) => Math.abs(boxOf.get(k).full.w - w0) <= w0 * 0.12 && boxOf.get(k).full.h > 40);
                if (sim.length > best.n) {
                    const tops = new Set(sim.map((k) => Math.round(boxOf.get(k).full.y / 8)));
                    const lefts = new Set(sim.map((k) => Math.round(boxOf.get(k).full.x / 8)));
                    best = { n: sim.length, cols: lefts.size, rows: tops.size };
                }
            }
            const cardsIn = cardList.filter((c) => contains(el, c)).length;
            const textInside = textRuns.filter((t) => contains(el, t.el));
            const textOverImg = textInside.filter((t) => textOverImage.includes(t)).length;
            let shape;
            if (index === 0 && imageRatio >= 0.4 && f.h >= 240) shape = "hero";
            else if (hScroll && best.n >= 2) shape = "carousel-row";
            else if (best.rows >= 2 && best.cols >= 2 && best.n >= 4) shape = "grid";
            else if (imageRatio >= 0.45 && textOverImg > 0 && best.n <= 2) shape = "banner";
            else if (best.cols === 2 && best.rows === 1 && imageRatio >= 0.2) shape = "editorial-split";
            else if (best.cols >= 2 && best.rows === 1 && best.n >= 3) shape = "row";
            else if (best.cols === 1 && best.rows >= 3) shape = "list";
            else if (f.h < 160) shape = "strip";
            else shape = "block";
            return {
                tag: el.tagName.toLowerCase(),
                cls: (el.className?.toString?.() ?? "").slice(0, 60),
                chrome: isChrome(el),
                y: Math.round(f.y), h: Math.round(f.h),
                shape,
                columns: best.cols, rows: best.rows, repeatedItems: best.n,
                horizontalScroll: hScroll,
                imageRatio: round(imageRatio),
                cards: cardsIn,
                background: cs(el).backgroundColor,
            };
        }
        REGION = { top: 0, bottom: pageHeight };
        const fullImgGrid = regionGrid();
        for (const i of imageList) { const b = visibleBox(i.el); if (b) paint(fullImgGrid, b); }
        function imageShareIn(f) {
            const c0 = Math.max(0, Math.floor(f.x / GRID)), c1 = Math.min(fullImgGrid.cols, Math.ceil((f.x + f.w) / GRID));
            const r0 = Math.max(0, Math.floor(f.y / GRID)), r1 = Math.min(fullImgGrid.rows, Math.ceil((f.y + f.h) / GRID));
            let n = 0, t = 0;
            for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { t++; n += fullImgGrid.cells[r * fullImgGrid.cols + c]; }
            return t ? n / t : 0;
        }
        const sectionAll = list.map(classifySection);
        REGION = savedRegion;
        const inRegion = sectionAll.filter((s) => s.y < REGION.bottom && s.y + s.h > REGION.top);
        const contentSections = inRegion.filter((s) => !s.chrome);
        const gaps = [];
        for (let i = 1; i < sectionAll.length; i++) {
            const g = sectionAll[i].y - (sectionAll[i - 1].y + sectionAll[i - 1].h);
            if (sectionAll[i].y < REGION.bottom) gaps.push(g);
        }
        const sections = {
            count: inRegion.length,
            contentCount: contentSections.length,
            distinctShapes: [...new Set(contentSections.map((s) => s.shape))],
            distinctShapeCount: new Set(contentSections.map((s) => s.shape)).size,
            list: inRegion,
            gapsBetweenSectionBoxesPx: gaps,
            distinctGapValues: [...new Set(gaps.map((g) => Math.round(g)))].sort((a, b) => a - b),
        };

        // image rects (page coords, clipped) for pixel classification
        const imageRects = imageList.map((i) => [Math.round(i.box.x), Math.round(i.box.y - REGION.top), Math.round(i.box.w), Math.round(i.box.h)]);
        // opaque surfaces painted over imagery (later in tree order, not an ancestor): not photography
        const order = new Map(els.map((e, n) => [e, n]));
        function alpha(c) { const m = c.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/); return m ? +(m[1] ?? m[2]) : isTransparent(c) ? 0 : 1; }
        const coverRects = [];
        for (const el of vis) {
            const s = cs(el);
            if (alpha(s.backgroundColor) < 0.5 || isTransparent(s.backgroundColor)) continue;
            const b = boxOf.get(el);
            for (const i of imageList) {
                if (overlapArea(b, i.box) > 0 && order.get(el) > order.get(i.el) && !contains(el, i.el)) { coverRects.push([Math.round(b.x), Math.round(b.y - REGION.top), Math.round(b.w), Math.round(b.h)]); break; }
            }
        }

        return {
            mode,
            viewport: [innerWidth, innerHeight],
            dpr,
            pageHeight,
            regionHeight: Math.round(H),
            typeScale,
            imagery: { share: round(imageryShare, 3), count: imageList.length, photoList },
            density,
            depth,
            motion,
            sections,
            imageRects,
            coverRects,
        };
    }

    window.__measure = measure;
})();
