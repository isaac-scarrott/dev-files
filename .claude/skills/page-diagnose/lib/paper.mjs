// A Paper frame as a page: `paper:<fileId>/<frameId>` is exported through Paper desktop's local
// MCP endpoint by the paper skill's own code (transfer.mjs: get_jsx with inline styles, tokens
// resolved, image fills kept), written out as static HTML at the frame's width and measured like
// any page. A design has no behaviour, so the collector skips the probes (see `design` in
// collect.mjs and run.mjs).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SKILL = process.env.PAPER_SKILL ?? join(homedir(), ".claude/skills/paper");
export const isPaper = (url) => url.startsWith("paper:");
const SYSTEM_FONT = /^(system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace|inherit|-apple-system|blinkmacsystemfont|arial|helvetica|helvetica neue|times|times new roman|georgia|courier|courier new|menlo|sf pro.*|segoe ui|roboto)$/i;

/**
 * Exports the frame and writes `<dir>/<name>.html`. → { href, width, height, name, source, notes }.
 * Reads the Paper file; writes nothing to it.
 */
export async function exportFrame(url, dir, name) {
    const [fileId, frameId] = url.slice("paper:".length).split("/");
    if (!fileId || !frameId) throw new Error("a Paper frame is addressed as paper:<fileId>/<frameId>");
    for (const f of ["transfer.mjs", "lib.mjs"]) if (!existsSync(join(SKILL, f))) throw new Error(`Paper frames need the paper skill at ${SKILL} (set PAPER_SKILL)`);
    const transfer = await import(pathToFileURL(join(SKILL, "transfer.mjs")).href), lib = await import(pathToFileURL(join(SKILL, "lib.mjs")).href);
    if (typeof transfer.exportFrame !== "function" || typeof transfer.html !== "function" || typeof lib.tool !== "function") throw new Error(`the paper skill at ${SKILL} does not export exportFrame, html and tool: update it`);
    const info = await lib.tool("get_node_info", { fileId, nodeId: frameId });
    if (typeof info === "string") throw new Error(`Paper: ${info}`);
    const tree = await transfer.exportFrame(fileId, frameId);
    // A capture stands in for an embedded frame (a payment widget, a map) with a grey box naming its host. That label was never on the page.
    const standIns = [];
    (function strip(n) { for (const c of n.children ?? []) { if (typeof c === "string") continue; if (c.style?.color === "#787878" && c.children?.length === 1 && typeof c.children[0] === "string" && /^[\w-]+(\.[\w-]+)+$/.test(c.children[0].trim()) && n.style?.backgroundColor === "#EEEEEE") { standIns.push(c.children[0].trim()); c.children = []; } else strip(c); } })(tree);
    const fonts = new Set();
    (function walk(n) { const first = n.style?.fontFamily?.split(",")[0].replace(/["']/g, "").trim(); if (first && !SYSTEM_FONT.test(first) && !first.startsWith("var(")) fonts.add(first); for (const c of n.children ?? []) if (typeof c !== "string") walk(c); })(tree);
    const width = Math.round(info.width), height = Math.round(info.height);
    const root = { ...(tree.style ?? {}) };
    for (const k of ["position", "left", "top", "right", "bottom"]) delete root[k];
    tree.style = { ...root, width: `${width}px`, minHeight: `${height}px`, boxSizing: "border-box" };
    const fontLink = fonts.size ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${[...fonts].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`).join("&")}&display=block">` : "";
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}.html`);
    writeFileSync(file, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}"><title>${String(info.name ?? frameId).replace(/[<&]/g, "")}</title>${fontLink}<style>html,body{margin:0;padding:0}</style></head><body>${transfer.html(tree)}</body></html>`);
    return { href: pathToFileURL(file).href, width, height, name: info.name ?? frameId, source: url, standIns, notes: ["an exported frame is plain boxes: buttons, links, headings and inputs are not recognised as such"] };
}
