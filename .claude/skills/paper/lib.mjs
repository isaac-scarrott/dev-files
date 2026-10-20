// Shared plumbing for the skill's scripts: argument parsing, the skill's own headless Chrome and a
// DevTools Protocol session on it, and Paper desktop's local MCP endpoint.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.PAPER_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const PAPER_MCP = process.env.PAPER_MCP ?? "http://127.0.0.1:29979/mcp";

export function parseArgs(rest) {
    const args = {};
    for (let i = 0; i < rest.length; i++) {
        if (!rest[i].startsWith("--")) continue;
        // --key=value carries a value that itself starts with "--" (a token name pattern).
        const eq = rest[i].indexOf("=");
        if (eq > 2) { args[rest[i].slice(2, eq)] = rest[i].slice(eq + 1); continue; }
        const key = rest[i].slice(2);
        const next = rest[i + 1];
        if (next === undefined || next.startsWith("--")) args[key] = true;
        else { args[key] = next; i++; }
    }
    return args;
}
/** Where a journey leaves its source screenshots and run.json for `verify`. */
export function runDir(file, page) {
    const dir = join(process.env.PAPER_RUN_DIR ?? join(tmpdir(), "paper-runs"), `${file}-${page}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** "Home · *" → RegExp; `*` is the only wildcard. */
export function glob(pattern) {
    return new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
}

// ---------- CDP ----------
let browserUrl = null;
/**
 * The DevTools endpoint the command drives: a headless Chrome of its own (temp profile, free port,
 * no window), started on first use and removed when the command ends. PAPER_CDP names another
 * browser instead, never Synth's port 9300: opening tabs there crashed Synth (CEF context bug).
 */
export function browser() {
    return (browserUrl ??= process.env.PAPER_CDP ? Promise.resolve(named(process.env.PAPER_CDP)) : launch());
}
function named(url) {
    const u = new URL(url);
    if (u.port === "9300" && ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(u.hostname)) throw new Error(`PAPER_CDP=${url} is Synth's debugging port; driving it crashes Synth. Unset PAPER_CDP to use the skill's own headless Chrome, or name a Chrome you started with --remote-debugging-port`);
    return url.replace(/\/$/, "");
}
async function launch() {
    if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set PAPER_CHROME)`);
    const profile = mkdtempSync(join(tmpdir(), "paper-chrome-"));
    const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
    chrome.unref();
    const stop = () => { try { chrome.kill("SIGKILL"); } catch {} try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} };
    process.on("exit", stop);
    // A command killed outright runs no exit handler; this outlives it and clears up.
    spawn("/bin/sh", ["-c", `while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done; kill -9 ${chrome.pid} 2>/dev/null; rm -rf "${profile}"`], { stdio: "ignore", detached: true }).unref();
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
    const portFile = join(profile, "DevToolsActivePort");
    for (const end = Date.now() + 20_000; Date.now() < end; await sleep(50)) {
        if (chrome.exitCode !== null) throw new Error(`headless Chrome exited at start (code ${chrome.exitCode})`);
        if (!existsSync(portFile)) continue;
        const url = `http://127.0.0.1:${readFileSync(portFile, "utf8").split("\n")[0]}`;
        if (await fetch(`${url}/json/version`).then((r) => r.ok, () => false)) return url;
    }
    throw new Error("headless Chrome did not open its DevTools port in 20s");
}
export async function cdpTargets() {
    const list = await (await fetch(`${await browser()}/json/list`)).json();
    return list.filter((t) => t.type === "page");
}
export function cdpSession(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map(), listeners = new Map();
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.method) return listeners.get(msg.method)?.(msg.params);
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    };
    const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error(`CDP connect failed: ${wsUrl}`)); });
    return {
        ready,
        /** One handler per CDP event name (the domain must be enabled first). */
        on: (method, fn) => listeners.set(method, fn),
        send: (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }),
        close: () => ws.close(),
    };
}
export async function evaluate(session, expression) {
    const r = await session.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 120_000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
}
/** A tab someone prepared in the browser PAPER_CDP names, by its window.__paperSnap marker or, failing that, a URL substring. */
export async function findTarget(marker) {
    if (!process.env.PAPER_CDP) throw new Error(`"${marker}" names a prepared tab, and the skill's own headless Chrome starts empty: set PAPER_CDP to the browser that holds the tab, or let the command open the page itself (snap --url, a journey without "tab")`);
    const targets = await cdpTargets();
    for (const t of targets) {
        const s = cdpSession(t.webSocketDebuggerUrl);
        try {
            await s.ready;
            if ((await evaluate(s, "window.__paperSnap ?? null")) === marker) return s;
        } catch {}
        s.close();
    }
    const byUrl = targets.filter((t) => t.url.includes(marker));
    if (byUrl.length === 1) { const s = cdpSession(byUrl[0].webSocketDebuggerUrl); await s.ready; return s; }
    throw new Error(byUrl.length ? `"${marker}" matches ${byUrl.length} tabs; set window.__paperSnap to disambiguate` : `No tab with window.__paperSnap === "${marker}" or URL containing it. Tabs: ${targets.map((t) => t.url).join(", ")}`);
}
/** A tab of the script's own. */
export async function newTab(url = "about:blank") {
    const t = await (await fetch(`${await browser()}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    const s = cdpSession(t.webSocketDebuggerUrl);
    await s.ready;
    await s.send("Page.enable");
    s.targetId = t.id;
    return s;
}
export async function closeTab(session) {
    session.close();
    await fetch(`${await browser()}/json/close/${session.targetId}`).catch(() => {});
}

// ---------- Paper MCP ----------
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
async function paperInit() {
    if (paperSession) return;
    await paper("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "paper-skill", version: "1" } });
    await paper("notifications/initialized", {}, true);
}
/** The raw content blocks of a Paper tool call; throws on an error or the file-size warning. */
export async function toolRaw(name, toolArgs) {
    await paperInit();
    const r = await paper("tools/call", { name, arguments: toolArgs });
    const texts = (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text);
    if (r.isError) throw new Error(`${name}: ${texts.join(" ")}`);
    // Paper flags a file near its size limit in a text block; writing on risks losing data, so
    // every command stops at the first sighting (the write that triggered it has landed).
    if (texts.some((t) => /file is too large/i.test(t))) throw new Error(`Paper says the file is too large after ${name}; stop writing to this file (the warning can be stale: reconnect the Paper MCP and re-check with one read)`);
    return r.content ?? [];
}
/** A Paper tool call's payload: the JSON block after the file header, or the joined text. */
export async function tool(name, toolArgs) {
    const texts = (await toolRaw(name, toolArgs)).filter((c) => c.type === "text").map((c) => c.text);
    for (const t of [...texts].reverse()) { try { const j = JSON.parse(t); if (!j.file) return j; } catch {} }
    return texts.join("\n");
}
/** Top-level artboards of a page: { id, name, x, y, w, h }. */
export async function boards(fileId, pageId) {
    const info = await tool("get_basic_info", { fileId, pageId });
    return { info, list: (info.artboards ?? []).map((a) => ({ id: a.id, name: a.name, x: Math.round(a.worldX ?? 0), y: Math.round(a.worldY ?? 0), w: a.width, h: a.height })) };
}

// ---------- size ----------
// Paper reports layers per page for free; bytes are a proxy (layers × 200, the average of this
// skill's own simplified captures). --exact exports every artboard's markup and sums it instead.
export const BYTES_PER_LAYER = 200;
export async function fileSize(fileId, exact = false) {
    const first = await boards(fileId);
    const pages = [];
    for (const p of first.info.pages) {
        const { info, list } = p.id === first.info.pageId ? first : await boards(fileId, p.id);
        let bytes = (info.nodeCount ?? 0) * BYTES_PER_LAYER;
        if (exact) { bytes = 0; for (const b of list) bytes += JSON.stringify(await toolRaw("get_jsx", { fileId, nodeId: b.id })).length; }
        pages.push({ id: p.id, name: p.name, frames: list.length, layers: info.nodeCount ?? 0, bytes });
    }
    return { name: first.info.fileName, pages, layers: pages.reduce((n, p) => n + p.layers, 0), bytes: pages.reduce((n, p) => n + p.bytes, 0) };
}
