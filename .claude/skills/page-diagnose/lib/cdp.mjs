// Chrome DevTools Protocol plumbing: one browser socket, one isolated browser context per page,
// so no measurement shares cookies, cache or a signed-in session with anything else.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The tool drives a headless Chrome of its own. DIAGNOSE_CDP=<url> points it at another browser you
// started for it; an app's own browser (the Synth app listens on 9300) is refused, because opening
// and closing tabs there interrupts and can crash the app.
export const CDP_HTTP = process.env.DIAGNOSE_CDP && process.env.DIAGNOSE_CDP !== "launch" ? process.env.DIAGNOSE_CDP : null;
if (CDP_HTTP && /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\]):9300\b/.test(CDP_HTTP)) throw new Error(`DIAGNOSE_CDP=${CDP_HTTP} is the Synth app's browser: page-diagnose will not drive it. Unset DIAGNOSE_CDP to use its own headless Chrome.`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_PATHS = [process.env.DIAGNOSE_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);

async function version(http) {
    const r = await fetch(`${http}/json/version`, { signal: AbortSignal.timeout(3000) });
    return r.json();
}

const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

/** Starts a headless Chrome with its own profile on a free port; DIAGNOSE_CHROME names the binary. */
async function launch() {
    const dir = mkdtempSync(join(tmpdir(), "page-diagnose-chrome-"));
    for (const bin of [...CHROME_PATHS, ...CHROME_PATHS]) { // a busy machine can miss the first start: each binary gets a second go
        const port = await freePort();
        const child = spawn(bin, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--window-size=1440,900", "--force-device-scale-factor=1", "--disable-blink-features=AutomationControlled", "about:blank"], { stdio: "ignore" });
        // a watchdog outlives us: if this process is killed outright, it still closes Chrome and removes the profile
        if (child.pid) spawn("/bin/sh", ["-c", `while kill -0 ${process.pid} 2>/dev/null; do sleep 1; done; kill -9 ${child.pid} 2>/dev/null; rm -rf "${dir}"`], { stdio: "ignore", detached: true }).unref();
        let dead = false;
        child.on("error", () => { dead = true; });
        child.on("exit", () => { dead = true; });
        // Chrome's helpers go on writing for a moment after it dies, so the profile is removed a second later, by a process that outlives us
        const stop = () => { if (!dead) child.kill("SIGKILL"); spawn("/bin/sh", ["-c", `sleep 1; rm -rf "${dir}"`], { stdio: "ignore", detached: true }).unref(); };
        const http = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 80 && !dead; i++) {
            await sleep(250);
            try { await version(http); return { http, stop }; } catch {}
        }
        stop();
    }
    throw new Error("No Chrome binary to launch. Install Google Chrome, or set DIAGNOSE_CHROME to a Chromium binary, or set DIAGNOSE_CDP to the address of a browser started with --remote-debugging-port.");
}

/** A browser of our own, closed and cleaned up when the run ends, on an error and on Ctrl-C as well. */
export async function openBrowser() {
    let http = CDP_HTTP, stop = () => {};
    if (!http) ({ http, stop } = await launch());
    const quit = () => { stop(); stop = () => {}; };
    process.once("exit", quit);
    for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(sig, () => { quit(); process.exit(130); });
    process.once("uncaughtException", (e) => { quit(); console.error(e); process.exit(1); });
    const v = await version(http);
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const listeners = new Map(); // sessionId → Set<fn>
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id !== undefined) {
            const p = pending.get(msg.id);
            if (!p) return;
            pending.delete(msg.id);
            msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
        } else if (msg.sessionId) for (const fn of listeners.get(msg.sessionId) ?? []) fn(msg.method, msg.params);
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error(`CDP connect failed: ${v.webSocketDebuggerUrl}`)); });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject, method });
        ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });
    return { send, listeners, userAgent: v["User-Agent"], close: () => { ws.close(); quit(); } };
}

/**
 * A tab of our own in a fresh browser context, sized and (for phone widths) emulating a phone.
 * opts: { width, height }.
 */
export async function openPage(browser, opts) {
    const mobile = opts.width < 500;
    const height = opts.height ?? (mobile ? 844 : 900);
    const { browserContextId } = await browser.send("Target.createBrowserContext", { disposeOnDetach: true });
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    const handlers = new Set();
    browser.listeners.set(sessionId, handlers);

    // network bookkeeping: in-flight count for idle detection, bytes for page weight
    const net = { inflight: new Set(), bytes: 0, requests: 0, lastActivity: Date.now(), status: null, mainRequest: null };
    handlers.add((method, p) => {
        if (method === "Network.requestWillBeSent") { net.inflight.add(p.requestId); net.requests++; net.lastActivity = Date.now(); if (p.type === "Document" && !net.mainRequest) net.mainRequest = p.requestId; }
        else if (method === "Network.responseReceived") { if (p.requestId === net.mainRequest) net.status = p.response.status; }
        else if (method === "Network.loadingFinished") { net.inflight.delete(p.requestId); net.bytes += p.encodedDataLength ?? 0; net.lastActivity = Date.now(); }
        else if (method === "Network.loadingFailed") { net.inflight.delete(p.requestId); net.lastActivity = Date.now(); }
    });

    await send("Page.enable");
    await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: opts.width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send("Emulation.setTouchEmulationEnabled", { enabled: mobile }).catch(() => {});
    await send("Emulation.setUserAgentOverride", { userAgent: mobile ? MOBILE_UA : browser.userAgent.replace("HeadlessChrome", "Chrome"), acceptLanguage: "en-US,en;q=0.9" });
    await send("Emulation.setTimezoneOverride", { timezoneId: "UTC" }).catch(() => {});
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }).catch(() => {});

    const page = {
        width: opts.width, height, mobile, net, send,
        on: (fn) => handlers.add(fn),
        async evaluate(expression, timeout = 180_000) {
            const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout });
            if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
            return r.result.value;
        },
        /** Runs before any page script on every navigation. */
        preload: (source) => send("Page.addScriptToEvaluateOnNewDocument", { source }),
        async navigate(url, timeout = 45_000) {
            net.inflight.clear(); net.bytes = 0; net.requests = 0; net.status = null; net.mainRequest = null;
            const loaded = new Promise((resolve) => { const fn = (m) => { if (m === "Page.loadEventFired") { handlers.delete(fn); resolve(true); } }; handlers.add(fn); setTimeout(() => { handlers.delete(fn); resolve(false); }, timeout); });
            const r = await send("Page.navigate", { url });
            if (r.errorText) throw new Error(`navigation failed: ${r.errorText}`);
            return loaded;
        },
        /** Resolves once no request has been in flight for `quiet` ms (two stragglers tolerated), or at `timeout`. */
        async idle(quiet = 700, timeout = 12_000) {
            const end = Date.now() + timeout;
            let since = null;
            while (Date.now() < end) {
                if (net.inflight.size <= 2) { since ??= Date.now(); if (Date.now() - since >= quiet && Date.now() - net.lastActivity >= quiet) return true; }
                else since = null;
                await sleep(100);
            }
            return false;
        },
        async setHeight(h) { await send("Emulation.setDeviceMetricsOverride", { width: opts.width, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile }); },
        /** PNG of page rect in CSS px, one image px per CSS px whatever the device pixel ratio. */
        async screenshot(clip) {
            const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 / (mobile ? 2 : 1) } });
            return Buffer.from(r.data, "base64");
        },
        async thumbnail() {
            const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 55, clip: { x: 0, y: 0, width: opts.width, height, scale: 0.5 } });
            return Buffer.from(r.data, "base64");
        },
        async close() {
            browser.listeners.delete(sessionId);
            await browser.send("Target.closeTarget", { targetId }).catch(() => {});
            await browser.send("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
        },
    };
    return page;
}
