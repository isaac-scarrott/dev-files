// Size pass over a serialised tree (see serialise.js): fewer bytes and Paper nodes, same render.
// Every rule here was checked by capturing frames raw and simplified and comparing them in Paper;
// `snap --raw` skips the pass.

const OFF = new Set((process.env.SIMPLIFY_OFF ?? "").split(","));
const DEDUPE = new Set((process.env.SIMPLIFY_DEDUPE ?? "color,font-family,font-size,font-weight,font-style,letter-spacing,text-transform,visibility,line-height,text-align,white-space,word-spacing,text-indent,list-style-type,-webkit-text-fill-color").split(","));
const INHERITED = new Set(["color", "font-family", "font-size", "font-style", "font-weight", "letter-spacing", "line-height", "text-align", "text-transform", "white-space", "word-spacing", "text-indent", "visibility", "list-style-type", "-webkit-text-fill-color"]);
// Properties Paper does not draw from.
const NOISE = /^(appearance|unicode-bidi|overflow-clip-margin|border-(start|end)-(start|end)-radius|scrollbar-width|scrollbar-color|scrollbar-gutter|text-wrap-style|hyphens|overflow-wrap|word-break|font-variant-.*|font-feature-settings|font-variation-settings|font-palette|text-autospace|text-spacing-trim|backface-visibility|perspective-origin|transform-style|clip-rule|fill-rule)$/;
const SVG_NOISE = /^(font-size|font-weight|font-family|text-align|line-height|transform-origin|display|color)$/;
const DROP_ATTR = /^(class|role|tabindex|focusable|aria-.*|data-(?!paper-).*|xmlns:xlink)$/;

function parseOpen(open) {
    const m = /^<([a-zA-Z][\w-]*)/.exec(open);
    const attrs = [];
    for (const a of open.matchAll(/\s([^\s=>]+)="([^"]*)"/g)) attrs.push([a[1], a[2]]);
    return { tag: m[1], attrs };
}
const unesc = (s) => s.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const escAttr = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
// Split "k: v; k: v;" without breaking values holding ";" or ":" inside quotes or parentheses.
function parseStyle(text) {
    const out = new Map();
    let depth = 0, quote = null, start = 0;
    const push = (chunk) => { const i = chunk.indexOf(":"); if (i > 0) out.set(chunk.slice(0, i).trim(), chunk.slice(i + 1).trim()); };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === ";" && depth === 0) { push(text.slice(start, i)); start = i + 1; }
    }
    push(text.slice(start));
    return out;
}
const styleText = (m) => [...m].map(([k, v]) => `${k}: ${v};`).join(" ");

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
function shortColor(v) {
    return v
        .replace(/oklab\(([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g, (_, L, a, b, al) => oklabToHex(+L, +a, +b, al === undefined ? undefined : +al))
        .replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g, (_, r, g, b, a) => { const rgb = [r, g, b].map((x) => Math.round(parseFloat(x) * 255)); return a === undefined || parseFloat(a) >= 1 ? `#${rgb.map(hex2).join("")}` : `rgba(${rgb.join(", ")}, ${+parseFloat(a).toFixed(3)})`; })
        .replace(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g, (m0, r, g, b, a) => (a === undefined || parseFloat(a) >= 1 ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : m0));
}
// oklab(L a b [/ alpha]) → sRGB, so Paper gets plain hex like every other colour.
function oklabToHex(L, a, b, alpha) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    const rgb = lin.map((c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055));
    return alpha === undefined || alpha >= 1 ? `#${rgb.map(hex2).join("")}` : `rgba(${rgb.map((x) => Math.max(0, Math.min(255, Math.round(x)))).join(", ")}, ${+alpha.toFixed(3)})`;
}
// Two decimals at most: rounding to .5 shrank hugging boxes enough to wrap their text.
const roundPx = (v) => v.replace(/(-?\d+\.\d{3,})px/g, (_, n) => `${Math.round(parseFloat(n) * 100) / 100}px`);

// Four equal sides become one shorthand; Paper reads the shorthands.
function shorthand(style) {
    const four = (name, keys) => {
        const v = keys.map((k) => style.get(k));
        if (v.some((x) => x === undefined) || v.some((x) => x !== v[0])) return;
        for (const k of keys) style.delete(k);
        style.set(name, v[0]);
    };
    four("padding", ["padding-top", "padding-right", "padding-bottom", "padding-left"]);
    four("margin", ["margin-top", "margin-right", "margin-bottom", "margin-left"]);
    four("border-radius", ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"]);
    const sides = ["top", "right", "bottom", "left"];
    const parts = sides.map((d) => [style.get(`border-${d}-width`), style.get(`border-${d}-style`), style.get(`border-${d}-color`)]);
    const b = parts.map((p) => p.join(" "));
    if (parts.every((p) => p.every((x) => x !== undefined)) && b.every((x) => x === b[0])) { for (const d of sides) for (const p of ["width", "style", "color"]) style.delete(`border-${d}-${p}`); style.set("border", b[0]); }
    if (style.has("column-gap") && style.get("column-gap") === style.get("row-gap")) { style.set("gap", style.get("column-gap")); style.delete("column-gap"); style.delete("row-gap"); }
}

function isElement(n) { return typeof n !== "string" && n.open !== ""; }

// A wrapper that draws nothing and positions nothing, around one block child, can hand its
// inherited text styles to the child and step out of the tree.
const BOX = /^(display|font-.*|color|line-height|letter-spacing|text-align|text-transform|white-space|word-spacing|text-indent|visibility|list-style-type|-webkit-text-fill-color|box-sizing)$/;
function unwrappable(el, style, kids) {
    if (!["div", "span", "section", "article", "header", "footer", "main", "nav", "aside", "li", "ul", "ol", "p"].includes(el.tag)) return false;
    if (el.attrs.some(([k]) => k !== "style" && k !== "layer-name" && k !== "paper-snapshot-original-tag")) return false;
    if (el.attrs.some(([k]) => k === "layer-name")) return false;
    if (kids.length !== 1 || !isElement(kids[0])) return false;
    if (style.get("display") !== "block") return false;
    for (const k of style.keys()) if (!BOX.test(k)) return false;
    const child = parseOpen(kids[0].open);
    if (child.tag === "svg" || child.tag === "img" || child.tag === "input" || child.tag === "textarea") return false;
    const cs = parseStyle(unesc(child.attrs.find(([k]) => k === "style")?.[1] ?? ""));
    if (!/^(block|flex|grid|-webkit-box)$/.test(cs.get("display") ?? "")) return false;
    if (/absolute|fixed/.test(cs.get("position") ?? "")) return false;
    for (const k of cs.keys()) if (/^margin/.test(k) && !/^0(px)?$/.test(cs.get(k))) return false;
    // A % padding resolves against the parent's width: the wrapper hugged the child, its parent does not.
    for (const k of cs.keys()) if (/^padding/.test(k) && cs.get(k).includes("%")) return false;
    return true;
}

export function simplify(root) {
    const stats = { unwrapped: 0 };
    function walk(n, inherited, inSvg, isRoot) {
        if (!isElement(n)) return n;
        const el = parseOpen(n.open);
        const svg = inSvg || el.tag === "svg";
        const styleAttr = el.attrs.find(([k]) => k === "style");
        const style = parseStyle(unesc(styleAttr?.[1] ?? ""));
        for (const k of [...style.keys()]) {
            if (!OFF.has("noise") && (NOISE.test(k) || (inSvg && SVG_NOISE.test(k)))) { style.delete(k); continue; }
            let v = style.get(k);
            if (!OFF.has("color")) v = shortColor(v);
            if (!OFF.has("round")) v = roundPx(v);
            style.set(k, v);
        }
        // Paper frames are border-box by default (measured: 100px + 20px padding stays 100px).
        if (!OFF.has("boxsizing") && style.get("box-sizing") === "border-box") style.delete("box-sizing");
        if (style.get("width") === "auto" && style.get("height") === "auto") { style.delete("width"); style.delete("height"); }
        if (!OFF.has("shorthand")) shorthand(style);
        const mine = new Map(inherited);
        for (const k of INHERITED) if (style.has(k)) {
            // Form controls carry their own defaults (a button centres its text), so they keep theirs.
            if (!OFF.has("dedupe") && !isRoot && DEDUPE.has(k) && inherited.get(k) === style.get(k) && !/^(button|input|select|textarea|th|option)$/.test(el.tag)) style.delete(k);
            else mine.set(k, style.get(k));
        }
        let kids = n.children.map((c) => walk(c, mine, svg, false));
        // Adjacent text strings read as one run.
        kids = kids.reduce((acc, c) => { if (typeof c === "string" && typeof acc[acc.length - 1] === "string") acc[acc.length - 1] += c; else acc.push(c); return acc; }, []);
        const attrs = el.attrs.filter(([k]) => !DROP_ATTR.test(k) && k !== "style").map(([k, v]) => [k, /^(fill|stroke|color|stop-color|flood-color)$/.test(k) ? shortColor(v) : v]);
        if (!OFF.has("unwrap") && !isRoot && !svg && unwrappable({ tag: el.tag, attrs: el.attrs }, style, kids)) {
            const child = kids[0];
            const c = parseOpen(child.open);
            const cs = parseStyle(unesc(c.attrs.find(([k]) => k === "style")?.[1] ?? ""));
            for (const [k, v] of style) if (INHERITED.has(k) && !cs.has(k)) cs.set(k, v);
            const cAttrs = c.attrs.filter(([k]) => k !== "style");
            if (cs.size) cAttrs.push(["style", escAttr(styleText(cs))]);
            stats.unwrapped++;
            return { open: `<${c.tag}${cAttrs.map(([k, v]) => ` ${k}="${v}"`).join("")}>`, close: child.close, children: child.children };
        }
        if (style.size) attrs.push(["style", escAttr(styleText(style))]);
        return { open: `<${el.tag}${attrs.map(([k, v]) => ` ${k}="${v}"`).join("")}>`, close: n.close, children: kids };
    }
    return { tree: walk(root, new Map(), false, true), stats };
}

export function countNodes(n) {
    if (typeof n === "string") return 0;
    return (n.open === "" ? 0 : 1) + n.children.reduce((s, c) => s + countNodes(c), 0);
}
