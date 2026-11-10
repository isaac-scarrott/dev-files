#!/usr/bin/env node
// Hot-reload and long-session leak probe. Loads GUI plugins into the isolated harness, opens the seeded thread, then reloads the
// plugins N times (touching a COPY of each bundle, never the repo's dist) and prints renderer heap (after forced GC), DOM nodes,
// listeners, plugin style tags, leftover plugin-owned elements, service RSS and "loading plugin" log lines every `--every` reloads.
//
//   node leak.mjs [--plugins a,b] [--reloads 50] [--every 10] [--switches 0] [--turns 200]
//
// Env: PERF_PLUGINS_ROOT (plugins checkout), PERF_PW, OC_HARNESS_CDP_PORT (9631), OC_HARNESS_SERVICE_PORT (49731), PERF_ROOT.
// Plugins run from a throwaway copy under $ROOT/plugins, so touching them never changes the repo. One harness at a time.
import { execFileSync, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const a = process.argv.slice(2)
const arg = (k, d) => (a.includes(`--${k}`) ? a[a.indexOf(`--${k}`) + 1] : d)
const PLUGINS_ROOT = path.resolve(process.env.PERF_PLUGINS_ROOT ?? path.join(HERE, "../../../../apps/opencode-plugins"))
const CDP = +(process.env.OC_HARNESS_CDP_PORT ?? 9631), SVC = +(process.env.OC_HARNESS_SERVICE_PORT ?? 49731)
const ROOT = process.env.PERF_ROOT ?? "/private/tmp/oc-leak-run"
const reloads = +arg("reloads", 50), every = +arg("every", 10), switches = +arg("switches", 0), turns = arg("turns", "200")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const names = (arg("plugins") ?? fs.readdirSync(PLUGINS_ROOT).filter((d) => d !== "native-ui" && d !== "claude-proxy" && fs.existsSync(path.join(PLUGINS_ROOT, d, "dist/gui-experimental.cjs"))).join(",")).split(",")

for (const port of [CDP, SVC]) if (spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).stdout.trim()) throw new Error(`port ${port} busy`)
const harness = (cmd, dirs = []) => execFileSync(path.join(HERE, "desktop-harness.sh"), [cmd, ...dirs], { env: { ...process.env, OC_HARNESS_ROOT: ROOT, OC_HARNESS_CDP_PORT: String(CDP), OC_HARNESS_SERVICE_PORT: String(SVC), OC_HARNESS_TURNS: turns, OC_HARNESS_REALISTIC: "1" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
try { harness("stop") } catch {}
fs.rmSync(ROOT, { recursive: true, force: true })
// throwaway copy: dist + package.json only (bundles require only host-provided modules)
const copies = names.map((n) => { const d = path.join(ROOT, "plugins", n); fs.mkdirSync(path.join(d, "dist"), { recursive: true }); for (const f of fs.readdirSync(path.join(PLUGINS_ROOT, n, "dist"))) if (fs.statSync(path.join(PLUGINS_ROOT, n, "dist", f)).isFile()) fs.copyFileSync(path.join(PLUGINS_ROOT, n, "dist", f), path.join(d, "dist", f)); fs.copyFileSync(path.join(PLUGINS_ROOT, n, "package.json"), path.join(d, "package.json")); return d })
const { chromium } = createRequire((process.env.PERF_PW ?? "/private/tmp/pw") + "/")("playwright-core")
const rssKB = () => { const o = spawnSync("sh", ["-c", `ps -axo rss,command | grep "${ROOT}/desktop/cli" | grep -v grep | awk '{s+=$1} END {print s+0}'`], { encoding: "utf8" }).stdout.trim(); return +o }
const appRssKB = () => +spawnSync("sh", ["-c", `ps -axo rss,command | grep "remote-debugging-port=${CDP}" | grep -v grep | awk '{s+=$1} END {print s+0}'`], { encoding: "utf8" }).stdout.trim()
const logLines = () => { const dir = path.join(ROOT, "data/opencode/log"); if (!fs.existsSync(dir)) return 0; return fs.readdirSync(dir).reduce((n, f) => n + (fs.readFileSync(path.join(dir, f), "utf8").match(/loading plugin/g)?.length ?? 0), 0) }
let browser
try {
  harness("start", copies)
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`)
  const page = browser.contexts()[0].pages()[0]
  await page.setViewportSize({ width: 1600, height: 1000 })
  const cdp = await browser.contexts()[0].newCDPSession(page)
  await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.enable")
  await page.addInitScript(() => { window.__t = { intervals: new Set(), observers: 0 }; const si = setInterval, ci = clearInterval; window.setInterval = (...x) => { const id = si(...x); window.__t.intervals.add(id); return id }; window.clearInterval = (id) => { window.__t.intervals.delete(id); return ci(id) } })
  await page.reload(); await sleep(2500)
  await page.mouse.click(119, 25); await sleep(1200)
  await page.getByText("Seeded long session").first().click(); await sleep(4000)
  const sample = async (label) => {
    await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage")
    const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]))
    const dom = await page.evaluate(() => ({ styles: document.querySelectorAll("style[data-plugin]").length, plugins: [...new Set([...document.querySelectorAll("style[data-plugin]")].map((s) => s.dataset.plugin))].length, intervals: window.__t?.intervals.size ?? -1, bodyKids: document.body.children.length }))
    return { label, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, styles: dom.styles, intervals: dom.intervals, bodyKids: dom.bodyKids, svcMB: Math.round(rssKB() / 1024), appMB: Math.round(appRssKB() / 1024), loadLines: logLines() }
  }
  const rows = [await sample("start")]
  for (let i = 1; i <= reloads; i++) {
    for (const d of copies) { const f = path.join(d, "dist/gui-experimental.cjs"); const t = new Date(); fs.utimesSync(f, t, t) }
    await sleep(900)
    if (i % every === 0) rows.push(await sample(`reload ${i}`))
  }
  for (let i = 0; i < switches; i++) { await page.keyboard.press("Control+Tab"); await sleep(300) }
  if (switches) rows.push(await sample(`+${switches} switches`))
  console.log(`plugins: ${names.join(",")}`)
  console.log("label | heap MB | nodes | listeners | documents | style tags | live intervals | body children | service MB | app MB | loading-plugin log lines")
  for (const r of rows) console.log([r.label, r.heapMB, r.nodes, r.listeners, r.docs, r.styles, r.intervals, r.bodyKids, r.svcMB, r.appMB, r.loadLines].join(" | "))
} finally { await browser?.close().catch(() => {}); try { harness("stop") } catch {} }
