// Planted defects: each is ONE mutation applied to a frozen real page before it is measured.
// Ground truth for eval A: the untouched snapshot is the baseline, `expect` is the finding the
// mutation must surface. `types` says which page types it is planted on. `split` "tune" defects
// shaped the rules; "held" ones never did.
//
// A mutation runs in the page with the helpers from lib/collect.mjs (all, css, shown, top) plus
// PRELUDE below. It returns a short note of what it changed, or { skip: "why" } when the page
// gives it nothing to change (reported as not applicable, never as a miss).

export const PRELUDE = `
const vw = innerWidth, vh = innerHeight;
const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; };
const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\\s+/g, " ").trim();
const imp = (el, props) => { for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, "important"); };
const images = (minW = 140, minH = 100) => all("img").filter((i) => shown(i) && box(i).w >= minW && box(i).h >= minH);
const inChrome = (el) => { for (let n = el; n; n = n.parentElement) if (/^(HEADER|FOOTER|NAV)$/.test(n.tagName) || /^(banner|contentinfo|navigation)$/.test(n.getAttribute("role") ?? "")) return true; return false; };
const PRICE = /[$£€¥₹]\\s?\\d|\\d[\\d.,]*\\s?(?:[$£€]|USD|EUR|GBP|CZK|Kč)/i;
const fieldEls = () => all("input, select, textarea").filter((e) => shown(e) && !/^(hidden|submit|button|image|reset|checkbox|radio|search)$/.test(e.type));
const buttonish = (el) => { const s = getComputedStyle(el), b = box(el), t = (el.innerText ?? el.value ?? "").trim(); const a = (s.backgroundColor.match(/[\\d.]+/g) ?? []).map(Number); const filled = a.length >= 3 && (a[3] ?? 1) >= 0.8; return shown(el) && b.h >= 24 && b.h <= 96 && b.w >= 40 && b.w <= 520 && t.length > 0 && t.length <= 40 && (filled || /gradient/.test(s.backgroundImage)); };
const loud = (el) => { const a = (getComputedStyle(el).backgroundColor.match(/[\\d.]+/g) ?? []).map(Number); const max = Math.max(a[0], a[1], a[2]), min = Math.min(a[0], a[1], a[2]); return max < 90 || (max - min) / (max || 1) >= 0.25; };
// Removes every selector matching re from the page's style rules (a rule left with no selector is deleted).
const dropRules = (re) => { let n = 0; const walk = (rules, owner) => { for (let i = rules.length - 1; i >= 0; i--) { const r = rules[i]; if (r.selectorText && re.test(r.selectorText)) { const keep = r.selectorText.split(/,(?![^(]*\\))/).filter((p) => !re.test(p)); n++; if (keep.length) { try { r.selectorText = keep.join(","); } catch { owner.deleteRule(i); } } else { owner.deleteRule(i); continue; } } if (r.cssRules?.length) walk(r.cssRules, r); } }; const sheets = (root) => { for (const s of root.styleSheets ?? []) { try { walk(s.cssRules, s); } catch {} } }; sheets(document); for (const el of all()) if (el.shadowRoot) sheets(el.shadowRoot); return n; };
// The element whose children are the page's stacked sections.
const stack = () => { let best = null; for (const el of all()) { if (inChrome(el)) continue; const kids = [...el.children].filter((k) => { const b = box(k); return shown(k) && b.h >= 120 && b.w >= vw * 0.6; }); if (kids.length >= 3 && (!best || kids.length > best.kids.length)) best = { el, kids }; } return best; };
`;

const d = (id, expect, types, split, mutate) => ({ id, expect, types, split, mutate });

export const DEFECTS = [
    d("all-bold", "equally-loud", ["home"], "tune", () => { css("body, body * { font-weight: 700 !important; }"); return "every element bold"; }),

    d("text-on-photo", "text-on-photos", ["home"], "tune", () => {
        // each picture becomes the backdrop of the block that holds it, with the block's words laid over it
        let n = 0;
        for (const img of images(160, 110)) {
            const ib = box(img);
            let host = img.parentElement;
            while (host && host !== document.body && ((host.innerText ?? "").trim().length < 12 || box(host).h < ib.h * 1.1)) host = host.parentElement;
            if (!host || host === document.body || host.hasAttribute("data-pd-over")) continue;
            const hb = box(host);
            if (hb.w * hb.h > ib.w * ib.h * 6 || hb.w > vw * 0.98 && hb.h > vh) continue;
            host.setAttribute("data-pd-over", "");
            imp(host, { position: "relative", overflow: "hidden", "background-color": "transparent" });
            imp(img, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", "object-fit": "cover", "z-index": "0", "max-width": "none", "max-height": "none" });
            for (let p = img.parentElement; p && p !== host; p = p.parentElement) imp(p, { position: "static", overflow: "visible", transform: "none" });
            for (const k of host.querySelectorAll("*")) { if (k === img || k.contains(img)) continue; imp(k, { "background-color": "transparent", "background-image": "none", color: "#fff", "z-index": "1" }); if (getComputedStyle(k).position === "static") imp(k, { position: "relative" }); }
            n++;
        }
        return n >= 3 ? `${n} blocks with words over their picture` : { skip: "fewer than 3 picture blocks" };
    }),

    d("too-little-content", "nothing-to-browse", ["home"], "tune", () => {
        // everything below the first screen is gone, footer aside
        let n = 0;
        for (const el of all()) {
            if (!shown(el) || inChrome(el) || el.closest("[data-pd-gone]")) continue;
            if (top(el) >= vh * 1.05 && box(el).h >= 20) { el.setAttribute("data-pd-gone", ""); imp(el, { display: "none" }); n++; }
        }
        return n ? `${n} blocks below the first screen removed` : { skip: "nothing below the first screen" };
    }),

    d("one-shape-repeated", "one-shape", ["home"], "tune", () => {
        // every section of the page is replaced by a copy of one of them
        const st = stack();
        if (!st || st.kids.length < 4) return { skip: "no stack of 4 sections" };
        const withCards = st.kids.filter((k) => k.querySelectorAll("img").length >= 3 && box(k).h < vh * 1.5);
        const model = withCards[0] ?? st.kids[1];
        let n = 0;
        for (const k of st.kids) { if (k === model) continue; const c = model.cloneNode(true); k.replaceWith(c); n++; }
        return `${n} sections replaced by copies of one`;
    }),

    d("no-hover-response", "static", ["home"], "tune", () => {
        const n = dropRules(/:hover/);
        css("*, *::before, *::after { transition: none !important; animation: none !important; }");
        return n ? `${n} hover rules removed, transitions off` : { skip: "no hover rules" };
    }),

    d("upscaled-images", "soft-images", ["home"], "tune", () => {
        // every picture swapped for a 48×32 file shown at the original size
        const c = document.createElement("canvas"); c.width = 48; c.height = 32;
        const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 48, 32);
        grad.addColorStop(0, "#4a6b8a"); grad.addColorStop(1, "#c9a36b"); g.fillStyle = grad; g.fillRect(0, 0, 48, 32);
        const tiny = c.toDataURL("image/png");
        let n = 0;
        for (const img of images(100, 70)) {
            const b = box(img);
            imp(img, { width: b.w + "px", height: b.h + "px" });
            for (const s of img.parentElement?.tagName === "PICTURE" ? img.parentElement.querySelectorAll("source") : []) s.remove();
            img.removeAttribute("srcset"); img.removeAttribute("sizes"); img.src = tiny; n++;
        }
        return n >= 2 ? `${n} pictures swapped for 48×32 files` : { skip: "fewer than 2 pictures" };
    }),

    d("two-primary-buttons", "competing-actions", ["home"], "tune", () => {
        // the page's first filled button gets a twin beside it with another label
        const cand = all("button, a, [role=button], input[type=submit]").filter((el) => buttonish(el) && loud(el) && !el.closest("li, article") && top(el) < vh * 3);
        const b = cand.find((el) => !inChrome(el)) ?? cand[0];
        if (!b) return { skip: "no filled button outside cards" };
        const twin = b.cloneNode(true);
        const leaf = [...twin.querySelectorAll("*")].reverse().find((k) => own(k)) ?? twin;
        if (twin.tagName === "INPUT") twin.value = "Learn more"; else { for (const n of [...leaf.childNodes]) if (n.nodeType === 3) n.remove(); leaf.append("Learn more"); }
        twin.removeAttribute("id"); twin.removeAttribute("aria-label");
        imp(twin, { "margin-left": "8px" });
        b.after(twin);
        imp(b.parentElement, { overflow: "visible" });
        return `twin of "${(b.innerText ?? b.value ?? "").trim().slice(0, 30)}"`;
    }),

    d("nine-type-sizes", "noisy-type", ["home"], "tune", () => {
        // text is set in nine unrelated sizes, one per component class
        const sizes = [11, 13, 15, 17, 19, 21, 23, 27, 31];
        const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
        let n = 0;
        for (const el of all()) { if (!own(el) || !shown(el)) continue; imp(el, { "font-size": sizes[hash(el.tagName + "|" + (el.className?.toString?.() ?? "")) % 9] + "px" }); n++; }
        return `${n} text elements across nine sizes`;
    }),

    d("rainbow-colours", "too-many-colours", ["home"], "held", () => {
        const grounds = ["#ffd27a", "#b9f2c9", "#f7b4d8", "#a8d8ff", "#ffb38a", "#d4b8ff"], inks = ["#7a1fa2", "#b3261e", "#00695c", "#5d4037", "#283593", "#ad1457"];
        const st = stack();
        if (!st) return { skip: "no stack of sections" };
        st.kids.forEach((k, i) => imp(k, { "background-color": grounds[i % grounds.length], "background-image": "none" }));
        let n = 0;
        for (const el of all("h1, h2, h3, h4, p, a, span")) if (own(el) && shown(el) && !inChrome(el)) imp(el, { color: inks[n++ % inks.length] });
        return `${st.kids.length} sections on six grounds, ${n} text elements in six inks`;
    }),

    d("irregular-spacing", "loose-spacing", ["home"], "held", () => {
        const gaps = [13, 29, 19, 37, 7, 43, 11, 23, 5, 31, 17, 41];
        let n = 0;
        for (const el of all("h1, h2, h3, h4, p, li, section, article, ul, figure")) if (shown(el) && !inChrome(el)) imp(el, { "margin-bottom": gaps[n++ % gaps.length] + "px" });
        return `${n} blocks given unrelated bottom margins`;
    }),

    d("misaligned-blocks", "ragged-edges", ["home"], "tune", () => {
        const pads = [14, 38, 6, 52, 18, 74, 10, 22, 30, 44, 62, 26];
        let n = 0;
        for (const el of all()) if (own(el).length >= 3 && shown(el) && !inChrome(el)) imp(el, { "padding-left": pads[n++ % pads.length] + "px", "box-sizing": "border-box" });
        return `${n} text elements indented by unrelated amounts`;
    }),

    d("hero-fills-first-screen", "hero-takes-fold", ["home"], "held", () => {
        // one picture is put across the whole first screen, pushing the page's content down
        const pic = images(200, 140).sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
        if (!pic) return { skip: "no picture to use" };
        const head = all("header, [role=banner]").find((h) => shown(h) && top(h) < 40 && box(h).h < 220);
        const hero = document.createElement("img");
        hero.src = pic.currentSrc || pic.src; hero.alt = "";
        imp(hero, { display: "block", width: "100vw", height: (head ? vh - box(head).h : vh) + "px", "object-fit": "cover", "max-width": "none" });
        if (head && getComputedStyle(head).position !== "fixed" && getComputedStyle(head).position !== "absolute") head.after(hero); else { document.body.prepend(hero); if (head) imp(hero, { height: vh + "px" }); }
        return "full-screen picture inserted at the top";
    }),

    d("bare-cards", "bare-cards", ["listing"], "tune", () => {
        // prices, ratings, review counts, durations and small badges are taken off the page
        const FACT = /[$£€¥₹]\s?\d|\d[\d.,]*\s?(?:[$£€]|USD|EUR|GBP)|[★⭐]|^\s*[1-5][.,]\d{1,2}\s*$|\(\s?[\d.,]+k?\+?\s?\)|\b\d[\d,.]*k?\+?\s*(?:reviews?|ratings?)\b|\b\d+(?:[.,]\d)?\s?(?:h|hr|hrs|hours?|min|mins|minutes?|days?)\b|^from$|^free$/i;
        let n = 0;
        for (const el of all()) {
            if (inChrome(el) || !shown(el)) continue;
            const label = el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "";
            if (/\b(rat(ed|ing)|stars?|out of 5|reviews?)\b/i.test(label)) { el.removeAttribute("aria-label"); el.removeAttribute("title"); if (box(el).w < 260 && box(el).h < 60) { imp(el, { display: "none" }); n++; continue; } }
            const t = own(el);
            if (t && t.length <= 60 && FACT.test(t)) { imp(el, { display: "none" }); n++; continue; }
            const b = box(el);
            if (t && t.length <= 28 && b.h <= 36 && b.w <= 240 && !/^(A|BUTTON|H1|H2|H3|H4|LABEL|INPUT|SELECT)$/.test(el.tagName) && !el.closest("button, a > span:only-child")) { const a = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).map(Number); if (a.length >= 3 && (a[3] ?? 1) >= 0.5 && !(a[0] > 244 && a[1] > 244 && a[2] > 244)) { imp(el, { display: "none" }); n++; } }
        }
        return n >= 6 ? `${n} prices, ratings, durations and badges removed` : { skip: "fewer than 6 facts on the page" };
    }),

    d("no-filters-or-sort", "missing-controls", ["listing"], "tune", () => {
        const RE = /^(all )?filters?\b|^filter by|^refine|^sort\b|^sorted by|^recommended$|^most popular$|price.{0,6}low/i;
        let n = 0;
        for (const el of all("button, select, a, summary, label, legend, h2, h3, h4, [role=button], [role=combobox]")) {
            const t = ((el.getAttribute("aria-label") ?? "") + " " + (el.children.length <= 3 ? (el.innerText ?? "").slice(0, 60) : "")).trim();
            if (shown(el) && RE.test(t)) { imp(el, { display: "none" }); n++; }
        }
        for (const el of all("aside, [class*=filter i], [class*=facet i], [class*=sort i], [id*=filter i], [id*=sort i]")) if (shown(el) && box(el).h < vh * 6 && !el.querySelector("h1")) { imp(el, { display: "none" }); n++; }
        return n ? `${n} filter and sort controls removed` : { skip: "no filter or sort controls" };
    }),

    d("mismatched-image-shapes", "ragged-images", ["listing"], "held", () => {
        // pictures that sit together are cut to four different proportions
        const ratios = [1, 2, 0.8, 1.6];
        let n = 0;
        for (const img of images(120, 80)) {
            const b = box(img);
            if (b.w > vw * 0.7) continue;
            const h = Math.round(b.w / ratios[n % 4]) + "px";
            imp(img, { height: h, "aspect-ratio": "auto", "object-fit": "cover", "min-height": "0", "max-height": "none" });
            for (let p = img.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) { const pb = box(p); if (Math.abs(pb.w - b.w) > 2 || Math.abs(pb.h - b.h) > 2) break; imp(p, { height: h, "aspect-ratio": "auto", "padding-top": "0", "padding-bottom": "0", "min-height": "0", "max-height": "none" }); }
            n++;
        }
        return n >= 4 ? `${n} pictures cut to four proportions` : { skip: "fewer than 4 pictures" };
    }),

    d("low-contrast-text", "low-contrast", ["listing"], "tune", () => { css("body, body * { color: #c2c7cc !important; -webkit-text-fill-color: #c2c7cc !important; }"); return "all text light grey"; }),

    d("tiny-tap-targets", "small-taps", ["listing"], "tune", () => {
        let n = 0;
        for (const el of all("a, button, select, summary, [role=button], [role=tab], [role=link]")) {
            if (!shown(el) || el.querySelector("img, picture, video") || box(el).h > 90) continue;
            imp(el, { height: "20px", "min-height": "0", "min-width": "0", "padding-top": "0", "padding-bottom": "0", "line-height": "20px", "font-size": "11px", overflow: "hidden" });
            n++;
        }
        return `${n} controls cut to 20px tall`;
    }),

    d("sideways-scroll", "sideways-scroll", ["listing"], "held", () => {
        const el = all("header, [role=banner], main, body > div").find((e) => shown(e) && box(e).w >= vw * 0.9) ?? document.body.firstElementChild;
        imp(el, { width: "calc(100vw + 260px)", "max-width": "none", "min-width": "calc(100vw + 260px)" });
        for (const r of [document.documentElement, document.body]) imp(r, { "overflow-x": "visible" });
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) imp(p, { "overflow-x": "visible" });
        return "one block made 260px wider than the screen";
    }),

    d("small-secondary-text", "small-text", ["listing"], "held", () => {
        let n = 0;
        for (const el of all()) if (own(el) && shown(el) && parseFloat(getComputedStyle(el).fontSize) <= 16) { imp(el, { "font-size": "10px" }); n++; }
        return `${n} text elements at 16px or under set to 10px`;
    }),

    d("price-below-first-screen", "buy-below-fold", ["detail"], "tune", () => {
        // a screen-tall block of introduction is put ahead of the content, and nothing stays pinned
        for (const el of all()) { const p = getComputedStyle(el).position; if ((p === "fixed" || p === "sticky") && shown(el) && (PRICE.test(el.innerText ?? "") || el.querySelector("h1"))) imp(el, { position: "static" }); }
        const h1 = all("h1").find(shown);
        const pad = document.createElement("div");
        pad.textContent = "About this place";
        imp(pad, { height: Math.round(vh * 1.2) + "px", "font-size": "18px", padding: "24px", "box-sizing": "border-box" });
        const head = all("header, [role=banner]").find((h) => shown(h) && top(h) < 40 && box(h).h < 220 && !/fixed|absolute/.test(getComputedStyle(h).position));
        if (head) head.after(pad); else document.body.prepend(pad);
        const stillPrice = all().some((el) => { const t = own(el); const b = box(el); return t && PRICE.test(t) && shown(el) && b.y < vh && b.y + b.h > 0; });
        return { note: `content pushed ${Math.round(vh * 1.2)}px down`, h1: !!h1, priceStillOnFirstScreen: stillPrice };
    }),

    d("one-small-photo", "few-photos", ["detail"], "held", () => {
        const pics = images(200, 150).filter((i) => top(i) < vh * 1.5);
        if (pics.length < 2) return { skip: "fewer than 2 large pictures near the top" };
        pics.forEach((img, i) => { if (i === 0) imp(img, { width: "190px", height: "140px", "min-width": "0", "min-height": "0", position: "static" }); else imp(img, { display: "none" }); });
        for (const el of all()) { if (!shown(el) || top(el) >= vh * 1.5) continue; const bg = getComputedStyle(el).backgroundImage; if (/url\(/.test(bg) && box(el).w >= 200 && box(el).h >= 150) imp(el, { "background-image": "none" }); }
        return `${pics.length - 1} of ${pics.length} top pictures removed, the last shrunk to 190×140`;
    }),

    d("broken-images", "broken-images", ["detail"], "held", () => {
        const pics = images(120, 90).slice(0, 4);
        if (pics.length < 2) return { skip: "fewer than 2 pictures" };
        pics.forEach((img, i) => { const b = box(img); imp(img, { width: b.w + "px", height: b.h + "px" }); for (const s of img.parentElement?.tagName === "PICTURE" ? img.parentElement.querySelectorAll("source") : []) s.remove(); img.removeAttribute("srcset"); img.src = `pd-missing-${i}.jpg`; });
        return `${pics.length} pictures pointed at missing files`;
    }),

    d("inputs-12px", "zooming-inputs", ["form", "availability"], "tune", () => {
        if (!all("input, select, textarea").some((e) => shown(e) && !/^(hidden|submit|button|checkbox|radio)$/.test(e.type))) return { skip: "no inputs" };
        css("input, select, textarea { font-size: 12px !important; }");
        return "inputs set to 12px text";
    }),

    d("placeholder-only-labels", "unlabelled-fields", ["form", "availability"], "tune", () => {
        const fields = fieldEls();
        if (fields.length < 2) return { skip: "fewer than 2 fields" };
        let n = 0;
        for (const f of fields) {
            const labels = [...(f.labels ?? [])];
            const text = (labels.map((l) => l.innerText).join(" ") || f.getAttribute("aria-label") || f.getAttribute("title") || f.name || "Value").trim().slice(0, 40);
            for (const l of labels) { if (l.contains(f)) { const div = document.createElement("div"); for (const n2 of [...l.childNodes]) { if (n2.nodeType === 3) continue; div.append(n2); } l.replaceWith(div); } else l.remove(); }
            for (const id of (f.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) f.getRootNode().getElementById?.(id)?.remove();
            f.removeAttribute("aria-labelledby"); f.removeAttribute("aria-label"); f.removeAttribute("title");
            if (f.tagName !== "SELECT") f.setAttribute("placeholder", text);
            n++;
        }
        return `${n} fields left with a placeholder only`;
    }),

    d("fields-side-by-side", "long-form", ["form", "availability"], "held", () => {
        // each field's row is narrowed so that neighbours pair up two to a line
        const fields = fieldEls();
        if (fields.length < 4) return { skip: "fewer than 4 fields" };
        const rowOf = (f) => { let r = f; while (r.parentElement && r.parentElement !== document.body && !fields.some((g) => g !== f && r.parentElement.contains(g))) r = r.parentElement; return r; };
        const rows = [...new Set(fields.map(rowOf))];
        const parents = new Set(rows.map((r) => r.parentElement));
        for (const p of parents) imp(p, { display: "grid", "grid-template-columns": "1fr 1fr", "column-gap": "16px", "align-items": "end" });
        return `${rows.length} field rows paired two to a line`;
    }),

    d("no-focus-ring", "no-focus", ["form", "availability"], "tune", () => {
        const n = dropRules(/:focus/);
        css("*:focus, *:focus-visible, *:focus-within { outline: none !important; }");
        return `${n} focus rules removed, outlines off`;
    }),

    d("actions-behind-kebab", "hidden-actions", ["listing", "table"], "tune", () => {
        // every labelled action inside a repeated row or card is swapped for a ⋯ button
        let n = 0;
        for (const row of all("tr, li, article, [role=row], [role=listitem]")) {
            if (!shown(row) || inChrome(row) || box(row).h < 32 || row.querySelector("tr, li, article")) continue;
            const acts = [...row.querySelectorAll("button, [role=button], a, input[type=submit]")].filter((b) => buttonish(b) || ((b.tagName === "BUTTON" || b.getAttribute("role") === "button") && shown(b) && (b.innerText ?? "").trim()));
            if (!acts.length) continue;
            acts.forEach((b, i) => { if (i) { imp(b, { display: "none" }); return; } const k = document.createElement("button"); k.type = "button"; k.textContent = "⋯"; k.setAttribute("aria-label", "More actions"); imp(k, { width: "32px", height: "32px", background: "transparent", border: "1px solid #999", "border-radius": "6px" }); b.replaceWith(k); });
            n++;
        }
        return n >= 3 ? `${n} rows left with only a ⋯ button` : { skip: "fewer than 3 rows with a labelled action" };
    }),

    d("cramped-rows", "cramped-table", ["table"], "tune", () => { if (!all("table").some(shown)) return { skip: "no table" }; css("td, th { padding: 1px 2px !important; line-height: 1.05 !important; height: auto !important; } tr { height: auto !important; }"); return "cell padding cut to 1px 2px"; }),

    d("numbers-left-no-lines", "unscannable-table", ["table"], "held", () => { if (!all("table").some(shown)) return { skip: "no table" }; css("td, th { text-align: left !important; border: 0 !important; } tr { border: 0 !important; background: transparent !important; } table { border: 0 !important; }"); return "numbers left-aligned, row lines and stripes removed"; }),

    d("full-width-lines", "long-lines", ["article"], "tune", () => {
        let n = 0;
        for (const p of all("p")) {
            if (!shown(p) || (p.innerText ?? "").length < 150) continue;
            for (let a = p; a && a !== document.documentElement; a = a.parentElement) imp(a, { "max-width": "none", width: a === p ? "auto" : "100%", float: "none", "flex-basis": "100%", "grid-column": "1 / -1" });
            n++;
        }
        return n ? `${n} paragraphs let run the full width of the window` : { skip: "no long paragraphs" };
    }),
];

/** The mutation as the source of a zero-argument function, ready for collectAll({ mutate }). */
export const mutationSource = (defect) => `() => { ${PRELUDE}\nreturn (${defect.mutate.toString()})(); }`;
