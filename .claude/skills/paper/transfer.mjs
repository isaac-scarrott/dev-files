#!/usr/bin/env node
// Copy or move top-level frames between Paper files (Paper's own tools only move within a file).
// Each frame is exported with get_jsx (inline styles), rebuilt as HTML and written into a new
// artboard in the target file through Paper desktop's local MCP endpoint, so the markup never
// passes through the agent's context.
//
//   node transfer.mjs copy --from-file <fileId> (--nodes id1,id2 | --page <pageId>) --to-file <fileId> --to-page <pageId>
//        --keep-position  same canvas x/y as the source (default: same arrangement, placed right of the target page's content)
//        --tokens         create the design tokens the frames use in the target file, so var(--…) stays live
//                         (default: var(--…) is replaced by its value). A token the target already holds with
//                         another value is inlined and listed under tokens.conflicts.
//        --move           delete each source frame once its copy verifies (same node count and text, no size warning)
//        --dry-run        export and measure only (bytes and node counts per frame); writes nothing
//        --dump <dir>     write source.jsx / copy.html / copy.jsx per frame for debugging
//
// Prints one result per frame: source id → copy id, bytes written, node/text counts on both sides and
// the style differences Paper reports between source and copy.
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PAPER_MCP = process.env.PAPER_MCP ?? "http://127.0.0.1:29979/mcp";
const CHUNK = Number(process.env.PAPER_CHUNK ?? 200_000);
const PLACE_GAP = 240;
const IMAGE_WAIT = Number(process.env.PAPER_IMAGE_WAIT ?? 90); // seconds to wait for image fills to upload

const [command, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i++; }
}

// ---------- Paper MCP (same wire protocol as snap.mjs) ----------
let paperSession = null;
async function paper(method, params, isNotification = false) {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (paperSession) headers["mcp-session-id"] = paperSession;
    const body = isNotification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: Date.now(), method, params };
    const res = await fetch(PAPER_MCP, { method: "POST", headers, body: JSON.stringify(body) });
    paperSession ??= res.headers.get("mcp-session-id");
    if (isNotification) return null;
    const text = await res.text();
    const line = text.split("\n").filter((l) => l.startsWith("data:")).pop() ?? text;
    const msg = JSON.parse(line.replace(/^data:\s*/, ""));
    if (msg.error) throw new Error(`Paper ${method}: ${msg.error.message}`);
    return msg.result;
}
async function tool(name, toolArgs) {
    if (!paperSession) {
        await paper("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "paper-transfer", version: "1" } });
        await paper("notifications/initialized", {}, true);
    }
    let r, texts;
    for (let attempt = 0; ; attempt++) {
        r = await paper("tools/call", { name, arguments: toolArgs });
        texts = (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
        // Paper answers "taking longer than expected" while it digests a large write; reads are safe to repeat.
        if (r.isError && name.startsWith("get_") && attempt < 12 && texts.some((t) => /taking longer than expected/i.test(t))) { await new Promise((res) => setTimeout(res, 10_000)); continue; }
        break;
    }
    if (r.isError) throw new Error(`${name}: ${texts.join(" ")}`);
    // Only the file being written to is guarded: a source at its limit must stay readable (and
    // deletable by --move).
    if (toolArgs.fileId === args["to-file"] && texts.some((t) => /file is too large/i.test(t))) {
        throw new Error(`Paper says the target file is too large after ${name}; stop writing to it and ask for a new file`);
    }
    // Paper returns a file header block ({file, contentHash}), then the payload: JSON, or plain text (get_jsx).
    const isHeader = (t) => { try { return Boolean(JSON.parse(t).file); } catch { return false; } };
    const payload = texts.filter((t) => !isHeader(t)).pop() ?? "";
    try { return JSON.parse(payload); } catch { return payload; }
}

// ---------- JSX (get_jsx, inline-styles) → tree ----------
// Element: { tag, attrs: {name: string}, style: {camelCase: string} | null, children: (Element | string)[] }
const BR = "\u0001";
const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
        if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
        return ENTITIES[e] ?? m;
    });
}
function parseJsx(src) {
    let i = src.indexOf("<");
    const fail = (what) => { throw new Error(`JSX parse: ${what} at ${i}: ${JSON.stringify(src.slice(i, i + 60))}`); };
    const ws = () => { while (/\s/.test(src[i] ?? "")) i++; };
    function quoted() {
        const q = src[i++];
        let out = "";
        while (i < src.length && src[i] !== q) {
            if (src[i] === "\\") { const c = src[++i]; out += c === "n" ? "\n" : c === "t" ? "\t" : c; i++; } else out += src[i++];
        }
        i++;
        return out;
    }
    // get_jsx does not escape quotes inside a style value (url("data:…viewBox='0 0 24 24'…")), so a
    // value ends at the quote that is followed by the next key or the end of the object.
    function styleString() {
        const q = src[i++];
        const start = i;
        for (; i < src.length; i++) {
            if (src[i] === q && /^\s*(,\s*([A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*:|,?\s*\}\})/.test(src.slice(i + 1, i + 200))) break;
        }
        const out = src.slice(start, i);
        i++;
        return out;
    }
    function styleObject() {
        const style = {};
        i++; // {
        for (;;) {
            ws();
            if (src[i] === "}") { i++; return style; }
            let key;
            if (src[i] === "'" || src[i] === '"') key = quoted();
            else { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80)); if (!m) fail("style key"); key = m[0]; i += key.length; }
            ws();
            if (src[i++] !== ":") fail("style colon");
            ws();
            if (src[i] === "'" || src[i] === '"' || src[i] === "`") style[key] = styleString();
            else { const m = /^[^,}\s]+/.exec(src.slice(i, i + 80)); if (!m) fail("style value"); style[key] = m[0]; i += m[0].length; }
            ws();
            if (src[i] === ",") i++;
        }
    }
    function expression() {
        // {' '}, {"text"}, {`text`}: literal text; anything else is kept verbatim.
        i++;
        ws();
        if (src[i] === "'" || src[i] === '"' || src[i] === "`") { const s = quoted(); ws(); if (src[i] !== "}") fail("expression end"); i++; return s; }
        // Not a literal: braces that are part of the text itself.
        let depth = 1, start = i;
        while (i < src.length && depth) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
        return `{${src.slice(start, i - 1)}}`;
    }
    function element() {
        i++; // <
        const m = /^[A-Za-z][\w.:-]*/.exec(src.slice(i, i + 80));
        if (!m) fail("tag name");
        const node = { tag: m[0], attrs: {}, style: null, children: [] };
        i += m[0].length;
        for (;;) {
            ws();
            if (src[i] === "/" && src[i + 1] === ">") { i += 2; return node; }
            if (src[i] === ">") { i++; break; }
            const a = /^[A-Za-z_:][\w:.-]*/.exec(src.slice(i, i + 80));
            if (!a) fail("attribute");
            i += a[0].length;
            if (src[i] !== "=") { node.attrs[a[0]] = ""; continue; }
            i++;
            if (src[i] === '"' || src[i] === "'") node.attrs[a[0]] = decodeEntities(quoted());
            else if (src[i] === "{") {
                if (a[0] === "style") { i++; ws(); node.style = styleObject(); ws(); if (src[i++] !== "}") fail("style end"); }
                else node.attrs[a[0]] = expression();
            } else fail("attribute value");
        }
        // Children. JSX text: lines are trimmed and joined with one space; {' '} is literal.
        let text = "";
        const flushText = () => {
            const lines = text.split("\n").map((l, n) => (n ? l.trimStart() : l)).map((l, n, all) => (n < all.length - 1 ? l.trimEnd() : l)).filter((l) => l);
            const t = decodeEntities(lines.join(" ")).replaceAll(BR, "\n");
            if (t) node.children.push(t);
            text = "";
        };
        for (;;) {
            if (i >= src.length) fail(`unclosed <${node.tag}>`);
            // A "<" that opens no tag is text ("<3 stars").
            if (src[i] === "<" && !/[A-Za-z/]/.test(src[i + 1] ?? "")) { text += src[i++]; continue; }
            if (src[i] === "<") {
                if (src[i + 1] === "/") {
                    flushText();
                    const end = src.indexOf(">", i);
                    i = end + 1;
                    if (node.children.length > 1 && node.children.every((c) => typeof c === "string")) node.children = [node.children.join("")];
                    return node;
                }
                // A line break inside a text layer is part of its text, not a node.
                const br = /^<br\s*\/?>/.exec(src.slice(i, i + 8));
                if (br) { text += BR; i += br[0].length; continue; }
                flushText();
                node.children.push(element());
            } else if (src[i] === "{") { flushText(); node.children.push(expression()); }
            else text += src[i++];
        }
    }
    if (i < 0) throw new Error("JSX parse: no element");
    return element();
}
function walk(node, fn) {
    fn(node);
    for (const c of node.children) if (typeof c !== "string") walk(c, fn);
}
const textOf = (node) => node.children.filter((c) => typeof c === "string").join("");

// ---------- tree → HTML for write_html ----------
const SVG_TAGS = new Set(["svg", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "g", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "use", "pattern", "text", "tspan", "image", "filter", "symbol"]);
// SVG attributes that are camelCase in SVG itself; every other JSX camelCase attribute is kebab-case there.
const SVG_CAMEL = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits", "patternTransform", "patternContentUnits", "clipPathUnits", "maskUnits", "maskContentUnits", "spreadMethod", "stdDeviation", "baseFrequency", "numOctaves", "textLength", "lengthAdjust", "startOffset", "refX", "refY", "markerWidth", "markerHeight", "markerUnits", "filterUnits", "primitiveUnits", "tableValues", "pathLength"]);
const JSX_ATTR = { className: "class", htmlFor: "for", xlinkHref: "xlink:href", xmlnsXlink: "xmlns:xlink", xmlSpace: "xml:space" };
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const cssName = (k) => (k.startsWith("--") ? k : /^(Webkit|Moz|ms|O)[A-Z]/.test(k) ? `-${kebab(k[0].toLowerCase() + k.slice(1))}` : kebab(k));
const attrName = (k) => JSX_ATTR[k] ?? (SVG_CAMEL.has(k) || !/[A-Z]/.test(k) ? k : kebab(k));
const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => escText(s).replace(/"/g, "&quot;");
const cssText = (style) => Object.entries(style).map(([k, v]) => `${cssName(k)}: ${v};`).join(" ");
const VOID = new Set(["img", "br", "hr", "input"]);

function openTag(node) {
    let s = `<${node.tag}`;
    for (const [k, v] of Object.entries(node.attrs)) s += ` ${attrName(k)}="${escAttr(v)}"`;
    if (node.style && Object.keys(node.style).length) s += ` style="${escAttr(cssText(node.style))}"`;
    return s + ">";
}
export function html(node) {
    if (typeof node === "string") return escText(node).replaceAll("\n", "<br>");
    if (VOID.has(node.tag)) return openTag(node);
    return openTag(node) + node.children.map(html).join("") + `</${node.tag}>`;
}
// Chunkable form for emitChildren: an <svg> is one atom, everything else can be split at children.
function chunkTree(node) {
    if (typeof node === "string") return html(node);
    if (node.tag === "svg" || VOID.has(node.tag)) return { open: html(node), close: "", children: [] };
    return { open: openTag(node), close: `</${node.tag}>`, children: node.children.map(chunkTree) };
}
const render = (n) => (typeof n === "string" ? n : n.open + n.children.map(render).join("") + n.close);

let writes = 0;
async function write(fileId, targetNodeId, markup) {
    writes++;
    return tool("write_html", { fileId, targetNodeId, mode: "insert-children", html: markup });
}
async function emitChildren(fileId, parentId, children) {
    let batch = "";
    const flush = async () => { if (batch) { await write(fileId, parentId, batch); batch = ""; } };
    for (const c of children) {
        const markup = render(c);
        if (markup.length > CHUNK && typeof c !== "string" && c.children.length) {
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
        if (batch.length + markup.length > CHUNK) await flush();
        batch += markup;
    }
    await flush();
}

// ---------- layer names (get_jsx carries none; get_tree_summary lists them in the same order) ----------
const SUMMARY_LINE = /^(\s*)(\w+) "(.*)" \(([0-9A-Za-z]+-[0-9A-Za-z]+)\) [\d.?]+×[\d.?]+(?: "(.*)")?$/;
async function layerList(fileId, nodeId) {
    const { summary } = await tool("get_tree_summary", { fileId, nodeId, depth: 10 });
    const out = [];
    for (const line of (summary ?? "").split("\n")) {
        const m = SUMMARY_LINE.exec(line);
        if (m) { out.push({ depth: m[1].length / 2, type: m[2], name: m[3], id: m[4], text: m[5] }); continue; }
        const hint = /^(\s*)\.\.\. \d+ child/.exec(line);
        if (hint && out.length) {
            // Deeper than the summary's depth limit: expand the parent it belongs to.
            const parent = out[out.length - 1];
            const sub = await layerList(fileId, parent.id);
            for (const s of sub.slice(1)) out.push({ ...s, depth: s.depth + parent.depth });
        }
    }
    return out;
}
// get_tree_summary cuts a large subtree short without saying so. The export knows how many nodes
// each subtree holds, so a short list is refetched child by child.
async function alignedLayers(fileId, nodeId, shape) {
    let size = 0;
    walk(shape, () => size++);
    const list = await layerList(fileId, nodeId);
    if (list.length >= size) return list;
    const elements = shape.children.filter((c) => typeof c !== "string");
    const { children } = await tool("get_children", { fileId, nodeId });
    if (children.length !== elements.length) return list;
    let self = list[0];
    if (!self) { const info = await tool("get_node_info", { fileId, nodeId }); self = { depth: 0, type: info.component, name: info.name, id: nodeId, text: info.textContent ?? undefined }; }
    const out = [self];
    for (let k = 0; k < children.length; k++) for (const l of await alignedLayers(fileId, children[k].id, elements[k])) out.push({ ...l, depth: l.depth + 1 });
    return out;
}
function applyLayerNames(root, layers) {
    const nodes = [];
    walk(root, (n) => nodes.push(n));
    if (nodes.length !== layers.length) return { named: 0, skipped: `layer list has ${layers.length} entries, export has ${nodes.length} nodes` };
    let named = 0;
    nodes.forEach((n, k) => {
        const { type, name, text } = layers[k];
        // Paper names a layer after its type by default; only names someone chose need writing.
        if (k === 0 || type === "SVGVisualElement" || name === type) return;
        // A text layer named after its own content gets that name again by default.
        if (type === "Text" && (name === text || name === textOf(n) || (name.endsWith("…") && textOf(n).startsWith(name.slice(0, -1))))) return;
        n.attrs["layer-name"] = name;
        named++;
    });
    return { named };
}

// ---------- design tokens ----------
const VAR = /var\((--[\w-]+)\)/g;
function resolveToken(tokens, name, seen = new Set()) {
    const t = tokens.get(name);
    if (!t || seen.has(name)) return null;
    seen.add(name);
    const value = String(t.value);
    let ok = true;
    const out = value.replace(VAR, (m, ref) => { const r = resolveToken(tokens, ref, seen); if (r === null) ok = false; return r ?? m; });
    seen.delete(name);
    return ok ? out : null;
}
function mapValues(root, fn) {
    walk(root, (n) => {
        if (n.style) for (const k of Object.keys(n.style)) n.style[k] = fn(n.style[k]);
        for (const k of Object.keys(n.attrs)) if (k !== "layer-name") n.attrs[k] = fn(n.attrs[k]);
    });
}
function usedTokens(root) {
    const used = new Set();
    mapValues(root, (v) => { for (const m of String(v).matchAll(VAR)) used.add(m[1]); return v; });
    return used;
}
// Decide per token: keep var(--…) (it exists in the target, or is created there) or inline its value.
async function planTokens(trees, srcTokens) {
    const used = new Set();
    for (const t of trees) for (const name of usedTokens(t)) used.add(name);
    const report = { used: used.size, unknown: [...used].filter((n) => !srcTokens.has(n)) };
    const inline = new Set([...used].filter((n) => srcTokens.has(n)));
    if (!args.tokens) return { inline, report: { ...report, inlined: inline.size } };

    const dst = new Map((await tool("get_tokens", { fileId: args["to-file"] })).tokens.map((t) => [t.name, t]));
    // Aliases pull their targets along.
    const wanted = new Set();
    const want = (name) => {
        if (wanted.has(name) || !srcTokens.has(name)) return;
        for (const m of String(srcTokens.get(name).value).matchAll(VAR)) want(m[1]);
        wanted.add(name);
    };
    for (const n of inline) want(n);
    const same = (name) => resolveToken(dst, name)?.toLowerCase() === resolveToken(srcTokens, name)?.toLowerCase();
    const conflicts = [...wanted].filter((n) => dst.has(n) && !same(n));
    // A token whose alias chain touches a conflict would resolve differently in the target: inline it too.
    const tainted = new Set(conflicts);
    const taints = (name) => tainted.has(name) || [...String(srcTokens.get(name)?.value ?? "").matchAll(VAR)].some((m) => taints(m[1]));
    for (const n of wanted) if (taints(n)) tainted.add(n);
    const create = [...srcTokens.keys()].filter((n) => wanted.has(n) && !dst.has(n) && !tainted.has(n));
    let created = [];
    if (create.length) {
        const res = await tool("create_tokens", { fileId: args["to-file"], tokens: create.map((n) => { const { name, type, value, description } = srcTokens.get(n); return description ? { name, type, value, description } : { name, type, value }; }) });
        const results = res.results ?? res.tokens ?? res;
        const failed = Array.isArray(results) ? results.filter((r) => r.result === "error") : [];
        for (const f of failed) tainted.add(f.name);
        created = create.filter((n) => !tainted.has(n));
        if (failed.length) report.createErrors = failed.map((f) => `${f.name}: ${f.message}`);
    }
    for (const n of [...inline]) if (!tainted.has(n)) inline.delete(n);
    return { inline, report: { ...report, created, reused: [...wanted].filter((n) => dst.has(n) && !tainted.has(n)).length, conflicts, inlined: inline.size } };
}
// write_html drops elements that do not paint (display:none, opacity:0, visibility:hidden), so
// hidden layers are written visible and get the hiding style back afterwards.
const HIDING = { display: "none", opacity: "0", visibility: "hidden" };
function liftHidden(root) {
    const hidden = [];
    let k = 0;
    walk(root, (n) => {
        const styles = {};
        for (const [key, value] of Object.entries(HIDING)) if (n.style?.[key] === value) { styles[key] = value; delete n.style[key]; }
        if (Object.keys(styles).length) hidden.push({ k, styles });
        k++;
    });
    return hidden;
}
function inlineTokens(root, srcTokens, inline) {
    if (!inline.size) return;
    // Paper does not apply a font token holding a family list ("Source Sans 3", system-ui, …) to a
    // text layer: the text renders in the family inherited from the nearest frame that sets one (or
    // the system font). Inlining the token's own value would change the font, so inline what renders.
    const fonts = (node, inherited) => {
        const own = /^var\((--[\w-]+)\)$/.exec(node.style?.fontFamily ?? "");
        const value = own ? resolveToken(srcTokens, own[1]) : node.style?.fontFamily;
        if (own && inline.has(own[1]) && textOf(node) && value?.includes(",")) {
            if (inherited) node.style.fontFamily = inherited; else delete node.style.fontFamily;
        }
        for (const c of node.children) if (typeof c !== "string") fonts(c, textOf(node) ? inherited : value ?? inherited);
    };
    fonts(root, null);
    mapValues(root, (v) => String(v).replace(VAR, (m, name) => (inline.has(name) ? resolveToken(srcTokens, name) ?? m : m)));
}

/** A frame's export as a tree, every design token replaced by its value (fidelity.mjs lays it out in a browser). */
export async function exportFrame(fileId, nodeId) {
    const jsx = await tool("get_jsx", { fileId, nodeId, format: "inline-styles" });
    if (typeof jsx !== "string") throw new Error(`get_jsx(${nodeId}) returned no JSX`);
    const tree = parseJsx(jsx);
    const tokens = new Map((await tool("get_tokens", { fileId })).tokens.map((t) => [t.name, t]));
    inlineTokens(tree, tokens, new Set([...usedTokens(tree)].filter((name) => tokens.has(name))));
    return tree;
}

// ---------- verification: re-export the copy and compare with the source ----------
// Both sides come out of the same get_jsx normaliser, so equal values print equally.
function compare(src, copy, srcTokens) {
    const flat = (root) => { const out = []; walk(root, (n) => out.push(n)); return out; };
    // Paper rewrites some values on the way in without changing the render: a lone font family gains
    // its fallbacks, an image fill is re-hosted under the target file, font-synthesis splits into longhands.
    const resolved = (key, v) => {
        const value = String(v).replace(VAR, (m, name) => resolveToken(srcTokens, name) ?? m).toLowerCase();
        if (key === "fontFamily") return value.split(",")[0].replace(/["']/g, "").trim();
        return value.replace(/file-assets\/\w+\/(\w+)\.\w+/g, "file-assets/$1");
    };
    const a = flat(src), b = flat(copy);
    const texts = (list) => list.map(textOf).filter((t) => t);
    const ta = texts(a), tb = texts(b);
    const result = { texts: { source: ta.length, copy: tb.length, different: 0 }, styleDiffs: { nodes: 0, props: {} } };
    if (a.length !== b.length) {
        const bag = new Map();
        for (const t of tb) bag.set(t, (bag.get(t) ?? 0) + 1);
        for (const t of ta) { if (bag.get(t)) bag.set(t, bag.get(t) - 1); else result.texts.different++; }
        result.styleDiffs = "skipped: node counts differ";
        return result;
    }
    const samples = [];
    a.forEach((n, k) => {
        const m = b[k];
        if (textOf(n) !== textOf(m)) result.texts.different++;
        const sa = { ...n.attrs, ...(n.style ?? {}) }, sb = { ...m.attrs, ...(m.style ?? {}) };
        delete sa["layer-name"];
        if (k === 0) for (const key of ["left", "top", "position"]) { delete sa[key]; delete sb[key]; }
        let differs = n.tag !== m.tag;
        for (const key of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
            if (key.startsWith("fontSynthesis") || resolved(key, sa[key] ?? "") === resolved(key, sb[key] ?? "")) continue;
            // Paper keeps a font family on a frame only as a token reference; every text layer carries its own.
            if (key === "fontFamily" && sb[key] === undefined && !textOf(n)) continue;
            differs = true;
            result.styleDiffs.props[key] = (result.styleDiffs.props[key] ?? 0) + 1;
            if (samples.length < 6) samples.push(`${n.tag}[${k}] ${key}: ${String(sa[key]).slice(0, 60)} → ${String(sb[key]).slice(0, 60)}`);
        }
        if (differs) result.styleDiffs.nodes++;
    });
    if (samples.length) result.styleDiffs.samples = samples;
    return result;
}

// ---------- copy ----------
const px = (v) => (/^\d+(\.\d+)?px$/.test(String(v)) ? Math.round(parseFloat(v)) : null);

async function copy() {
    for (const k of ["from-file", "to-file", "to-page"]) if (!args[k] || args[k] === true) throw new Error(`--${k} required`);
    if (!args.nodes === !args.page) throw new Error("pass --nodes id1,id2 or --page <pageId> (one of them)");
    const from = args["from-file"], to = args["to-file"];
    if (from === to) throw new Error("source and target are the same file: use Paper's move_nodes / duplicate_nodes");

    // Sources, in layer order (later = on top), so backgrounds land under the frames they hold.
    let sources;
    if (args.page) {
        const info = await tool("get_basic_info", { fileId: from, pageId: args.page });
        const order = (await tool("get_children", { fileId: from, nodeId: info.rootNodeId })).children.map((c) => c.id);
        sources = order.map((id) => ({ id }));
    } else sources = String(args.nodes).split(",").map((s) => ({ id: s.trim() })).filter((s) => s.id);
    const siblingOrder = new Map();
    for (const s of sources) {
        const info = await tool("get_node_info", { fileId: from, nodeId: s.id });
        Object.assign(s, { name: info.name, x: info.worldX, y: info.worldY, width: info.width, height: info.height, parentId: info.parentId });
        if (!siblingOrder.has(info.parentId)) siblingOrder.set(info.parentId, (await tool("get_children", { fileId: from, nodeId: info.parentId })).children.map((c) => c.id));
        s.index = siblingOrder.get(info.parentId).indexOf(s.id);
        s.computed = (await tool("get_computed_styles", { fileId: from, nodeIds: [s.id] })).styles?.[s.id];
    }
    if (!args.page) sources = sources.map((s, n) => ({ ...s, n })).sort((a, b) => (a.parentId === b.parentId ? a.index - b.index : a.n - b.n));

    const target = await tool("get_basic_info", { fileId: to, pageId: args["to-page"] });
    if (typeof target === "string") throw new Error(target);
    const srcTokens = new Map((await tool("get_tokens", { fileId: from })).tokens.map((t) => [t.name, t]));

    // Export everything before the first write, so a failed export leaves the target untouched.
    for (const s of sources) {
        s.jsx = await tool("get_jsx", { fileId: from, nodeId: s.id, format: "inline-styles" });
        if (typeof s.jsx !== "string") throw new Error(`get_jsx(${s.id}) returned no JSX`);
        s.tree = parseJsx(s.jsx);
        s.reference = parseJsx(s.jsx);
        s.layers = await alignedLayers(from, s.id, s.tree);
        s.names = applyLayerNames(s.tree, s.layers);
        // Without a node-to-layer mapping a hidden layer cannot be re-hidden; leaving its hiding style in
        // makes write_html drop it, which keeps the picture right at the cost of the layer.
        s.hidden = s.names.skipped ? [] : liftHidden(s.tree);
        if (s.names.skipped) { let dropped = 0; walk(s.tree, (n) => { if (Object.entries(HIDING).some(([k, v]) => n.style?.[k] === v)) dropped++; }); s.names.hiddenDropped = dropped; }
    }
    if (args["dry-run"]) {
        return { dryRun: true, tokens: { used: new Set(sources.flatMap((s) => [...usedTokens(s.tree)])).size }, frames: sources.map((s) => ({ name: s.name, source: s.id, bytes: html(s.tree).length, nodes: s.layers.length, hiddenLayers: s.hidden.length, layerNames: s.names })) };
    }
    const { inline, report: tokenReport } = await planTokens(sources.map((s) => s.tree), srcTokens);
    for (const s of sources) inlineTokens(s.tree, srcTokens, inline);

    // Placement: source coordinates, or the same arrangement to the right of what the page holds.
    const placed = sources.filter((s) => s.x !== null && s.y !== null);
    let dx = 0, dy = 0;
    if (!args["keep-position"] && placed.length) {
        const boards = target.artboards ?? [];
        const right = boards.length ? Math.max(...boards.map((a) => (a.worldX ?? 0) + (a.width ?? 1440))) + PLACE_GAP : 0;
        const top = boards.length ? Math.min(...boards.map((a) => a.worldY ?? 0)) : 0;
        dx = right - Math.min(...placed.map((s) => s.x));
        dy = top - Math.min(...placed.map((s) => s.y));
    }

    const results = [];
    for (const s of sources) {
        const root = s.tree;
        // A frame becomes the artboard itself; a lone text, shape or SVG is wrapped in one.
        const isFrame = root.tag === "div" && !root.children.some((c) => typeof c === "string");
        const rootStyle = isFrame ? { ...(root.style ?? {}) } : { display: "flex" };
        for (const k of ["position", "left", "top", "right", "bottom"]) delete rootStyle[k];
        // get_jsx can leave the root's own width/height out; the computed styles always carry them.
        // A frame with no size of its own hugs its content; an artboard would default to 1440×900 and a column.
        if (isFrame) for (const k of ["width", "height"]) rootStyle[k] = s.computed?.[k] ?? rootStyle[k] ?? "fit-content";
        if (isFrame && /flex/.test(rootStyle.display ?? "") && !rootStyle.flexDirection) rootStyle.flexDirection = "row";
        const width = px(rootStyle.width) ?? Math.round(s.width ?? 1440), height = px(rootStyle.height) ?? Math.round(s.height ?? 900);
        const fluid = {};
        if (isFrame) { for (const k of ["width", "height"]) if (rootStyle[k] !== undefined && px(rootStyle[k]) === null) fluid[k] = rootStyle[k]; }
        else Object.assign(fluid, { width: "fit-content", height: "fit-content" });
        const board = await tool("create_artboard", { fileId: to, pageId: args["to-page"], name: s.name, styles: { ...rootStyle, width: `${width}px`, height: `${height}px` } });
        const result = { name: s.name, source: s.id, copy: board.id };
        try {
            const children = isFrame ? root.children : [root];
            writes = 0;
            await emitChildren(to, board.id, children.map(chunkTree));
            const late = { ...fluid };
            if (s.x !== null && s.y !== null) Object.assign(late, { left: `${s.x + dx}px`, top: `${s.y + dy}px` });
            if (Object.keys(late).length) await tool("update_styles", { fileId: to, updates: [{ nodeIds: [board.id], styles: late }] });
            result.bytes = children.reduce((n, c) => n + html(c).length, 0);
            result.writes = writes;
            result.layerNames = s.names;

            // The copy's layer list is in the same order as the source's, which maps source nodes to new ids.
            const offset = isFrame ? 0 : 1;
            // Without a mapping the layer lists are not needed (and are slow to complete on a whole captured
            // site); the two exports are counted instead, below.
            const exact = !s.names.skipped;
            const copyLayers = exact ? await alignedLayers(to, board.id, isFrame ? root : { children: [root] }) : [];
            if (exact) result.nodes = { source: s.layers.length, copy: copyLayers.length - offset };
            if (s.hidden.length) {
                const aligned = result.nodes.source === result.nodes.copy && !s.names.skipped;
                if (aligned) await tool("update_styles", { fileId: to, updates: s.hidden.map(({ k, styles }) => ({ nodeIds: [copyLayers[k + offset].id], styles })) });
                result.hiddenLayers = { source: s.hidden.length, hidden: aligned ? s.hidden.length : 0 };
            }

            // Image fills are re-hosted under the target file in the background (….tmp until uploaded).
            const pendingImages = (jsx) => (jsx.match(/file-assets\/[^)'"]+/g) ?? []).filter((u) => u.endsWith(".tmp") || u.startsWith(`file-assets/${from}/`)).length;
            let copyJsx;
            for (let wait = 0; ; wait += 2) {
                copyJsx = await tool("get_jsx", { fileId: to, nodeId: board.id, format: "inline-styles" });
                if (!pendingImages(copyJsx) || wait >= IMAGE_WAIT) break;
                await new Promise((r) => setTimeout(r, 2000));
            }
            const images = new Set(copyJsx.match(/file-assets\/[^)'"]+/g) ?? []).size;
            if (images) result.images = { count: images, pending: pendingImages(copyJsx) };
            const copyTree = parseJsx(copyJsx);
            const reference = isFrame ? s.reference : { tag: "div", attrs: {}, style: copyTree.style, children: [s.reference] };
            if (!exact) {
                const count = (t) => { let n = 0; walk(t, () => n++); return n; };
                result.nodes = { source: count(reference), copy: count(copyTree), counted: "exports" };
            }
            const { texts, styleDiffs } = compare(reference, copyTree, srcTokens);
            Object.assign(result, { texts, styleDiffs });
            if (args.dump) {
                mkdirSync(args.dump, { recursive: true });
                const base = join(args.dump, s.id);
                writeFileSync(`${base}.source.jsx`, s.jsx);
                writeFileSync(`${base}.copy.html`, children.map(html).join("\n"));
                writeFileSync(`${base}.copy.jsx`, copyJsx);
            }
            // Paper reports a file near its limit in screenshot results; one small probe per frame.
            await tool("get_screenshot", { fileId: to, nodeId: board.id, scale: 0.1 });
            await tool("finish_working_on_nodes", { fileId: to, nodeIds: [board.id] });
        } catch (e) {
            results.push({ ...result, error: e.message });
            console.log(JSON.stringify({ tokens: tokenReport, frames: results }, null, 1));
            throw new Error(`${e.message} (partial copy ${board.id} left in the target; no source was deleted for it)`);
        }
        const { nodes, texts, images, hiddenLayers } = result;
        result.verified = Math.abs(nodes.source - nodes.copy) <= Math.max(1, Math.round(nodes.source * 0.01)) && texts.different === 0 && texts.source === texts.copy
            && !images?.pending && (!hiddenLayers || hiddenLayers.hidden === hiddenLayers.source);
        if (args.move) {
            if (result.verified) { await tool("delete_nodes", { fileId: from, nodeIds: [s.id] }); result.sourceDeleted = true; }
            else result.sourceDeleted = false;
        }
        results.push(result);
    }
    return { tokens: tokenReport, frames: results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) try {
    if (command !== "copy") throw new Error("usage: transfer.mjs copy --from-file A (--nodes id1,id2 | --page P) --to-file B --to-page Q [--move] [--keep-position] [--tokens] [--dry-run] [--dump dir]");
    console.log(JSON.stringify(await copy(), null, 1));
} catch (e) {
    console.error(`paper-transfer: ${e.message}`);
    process.exit(1);
}
