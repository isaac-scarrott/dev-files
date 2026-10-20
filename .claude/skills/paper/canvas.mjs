#!/usr/bin/env node
// Cheap reads, bulk edits and verification of a Paper canvas, through Paper desktop's local MCP
// endpoint. Output is compact text, one line per thing, so a page costs a few hundred tokens.
//
//   node canvas.mjs boards [--file F] [--page P] [--name "<glob>"]      id, name, w×h, x,y per artboard (pages first)
//   node canvas.mjs size [--file F] [--exact]                            per page: frames, layers, ~bytes; then the file total
//   node canvas.mjs lint --file F --page P [--only names,groups,accent,phrases] [--accent <hex>]   one line per violation, exit 1 if any
//   node canvas.mjs tree <nodeId> --file F [--depth N] [--grep <regex>]  layer tree lines
//   node canvas.mjs find --file F [--page P | --node id] (--text "<glob>" | --color <value> | --font-size <px>)
//   node canvas.mjs tokens --file F [--name "--color-*"]                 design tokens, name: value
//   node canvas.mjs rename --file F --page P --name "<glob>" --replace "<text>" --with "<text>"
//   node canvas.mjs move   --file F --page P --name "<glob>" (--dx N --dy N | --x N --y N)
//   node canvas.mjs style  --file F --page P --name "<glob>" --set '{"backgroundColor":"#fff"}'
//   node canvas.mjs delete --file F --page P --name "<glob>"
//        bulk edits act on the page's top-level artboards; --dry-run lists what would change
//   node canvas.mjs verify --file F --page P [--name "<glob>"] [--open-worst]   frames of the last journey vs their source
//   node canvas.mjs verify --file F --node <id> (--source-node <id> [--source-file A] | --source <png>) [--open-worst]
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { boards, BYTES_PER_LAYER, closeTab, evaluate, fileSize, glob, newTab, parseArgs, runDir, tool, toolRaw } from "./lib.mjs";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);
const need = (...keys) => { for (const k of keys) if (!args[k]) throw new Error(`--${k} required`); };
const line = (b) => `${b.id}  ${b.name}  ${b.w ?? "?"}×${b.h ?? "?"}  @${b.x},${b.y}`;

async function selected() {
    need("file", "page", "name");
    const { list } = await boards(args.file, args.page);
    const re = glob(args.name);
    return list.filter((b) => re.test(b.name));
}
function report(verb, list) {
    console.log(`${verb}${args["dry-run"] ? " (dry run)" : ""}: ${list.length}`);
    for (const b of list.slice(0, args["dry-run"] ? 200 : 10)) console.log("  " + (b.to ? `${b.name} → ${b.to}` : b.name));
}

const kb = (n) => `${Math.round(n / 1024)} KB`;

// ---------- lint ----------
const NAME = /^.+ · \d+ · .+ · .+$/;
const saturated = (hex) => { const m = /^#([0-9a-f]{6})/i.exec(hex ?? ""); if (!m) return false; const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); return Math.max(...v) - Math.min(...v) > 40; };
async function lint() {
    need("file", "page");
    const rules = new Set(String(args.only ?? "names,groups,accent,phrases").split(","));
    const { list } = await boards(args.file, args.page);
    const grounds = list.filter((b) => / · background$/.test(b.name));
    const titles = new Set(grounds.map((b) => b.name.replace(/ · background$/, "")));
    const frames = list.filter((b) => !grounds.includes(b) && !titles.has(b.name) && !/^Notes\b/.test(b.name));
    const out = [];
    if (rules.has("names")) for (const f of frames) if (!NAME.test(f.name)) out.push(`names    ${f.id}  ${f.name}  not "<Screen> · <width> · <brand> · <state>"`);
    if (rules.has("groups") && grounds.length) for (const f of [...frames, ...list.filter((b) => /^Notes\b/.test(b.name))]) {
        const inside = grounds.some((g) => !titles.has(g.name) && g !== grounds.find((x) => x.w === Math.max(...grounds.map((y) => y.w))) && f.x >= g.x && f.y >= g.y && f.x + (f.w ?? 0) <= g.x + g.w && f.y + (f.h ?? 0) <= g.y + g.h);
        if (!inside) out.push(`groups   ${f.id}  ${f.name}  outside every group background`);
    }
    if (rules.has("accent")) {
        const perFrame = new Map(), tally = new Map();
        for (const f of frames) {
            const r = await tool("find_nodes", { fileId: args.file, nodeId: f.id, filters: [{ styleName: "backgroundColor", styleValue: "*" }] });
            const buttons = (r.nodes ?? []).filter((n) => /^button\b/i.test(n.name ?? "")).map((n) => String(n.matched?.[0]?.styleValue ?? "").toUpperCase().slice(0, 7));
            perFrame.set(f, buttons);
            for (const c of buttons) if (saturated(c)) tally.set(c, (tally.get(c) ?? 0) + 1);
        }
        const accent = args.accent ? String(args.accent).toUpperCase() : [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (accent) for (const [f, buttons] of perFrame) { const n = buttons.filter((c) => c === accent).length; if (n > 1) out.push(`accent   ${f.id}  ${f.name}  ${n} buttons filled ${accent}`); }
        console.log(`accent colour: ${accent ?? "none found"}${args.accent ? "" : " (inferred)"}`);
    }
    if (rules.has("phrases")) {
        const phrases = readFileSync(new URL("./lint-phrases.txt", import.meta.url), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
        for (const phrase of phrases) {
            const page = await tool("find_nodes", { fileId: args.file, pageId: args.page, textValue: `*${phrase}*` });
            if (!(page.nodes ?? []).length) continue;
            for (const f of frames) {
                const r = await tool("find_nodes", { fileId: args.file, nodeId: f.id, textValue: `*${phrase}*` });
                const n = (r.nodes ?? []).length;
                if (n) out.push(`phrases  ${f.id}  ${f.name}  "${phrase}" ×${n} (${String(r.nodes[0].matched?.[0]?.textValue ?? "").slice(0, 40)})`);
            }
        }
    }
    for (const l of out) console.log(l);
    console.log(`${out.length} violations in ${frames.length} frames`);
    if (out.length) process.exitCode = 1;
}

/** Paper's picture of a node at half scale: { mimeType, data (base64) }. */
export async function paperShot(fileId, nodeId) {
    const img = (await toolRaw("get_screenshot", { fileId, nodeId, scale: 0.5 })).find((c) => c.type === "image");
    if (!img) throw new Error("no screenshot returned");
    return img;
}
/** Scores a frame's picture against its source's in a browser tab: { match, worst, crop }. */
export function comparePictures(tab, source, frame, { inset = 0, frameWidth, crop = false } = {}) {
    return evaluate(tab, `(${DIFF})(${JSON.stringify({ a: `data:${source.mimeType};base64,${source.data}`, b: `data:${frame.mimeType};base64,${frame.data}`, inset, frameWidth, crop })})`);
}
async function verifyPair(tab, frame) {
    const img = await paperShot(args.file, frame.artboardId);
    const source = frame.sourceNode
        ? await paperShot(args["source-file"] ?? args.file, frame.sourceNode)
        : { mimeType: "image/png", data: readFileSync(frame.shot).toString("base64") };
    const result = await comparePictures(tab, source, img, { inset: frame.inset, frameWidth: frame.frameWidth, crop: !!args["open-worst"] });
    let path = "";
    if (result.crop) { path = join(runDir(args.file, args.page ?? "verify"), `${frame.artboardId}-worst.png`); writeFileSync(path, Buffer.from(result.crop.split(",")[1], "base64")); }
    const w = result.worst;
    console.log(`${result.match.toFixed(1)}%  ${frame.name}  ${frame.artboardId}  worst ${w ? `x${w.x} y${w.y} ${w.w}×${w.h} (${w.miss}% off)` : "none"}${path ? "  " + path : ""}`);
}
// Runs in a browser tab: both pictures drawn at the source's size (the Paper one inset by the
// component padding), softened a touch so anti-aliasing does not count, compared in 64px cells.
const DIFF = `async ({ a, b, inset, frameWidth, crop }) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image failed to load")); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    // The Paper picture covers the whole frame; scale it to the source's pixels per frame pixel.
    const k = frameWidth ? ia.width / (frameWidth - 2 * inset) : ia.width / ib.width;
    const scaleB = frameWidth ? (frameWidth * k) / ib.width : 1;
    const w = ia.width, h = Math.min(ia.height, Math.floor(ib.height * scaleB - 2 * inset * k));
    const draw = (img, s, dx, dy, blur = "blur(1px)") => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d", { willReadFrequently: true }); x.filter = blur; x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, dx, dy, img.width * s, img.height * s); return x; };
    const ca = draw(ia, 1, 0, 0), cb = draw(ib, scaleB, -inset * k, -inset * k);
    const da = ca.getImageData(0, 0, w, h).data, db = cb.getImageData(0, 0, w, h).data;
    const CELL = 64, cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL), miss = new Uint32Array(cols * rows);
    let bad = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > 40) { bad++; miss[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]++; }
    }
    let best = -1, at = 0;
    for (let i = 0; i < miss.length; i++) if (miss[i] > best) { best = miss[i]; at = i; }
    const cx = (at % cols) * CELL, cy = Math.floor(at / cols) * CELL;
    const worst = best > 0 ? { x: Math.round(cx / k), y: Math.round(cy / k), w: Math.round(CELL / k), h: Math.round(CELL / k), miss: Math.round((best / (CELL * CELL)) * 100) } : null;
    let cropUrl = null;
    if (crop && worst) {
        const R = 320, sx = Math.max(0, Math.min(w - R, cx + CELL / 2 - R / 2)), sy = Math.max(0, Math.min(h - R, cy + CELL / 2 - R / 2)), rw = Math.min(R, w), rh = Math.min(R, h);
        const out = new OffscreenCanvas(rw * 2 + 8, rh); const o = out.getContext("2d"); o.fillStyle = "#f0f"; o.fillRect(0, 0, out.width, out.height);
        o.drawImage(draw(ia, 1, 0, 0, "none").canvas, sx, sy, rw, rh, 0, 0, rw, rh); o.drawImage(draw(ib, scaleB, -inset * k, -inset * k, "none").canvas, sx, sy, rw, rh, rw + 8, 0, rw, rh);
        const blob = await out.convertToBlob({ type: "image/png" });
        cropUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    }
    return { match: 100 - (bad / (w * h)) * 100, worst, crop: cropUrl };
}`;
async function verify() {
    need("file");
    let frames;
    if (args.node) {
        if (!args["source-node"] && !args.source) throw new Error("--source-node or --source required with --node");
        const n = await tool("get_node_info", { fileId: args.file, nodeId: args.node });
        frames = [{ artboardId: args.node, name: n.name, sourceNode: args["source-node"], shot: args.source, inset: Number(args.inset ?? 0) }];
    } else {
        need("page");
        const { list } = await boards(args.file, args.page);
        const live = new Map(list.map((b) => [b.id, b]));
        const re = args.name ? glob(args.name) : null;
        frames = JSON.parse(readFileSync(join(runDir(args.file, args.page), "run.json"), "utf8")).filter((f) => live.has(f.artboardId) && (!re || re.test(f.name))).map((f) => ({ ...f, frameWidth: live.get(f.artboardId).w }));
        if (!frames.length) throw new Error("no journey frames to verify on this page (run.json holds none that still exist)");
    }
    const tab = await newTab();
    try {
        for (const f of frames) await verifyPair(tab, f).catch((e) => console.log(`FAIL  ${f.name}  ${f.artboardId}  ${e.message.slice(0, 120)}`));
    } finally { await closeTab(tab); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) try {
    if (command === "boards") {
        const { info, list } = await boards(args.file, args.page);
        const re = args.name ? glob(args.name) : null;
        console.log(`${info.fileName}  ${info.url}`);
        console.log(`pages: ${info.pages.map((p) => `${p.id} ${p.name}${p.id === info.pageId ? " (this)" : ""}`).join(" | ")}`);
        for (const b of list) if (!re || re.test(b.name)) console.log(line(b));
    } else if (command === "tree") {
        need("file");
        const r = await tool("get_tree_summary", { fileId: args.file, nodeId: rest[0], depth: Number(args.depth ?? 3) });
        const re = args.grep ? new RegExp(args.grep, "i") : null;
        for (const l of String(r.summary ?? r).split("\n")) if (!re || re.test(l)) console.log(l);
    } else if (command === "find") {
        need("file");
        const filters = [];
        if (args.color) filters.push({ styleValue: args.color });
        if (args["font-size"]) filters.push({ styleName: "fontSize", styleValue: `${String(args["font-size"]).replace(/px$/, "")}px` });
        const q = { fileId: args.file, ...(args.node ? { nodeId: args.node } : args.page ? { pageId: args.page } : {}), ...(args.text ? { textValue: args.text } : {}), ...(filters.length ? { filters } : {}) };
        const r = await tool("find_nodes", q);
        console.log(`${r.count ?? r.nodes?.length ?? 0} found`);
        for (const n of r.nodes ?? []) console.log(`${n.id}  ${n.component ?? ""}  ${n.name ?? ""}${n.textContent ? `  "${String(n.textContent).slice(0, 60)}"` : ""}`);
    } else if (command === "tokens") {
        need("file");
        const blocks = (await toolRaw("get_tokens", { fileId: args.file, format: "css", ...(args.name ? { namePattern: args.name } : {}) })).filter((c) => c.type === "text").map((c) => c.text);
        console.log(blocks.find((t) => /--[\w-]+\s*:/.test(t)) ?? "no tokens");
    } else if (command === "rename") {
        need("replace");
        const list = (await selected()).map((b) => ({ ...b, to: b.name.replaceAll(args.replace, args.with === true ? "" : args.with ?? "") })).filter((b) => b.to !== b.name);
        if (!args["dry-run"] && list.length) await tool("rename_nodes", { fileId: args.file, updates: list.map((b) => ({ nodeId: b.id, name: b.to })) });
        report("renamed", list);
    } else if (command === "move") {
        const list = await selected();
        const abs = args.x !== undefined || args.y !== undefined;
        const x0 = Math.min(...list.map((b) => b.x)), y0 = Math.min(...list.map((b) => b.y));
        const dx = abs ? Number(args.x ?? x0) - x0 : Number(args.dx ?? 0), dy = abs ? Number(args.y ?? y0) - y0 : Number(args.dy ?? 0);
        if (!args["dry-run"] && list.length) await tool("update_styles", { fileId: args.file, updates: list.map((b) => ({ nodeIds: [b.id], styles: { left: `${b.x + dx}px`, top: `${b.y + dy}px` } })) });
        report(`moved by ${dx},${dy}`, list);
    } else if (command === "style") {
        need("set");
        const list = await selected();
        if (!args["dry-run"] && list.length) await tool("update_styles", { fileId: args.file, updates: [{ nodeIds: list.map((b) => b.id), styles: JSON.parse(args.set) }] });
        report("styled", list);
    } else if (command === "delete") {
        const list = await selected();
        if (!args["dry-run"] && list.length) await tool("delete_nodes", { fileId: args.file, nodeIds: list.map((b) => b.id) });
        report("deleted", list);
    } else if (command === "size") {
        const z = await fileSize(args.file, !!args.exact);
        for (const p of z.pages) console.log(`${p.id}  ${p.name}  ${p.frames} frames  ${p.layers} layers  ~${kb(p.bytes)}`);
        console.log(`total  ${z.name}  ${z.layers} layers  ~${kb(z.bytes)}${args.exact ? " (exported markup)" : ` (layers × ${BYTES_PER_LAYER})`}`);
    } else if (command === "lint") await lint();
    else if (command === "verify") await verify();
    else throw new Error("usage: canvas.mjs boards | size | lint | tree | find | tokens | rename | move | style | delete | verify  (see header)");
    if (["rename", "move", "style"].includes(command) && !args["dry-run"]) await tool("finish_working_on_nodes", { fileId: args.file }).catch(() => {});
} catch (e) {
    console.error(`paper: ${e.message}`);
    process.exit(1);
}
