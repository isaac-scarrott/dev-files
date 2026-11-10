#!/usr/bin/env node
// Plugin overhead profiler. Drives an isolated OpenCode desktop (desktop-harness.sh) over CDP,
// bare vs each plugin alone vs all together, on the same seeded long session, N runs, median.
//
//   node perf.mjs [--plugins a,b,c] [--only-all] [--runs 3] [--turns 600] [--idle 30]
//                 [--scenarios idle,scroll,type,switch,stream,hover] [--profile] [--out dir] [--report]
//
//   --plugins   GUI plugins to measure alone (default: every dir under the plugins root with dist/gui-experimental.cjs)
//   --all-of    plugins composing the "all" config (default: --plugins); lets a second invocation add plugins to the same --out
//   --only-all  skip the per-plugin configs; measure bare + all
//   --init JS   like --eval but installed before every page load (survives reloads: coldload experiments)
//   --eval JS   run JS in the page after setup (experiments: hide a plugin's node, disable a feature) before any scenario
//   --sidebar [L,A,P]  sidebar scale: L live sessions opened as tabs, A archived, P projects (default 300,600,12), via fixtures/sidebar-seed.
//               Use with the sidebar scenarios: coldload,sbopen,sbscroll,sbexpand,sbhover,idle,type
//   --plain     the old seed (plain text prompts and answers). Default is --realistic: reasoning, tool calls with large outputs
//               and diffs, subagent children, attachments, long markdown (see seed-session.mjs); --turns = assistant messages
//   --profile   also take a V8 CPU profile per scenario (self time by script url) into runs/*.json
//   --report    do not run anything; rebuild report.md from the runs already in --out
//
// Env: PERF_PLUGINS_ROOT (default: ../../../../apps/opencode-plugins from this file), PERF_PW (dir holding
// node_modules/playwright-core, default /private/tmp/pw; `npm i playwright-core` there once, public registry),
// OC_HARNESS_CDP_PORT (9577), OC_HARNESS_SERVICE_PORT (49688), PERF_STUB_PORT (49777), PERF_ROOT (/private/tmp/oc-perf-run).
// Never touches the user's app or service: the harness root is private and wiped before every run.
import { execFileSync, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { createServer } from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const args = (() => {
  const a = process.argv.slice(2), o = { runs: 3, turns: 0, idle: 30, scenarios: "open,reopen,idle,scroll,type,switch,stream,hover", out: "/private/tmp/oc-perf-out" }
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, "")
    if (["profile", "report", "plain"].includes(k)) o[k] = true
    else if (k === "only-all") o.onlyAll = true
    else if (k === "all-of") o.allOf = a[++i]
    else if (k === "sidebar") o.sidebar = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : "150,600,12"
    else o[k] = a[++i]
  }
  o.runs = +o.runs; o.idle = +o.idle
  o.turns = +o.turns || (o.plain ? 600 : 650)   // realistic: assistant messages; plain: prompts
  return o
})()
const PLUGINS_ROOT = path.resolve(process.env.PERF_PLUGINS_ROOT ?? path.join(HERE, "../../../../apps/opencode-plugins"))
const CDP = +(process.env.OC_HARNESS_CDP_PORT ?? 9577)
const SVC = +(process.env.OC_HARNESS_SERVICE_PORT ?? 49688)
const STUB = +(process.env.PERF_STUB_PORT ?? 49777)
const ROOT = process.env.PERF_ROOT ?? "/private/tmp/oc-perf-run"
const SCENARIOS = args.scenarios.split(",")
fs.mkdirSync(path.join(args.out, "runs"), { recursive: true })

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null }
const spread = (xs) => { const s = xs.filter((x) => x != null); return s.length ? Math.max(...s) - Math.min(...s) : 0 }
const log = (m) => console.error(`  - ${m}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- metrics definition shared by run and report ----------
// per scenario: busy = main-thread task time, script/layout/style = ms, rates are per second
const METRICS = ["busyMs", "scriptMs", "layoutMs", "styleMs", "layouts", "styleRecalcs", "longTasks", "longMs", "jankFrames", "moCb", "moRec", "timerFires", "rafFires"]


// ---------- run ----------
async function main() {
  const discovered = fs.readdirSync(PLUGINS_ROOT).filter((d) => d !== "native-ui" && fs.existsSync(path.join(PLUGINS_ROOT, d, "dist/gui-experimental.cjs")))
  const plugins = args.plugins ? args.plugins.split(",") : discovered
  // "null" is a plugin whose setup does nothing: the host's own cost of loading any plugin, the floor a real plugin is judged against
  const configs = [{ name: "bare", dirs: [] }, { name: "null", dirs: [path.join(HERE, "fixtures/null-plugin")] }]
  if (!args.onlyAll) for (const p of plugins) configs.push({ name: p, dirs: [path.join(PLUGINS_ROOT, p)] })
  configs.push({ name: "all", dirs: (args.allOf ? args.allOf.split(",") : plugins).map((p) => path.join(PLUGINS_ROOT, p)) })
  const { chromium } = createRequire((process.env.PERF_PW ?? "/private/tmp/pw") + "/")("playwright-core")
  // other agents run harnesses too: never share a port, never kill what this script did not start
  for (const port of [CDP, SVC, STUB]) if (spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).stdout.trim()) throw new Error(`port ${port} is in use by something else; set OC_HARNESS_CDP_PORT / OC_HARNESS_SERVICE_PORT / PERF_STUB_PORT`)
  const stub = await startStub()
  const stubCfg = path.join(args.out, "stub-provider.json")
  fs.writeFileSync(stubCfg, JSON.stringify({
    provider: { stub: { npm: "@ai-sdk/openai-compatible", name: "Stub", options: { baseURL: `http://127.0.0.1:${STUB}/v1`, apiKey: "x" },
      models: { "stub-1": { name: "Stub 1", cost: { input: 1, output: 1 }, limit: { context: 100000, output: 8000 } } } } },
    model: "stub/stub-1",
  }))
  try {
    // interleave: run r of every config before run r+1, so slow drift hits all configs alike
    for (let r = 0; r < args.runs; r++) for (const c of configs) {
      const f = path.join(args.out, "runs", `${c.name}.${r}.json`)
      if (fs.existsSync(f)) continue
      console.error(`[run ${r + 1}/${args.runs}] ${c.name}`)
      let result
      for (let attempt = 1; ; attempt++) {
        try { result = await oneRun(chromium, c, stubCfg); break }
        catch (e) { console.error(`  attempt ${attempt} failed: ${String(e.message).split("\n")[0]}`); if (attempt >= 2) throw e }
      }
      fs.writeFileSync(f, JSON.stringify(result, null, 1))
    }
  } finally { stub.close(); harness("stop") }
}

function harness(cmd, dirs = [], extra = {}) {
  return execFileSync(path.join(HERE, "desktop-harness.sh"), [cmd, ...dirs], {
    env: { ...process.env, OC_HARNESS_ROOT: ROOT, OC_HARNESS_CDP_PORT: String(CDP), OC_HARNESS_SERVICE_PORT: String(SVC), OC_HARNESS_TURNS: String(args.turns), ...(args.plain ? {} : { OC_HARNESS_REALISTIC: "1" }), ...extra },
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  })
}

async function oneRun(chromium, config, stubCfg) {
  try { harness("stop") } catch {}
  fs.rmSync(ROOT, { recursive: true, force: true })
  harness("start", [...(args.sidebar ? [path.join(HERE, "fixtures/sidebar-seed")] : []), ...config.dirs], { OC_HARNESS_EXTRA_CONFIG: stubCfg })
  if (args.sidebar) {
    const password = JSON.parse(fs.readFileSync(path.join(ROOT, "state/opencode/service.json"), "utf8")).password
    execFileSync("node", [path.join(HERE, "seed-session.mjs"), `http://127.0.0.1:${SVC}`, password, path.join(ROOT, "project"), "0", "--sidebar", args.sidebar], { stdio: "ignore" })
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`)
  try {
    const page = browser.contexts()[0].pages()[0]
    await page.setViewportSize({ width: 1600, height: 1000 })
    const cdp = await browser.contexts()[0].newCDPSession(page)
    await cdp.send("Performance.enable")
    await cdp.send("HeapProfiler.enable")
    await page.addInitScript(INSTRUMENT)
    if (args.init) await page.addInitScript(args.init)
    await page.reload()
    await page.waitForTimeout(2500)
    const out = { config: config.name, bundleBytes: bundleBytes(config.dirs), scenarios: {}, profile: {} }
    log("setup")
    out.loadMs = await page.evaluate(() => performance.now())
    // side tabs layout (sidebar plugins only act there), then the long session
    await page.mouse.click(119, 25); await page.waitForTimeout(1200)          // Home (top tabs layout)
    await page.getByText("Settings", { exact: true }).first().click(); await page.waitForTimeout(800)
    await page.getByText("Side tabs", { exact: true }).first().click(); await page.waitForTimeout(1200)
    await goHome(page); await page.waitForTimeout(1500)   // scenarios open the long thread themselves
    if (args.sidebar) {
      await page.addInitScript((n) => (window.__seedTabs = n), Number(args.sidebar.split(",")[0]))
      await page.reload(); await page.waitForTimeout(15000)   // the fixture opens the live sessions as tabs
      out.seeded = await page.evaluate(() => ({ opened: window.__seedTabsOpened, rows: document.querySelectorAll("[data-titlebar-tab]").length }))
    }
    await page.mouse.move(800, 500)
    out.setup = await page.evaluate(() => ({ tabs: [...document.querySelectorAll("[data-titlebar-tab]")].map((t) => t.getAttribute("data-active") + ":" + t.textContent.slice(0, 20)), nodes: document.querySelectorAll("*").length, styles: [...document.querySelectorAll("style[data-plugin]")].map((s) => s.dataset.plugin) }))

    if (args.eval) await page.evaluate(args.eval)
    const api = {
      page, cdp,
      metrics: async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])),
      perf: () => page.evaluate(() => ({ ...window.__perf, fdLen: window.__perf.fd.length, fd: undefined })),
      frameStats: (from) => page.evaluate((i) => { const d = window.__perf.fd.slice(i).sort((a, b) => a - b); return { frameP95: d[Math.floor(d.length * 0.95)] ?? 0, frameMax: d[d.length - 1] ?? 0 } }, from),
      gc: async () => { await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage") },
    }
    for (const name of SCENARIOS) {
      if (!SCENARIO_FNS[name]) continue
      if (!args.sidebar && name !== "open" && name !== "reopen") await ensureLong(page)
      log(name); await settle(page)
      if (args.profile) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start") }
      const m0 = await api.metrics(), p0 = await api.perf(), t0 = Date.now()
      const extra = (await withTimeout(SCENARIO_FNS[name](api), 120000 + args.idle * 1000, name)) ?? {}
      const secs = (Date.now() - t0) / 1000
      const m1 = await api.metrics(), p1 = await api.perf(), fstat = await api.frameStats(p0.fdLen)
      if (args.profile) out.profile[name] = selfTimeByUrl((await cdp.send("Profiler.stop")).profile)
      const d = (k) => m1[k] - m0[k], dp = (k) => p1[k] - p0[k]
      out.scenarios[name] = {
        secs,
        busyMs: d("TaskDuration") * 1000, scriptMs: d("ScriptDuration") * 1000, layoutMs: d("LayoutDuration") * 1000, styleMs: d("RecalcStyleDuration") * 1000,
        layouts: d("LayoutCount"), styleRecalcs: d("RecalcStyleCount"),
        longTasks: dp("long"), longMs: dp("longMs"), jankFrames: dp("jank"), frames: dp("frames"),
        moCb: dp("moCb"), moRec: dp("moRec"), moObserve: dp("moObs"), timerSets: dp("tmrSet"), timerFires: dp("tmrFire"), rafFires: dp("rafFire"),
        nodes: m1.Nodes, listeners: m1.JSEventListeners, heapUsed: m1.JSHeapUsedSize, intervalsLive: p1.intLive,
        ...fstat, ...extra,
      }
    }
    return out
  } catch (e) { await browser.contexts()[0].pages()[0].screenshot({ path: path.join(args.out, `fail-${config.name}.png`) }).catch(() => {}); throw e }
  finally { await browser.close().catch(() => {}); try { harness("stop") } catch {} }
}

function withTimeout(p, ms, what) { let t; return Promise.race([p, new Promise((_, rej) => (t = setTimeout(() => rej(new Error(`scenario ${what} timed out`)), ms)))]).finally(() => clearTimeout(t)) }
async function settle(page) { await page.mouse.move(800, 500); await page.waitForTimeout(1500) }
function bundleBytes(dirs) { return dirs.reduce((n, d) => n + fs.statSync(path.join(d, "dist/gui-experimental.cjs")).size, 0) }
function selfTimeByUrl(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), t = {}
  const f = {}
  profile.samples.forEach((id, i) => {
    const n = byId.get(id), c = n.callFrame, dt = (profile.timeDeltas[i] ?? 0) / 1000
    const u = c.url || `(${c.functionName || "native"})`; t[u] = (t[u] ?? 0) + dt
    const k = `${c.functionName || "(anon)"} ${c.url.split("/").pop()}:${c.lineNumber}`; f[k] = (f[k] ?? 0) + dt
  })
  const top = (o, n) => Object.fromEntries(Object.entries(o).filter(([k, v]) => v >= 1 && !k.startsWith("((")).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]))
  return { byUrl: top(t, 12), byFunction: top(f, 25) }
}

// ---------- scenarios (identical script each run) ----------
/** The sidebar's Home row (sidebar-repos hides it, so a DOM click), falling back to its text. */
async function goHome(page) {
  const row = page.locator("[data-action='vertical-tabs-home']").first()
  const real = await row.isVisible().catch(() => false)
  if (real) { await row.click({ timeout: 5000 }).catch(() => {}); return }
  const hit = await page.evaluate(() => { const el = document.querySelector("[data-action='vertical-tabs-home']"); el?.click(); return !!el })
  if (!hit) await page.getByText("Home", { exact: true }).first().click()
}

async function ensureLong(page) {
  if ((await page.locator("[data-titlebar-tab]").count()) < 2) {
    // Home toggles: if the list is not there after a click, the first click left it, so click again.
    for (let i = 0; i < 3 && !(await page.getByText("Seeded long session").first().isVisible().catch(() => false)); i++) { await goHome(page); await page.waitForTimeout(1200) }
    await page.getByText("Seeded long session").first().click(); await page.waitForTimeout(4000)
    return
  }
  const active = () => page.evaluate(() => [...document.querySelectorAll("[data-titlebar-tab]")].findIndex((t) => t.getAttribute("data-active") === "true"))
  if ((await active()) !== 1) { await page.locator("[data-titlebar-tab]").nth(1).click(); await page.waitForTimeout(3000) }
}

/** Click the long thread's sidebar row from the draft tab, `rounds` times: time to first row, first paint and settled, as page-clock ms. */
async function openRounds(api, rounds, cold = false) {
  const window_ms = cold ? 8000 : 2500   // each round is measured for a fixed window, so work a plugin starts later (history paging) lands in it
  const { page } = api
  const first = [], paint = [], settle = [], rows = []
  for (let i = 0; i < rounds; i++) {
    if (!cold) { await page.locator("[data-titlebar-tab]").nth(0).click(); await page.waitForTimeout(1200) }
    await page.evaluate(() => Object.assign(window.__perf, { armed: true, tc: 0, tRow: 0, tPaint: 0 }))
    if (cold) await page.getByText("Seeded long session").first().click()   // the Home list row: nothing of the thread is loaded yet
    else await page.locator("[data-titlebar-tab]").nth(1).click()
    const done = await page.waitForFunction(() => { const P = window.__perf; return P.tRow && P.tPaint && performance.now() - P.tLast > 250 }, null, { timeout: 30000, polling: 50 }).then(() => true, () => false)
    const r = await page.evaluate(() => { const P = window.__perf; P.armed = false; return { first: P.tRow - P.tc, paint: P.tPaint - P.tc, settle: Math.max(0, P.tLast - P.tc), rows: document.querySelectorAll("[data-message-id]").length } })
    await page.waitForTimeout(Math.max(0, window_ms - (r.settle + 250)))
    if (done) { first.push(r.first); paint.push(r.paint); settle.push(r.settle); rows.push(r.rows) }
  }
  return { firstRowMs: median(first), paintMs: median(paint), settleMs: median(settle), settleMaxMs: Math.max(0, ...settle), mountedRows: median(rows), openRounds: first.length }
}

const ROWSEL = "[data-titlebar-tab][data-orientation='vertical']"
const SCROLLER = "[data-slot='vertical-tabs-scroll']"

const SCENARIO_FNS = {
  // Cold start of the window with a big sidebar: reload to first sidebar row, to settled (no DOM/long-task activity for 500 ms).
  async coldload({ page }) {
    const t0 = Date.now()
    await page.reload()
    await page.waitForSelector(ROWSEL, { timeout: 60000 }).catch(() => {})
    const first = Date.now() - t0
    await page.waitForFunction(() => performance.now() - window.__perf.tLast > 500 && document.querySelectorAll("[data-titlebar-tab]").length > 5, null, { timeout: 60000, polling: 100 }).catch(() => {})
    return { firstRowMs: first, settleMs: Date.now() - t0, rowsAfter: await page.evaluate(() => document.querySelectorAll("[data-titlebar-tab]").length), mo: await page.evaluate(() => window.__mo && { ...window.__mo, t: performance.now() }) }
  },

  // Click rows in the middle of the sidebar, 10 times alternating two rows: click to settled (no DOM/long-task activity for 250 ms).
  async sbopen({ page }) {
    const settle = []
    for (let i = 0; i < 10; i++) {
      await page.evaluate((i) => { const rows = document.querySelectorAll("[data-titlebar-tab][data-orientation='vertical']"); const el = rows[Math.min(rows.length - 1, 40 + (i % 2) * 7)]; el.scrollIntoView({ block: "center" }); window.__target = el }, i)
      await page.waitForTimeout(400)
      const t = await page.evaluate(() => new Promise((res) => {
        const t0 = performance.now()
        window.__target.querySelector("[data-slot='tab-link']")?.click?.() ?? window.__target.click()
        const tick = () => { const P = window.__perf; if (performance.now() - P.tLast > 250 && performance.now() - t0 > 100) res(P.tLast - t0); else if (performance.now() - t0 > 8000) res(8000); else setTimeout(tick, 30) }
        tick()
      }))
      settle.push(t)
    }
    return { settleMs: median(settle), settleMaxMs: Math.max(...settle) }
  },

  // Wheel the sidebar list fast, up and down, 6 s.
  async sbscroll({ page }) {
    const box = await page.locator(SCROLLER).first().boundingBox()
    if (!box) return { skipped: true }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const t0 = Date.now(); let ev = 0
    while (Date.now() - t0 < 6000) { await page.mouse.wheel(0, (Math.floor((Date.now() - t0) / 1500) % 2 === 0 ? 1 : -1) * 240); ev++; await page.waitForTimeout(12) }
    return { wheelEvents: ev }
  },

  // Expand and collapse the Archived group three times, then page it: the cost of opening a 500+ row group.
  async sbexpand({ page }) {
    const toggle = page.locator("[data-sa-toggle] button", { hasText: "Archived" }).first()
    if (!(await toggle.count())) return { skipped: true }
    const times = []
    for (let i = 0; i < 3; i++) {
      const t0 = await page.evaluate(() => performance.now())
      await toggle.click({ force: true })
      await page.waitForFunction((t0) => performance.now() - window.__perf.tLast > 400 && performance.now() - t0 > 450, t0, { timeout: 15000, polling: 50 }).catch(() => {})
      times.push(await page.evaluate((t0) => window.__perf.tLast - t0, t0))
      if (i < 2) { await toggle.click({ force: true }); await page.waitForTimeout(800) }
    }
    const rows = () => page.evaluate(() => document.querySelectorAll("[data-sa-kind='archived'] [data-slot='tab-link']").length)
    const opened = await rows()
    for (let i = 0; i < 4; i++) { const more = page.locator("[data-sa-more] button").first(); if (await more.isVisible().catch(() => false)) { await more.click({ force: true }); await page.waitForTimeout(1500) } }
    const after = await rows()
    await toggle.click({ force: true }); await page.waitForTimeout(1000)   // end collapsed: the next scenario starts from the same sidebar
    return { expandSettleMs: median(times), expandSettleMaxMs: Math.max(...times), archivedRows: opened, archivedRowsAfterMore: after }
  },

  // The same sweep with the Archived group open (its rows sit at the foot of the list).
  async sbhoverx(api) {
    const toggle = api.page.locator("[data-sa-toggle] button", { hasText: "Archived" }).first()
    if (!(await toggle.count())) return { skipped: true }
    await toggle.click({ force: true }); await api.page.waitForTimeout(1500)
    await SCENARIO_FNS.sbhover(api)
    await toggle.click({ force: true }); await api.page.waitForTimeout(800)
  },

  // Sweep the pointer down and up the sidebar rows, four passes.
  async sbhover({ page }) {
    const box = await page.locator(SCROLLER).first().boundingBox()
    if (!box) return { skipped: true }
    for (let pass = 0; pass < 4; pass++) for (let y = box.y + 6; y < box.y + box.height - 6; y += 14) await page.mouse.move(box.x + 60 + (pass % 2) * 40, pass % 2 ? box.y + box.height - (y - box.y) : y, { steps: 2 })
  },

  // the first open of the long thread in this window (cold: nothing cached), then repeat opens (warm)
  async open(api) { return openRounds(api, 1, true) },
  async reopen(api) { return openRounds(api, 5) },

  async idle({ page }) { await page.waitForTimeout(args.idle * 1000) },

  // Real wheel events (what a trackpad sends), fast, 4 sweeps of 1.5s: up, down, up, down. Time-boxed: with history paging a
  // "reach the end" loop never ends. Wheel input also marks "the user is scrolling" for plugins that wait for quiet.
  async scroll({ page }) {
    await page.mouse.move(900, 500)
    const t0 = Date.now()
    let events = 0
    while (Date.now() - t0 < 6000) {
      const sweep = Math.floor((Date.now() - t0) / 1500)
      await page.mouse.wheel(0, (sweep % 2 === 0 ? -1 : 1) * 260)
      events++
      await page.waitForTimeout(12)
    }
    return { scrollEvents: events, scrollHeightMax: await page.evaluate(() => Math.max(...[...document.querySelectorAll(".scroll-view__viewport")].map((e) => e.scrollHeight))) }
  },

  async type({ page }) {
    await page.locator("[data-component=composer-editor]").first().click()
    await page.keyboard.type("the quick brown fox jumps over the lazy dog ".repeat(5).slice(0, 200), { delay: 8 })
    await page.keyboard.press("Meta+a"); await page.keyboard.press("Backspace")
  },

  // 10 switches long <-> draft with the sidebar open, 10 more with it closed; heap measured around the whole thing after GC
  async switch(api) {
    const { page } = api
    await api.gc(); const h0 = (await api.metrics()).JSHeapUsedSize
    const n0 = (await api.metrics()).Nodes, l0 = (await api.metrics()).JSEventListeners
    // Ctrl+Tab cycles the two tabs, with the sidebar open or collapsed; data-active proves the switch happened
    let missed = 0
    const lat = []
    const active = () => page.evaluate(() => [...document.querySelectorAll("[data-titlebar-tab]")].findIndex((t) => t.getAttribute("data-active") === "true"))
    const flip = async () => {
      const before = await active(), t = Date.now()
      await page.keyboard.press("Control+Tab")
      const ok = await page.waitForFunction((b) => [...document.querySelectorAll("[data-titlebar-tab]")].findIndex((x) => x.getAttribute("data-active") === "true") !== b, before, { timeout: 4000, polling: 16 }).then(() => true, () => false)
      if (ok) lat.push(Date.now() - t); else missed++
      await page.waitForTimeout(300)
    }
    // tab 0 is the draft "Session", tab 1 the long session
    for (let i = 1; i <= 10; i++) await flip()
    await toggleSidebar(page); await page.waitForTimeout(400)
    for (let i = 1; i <= 10; i++) await flip()
    await toggleSidebar(page); await page.waitForTimeout(400)
    if ((await active()) !== 1) await flip(); await page.waitForTimeout(800)
    const after = await (async () => { await api.gc(); return api.metrics() })()
    return { heapGrowthKB: Math.round((after.JSHeapUsedSize - h0) / 1024), switchMissed: missed, switchLatencyMs: median(lat), switchLatencyMax: Math.max(0, ...lat), switchNodesGrowth: after.Nodes - n0, switchListenerGrowth: after.JSEventListeners - l0 }
  },

  // a tool call then a streaming reply from the local stub provider, in the long session
  async stream({ page }) {
    const ok = await selectStubModel(page)
    await page.locator("[data-component=composer-editor]").first().click()
    await page.keyboard.type("run the stub", { delay: 5 })
    await page.keyboard.press("Enter")
    // wait for the reply to finish (stub ends with a marker) or time out
    const done = await page.waitForFunction(() => document.body.innerText.includes("STUB-DONE"), null, { timeout: 40000 }).then(() => true, () => false)
    await page.waitForTimeout(500)
    return { streamModel: ok, streamFinished: done }
  },

  // snake the pointer across the whole window (sidebar rows, header, rail gutter, composer pills)
  async hover({ page }) {
    for (let pass = 0; pass < 2; pass++)
      for (let y = 30; y < 1000; y += 45) {
        const xs = [10, 120, 330, 560, 800, 1100, 1400, 1590]
        for (const x of (y / 45) % 2 < 1 ? xs : [...xs].reverse()) await page.mouse.move(x, y, { steps: 3 })
      }
  },
}

async function toggleSidebar(page) {
  const ok = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('[aria-label="Toggle sidebar"]')]
    const vis = bs.find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth })
    ;(vis ?? bs[0])?.click(); return !!(vis ?? bs[0])
  })
  if (!ok) await page.keyboard.press("Meta+b")
}

async function selectStubModel(page) {
  // composer model button -> pick "Stub 1"; returns whether the picker had it
  try {
    const btn = page.locator("button", { hasText: /seed|unavailable|Stub/i }).last()
    await btn.click(); await page.waitForTimeout(500)
    const row = page.getByText("Stub 1", { exact: true }).first()
    await row.click({ timeout: 3000 }); await page.waitForTimeout(500)
    return true
  } catch { await page.keyboard.press("Escape").catch(() => {}); return false }
}

// ---------- in-page instrumentation (installed before any plugin loads) ----------
function INSTRUMENT() {
  if (window.__perf) return
  const P = (window.__perf = { moCb: 0, moRec: 0, moObs: 0, tmrSet: 0, tmrFire: 0, rafFire: 0, intLive: 0, long: 0, longMs: 0, frames: 0, jank: 0 })
  const MO = window.MutationObserver
  window.MutationObserver = class extends MO {
    constructor(cb) { super(function (r, o) { P.moCb++; P.moRec += r.length; return cb.call(this, r, o) }) }
    observe(...a) { P.moObs++; return super.observe(...a) }
  }
  const st = window.setTimeout, si = window.setInterval, ci = window.clearInterval, raf = window.requestAnimationFrame.bind(window)
  const live = new Set()
  window.setTimeout = (f, ms, ...a) => (typeof f === "function" ? st(() => { P.tmrFire++; f(...a) }, ms) : st(f, ms, ...a))
  window.setInterval = (f, ms, ...a) => { const id = si(typeof f === "function" ? () => { P.tmrFire++; f(...a) } : f, ms); live.add(id); P.intLive = live.size; return id }
  window.clearInterval = (id) => { live.delete(id); P.intLive = live.size; return ci(id) }
  
  window.requestAnimationFrame = (f) => raf((t) => { P.rafFire++; f(t) })
  Object.assign(P, { tc: 0, tRow: 0, tPaint: 0, tLast: 0, armed: false })
  // "Settled" = no DOM mutation and no long task for a while; "first row" = a message row visible; "paint" = the frame after it
  new MO(() => { P.tLast = performance.now() }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
  document.addEventListener("pointerdown", () => { if (P.armed && !P.tc) P.tc = performance.now() }, true)
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { P.long++; P.longMs += e.duration; P.tLast = Math.max(P.tLast, e.startTime + e.duration) } }).observe({ entryTypes: ["longtask"] }) } catch {}
  let last = 0
  P.fd = []
  const tick = (t) => {
    if (P.armed && P.tc && !P.tRow) {
      const row = document.querySelector("[data-message-id]")
      if (row && row.getClientRects().length) { P.tRow = t; raf(() => raf((t2) => { P.tPaint = t2 })) }
    }
    if (last) { P.frames++; P.fd.push(t - last); if (t - last > 20) P.jank++ } last = t; raf(tick) }
  raf(tick)
}

// ---------- stub OpenAI-compatible provider (tool call, then a streamed markdown reply) ----------
function startStub() {
  const srv = createServer((req, res) => {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", async () => {
      if (!req.url.endsWith("/chat/completions")) { res.writeHead(404).end(); return }
      let j = {}; try { j = JSON.parse(body) } catch {}
      const afterTool = (j.messages ?? []).some((m) => m.role === "tool")
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "stub-1", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
      const wantsTitle = (j.messages ?? []).some((m) => /title/i.test(JSON.stringify(m.content)) && m.role === "system") && !(j.tools?.length)
      if (!afterTool && j.tools?.length && !wantsTitle) {
        send({ role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: "" } }] })
        send({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ command: "sleep 3; echo hi", description: "stub wait" }) } }] })
        send({}, "tool_calls")
      } else {
        send({ role: "assistant", content: "" })
        for (let i = 0; i < 120; i++) { send({ content: `word${i} lorem ipsum \`code\` **bold** ` + (i % 12 === 11 ? "\n\n" : "") }); await new Promise((r) => setTimeout(r, 25)) }
        send({ content: "\n\nSTUB-DONE" }); send({}, "stop")
      }
      res.write(`data: {"id":"c","object":"chat.completion.chunk","created":0,"model":"stub-1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":10,"total_tokens":20}}\n\n`)
      res.write("data: [DONE]\n\n"); res.end()
    })
  })
  return new Promise((r) => srv.listen(STUB, "127.0.0.1", () => r(srv)))
}

// ---------- report ----------
function report() {
  const dir = path.join(args.out, "runs")
  const runs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
  const byConfig = {}
  for (const r of runs) (byConfig[r.config] ??= []).push(r)
  const bare = byConfig.bare
  if (!bare) { console.error("no bare runs"); return }
  const agg = (c, sc, k) => { const v = byConfig[c].map((r) => r.scenarios[sc]?.[k]); return { med: median(v), spread: spread(v) } }
  const lines = []
  const scs = SCENARIOS.filter((s) => bare[0].scenarios[s])
  lines.push(`# Plugin performance`, ``, `Runs per config: ${Object.values(byConfig).map((v) => v.length).join("/")}; ${args.turns} prompts; idle ${args.idle}s. Medians. Floor = the \`null\` plugin (host cost of loading any plugin; bare if absent); delta and verdict are against the floor. Allowed noise = max-min over the floor and bare runs.`, ``)

  // bars. Time bars: delta vs bare scripting <= max(3% of bare, bare noise). idle: busy delta <0.5 points of main-thread time.
  const rows = []
  const names = Object.keys(byConfig).filter((c) => c !== "bare" && c !== "null")
  const ref = byConfig.null ? "null" : "bare"   // the floor: cost of loading any plugin at all
  for (const c of names) for (const sc of scs) {
    if (agg(c, sc, "scriptMs").med == null) continue
    const g = (k) => agg(c, sc, k).med, b = (k) => ({ med: agg(ref, sc, k).med, spread: Math.max(agg("bare", sc, k).spread, agg(ref, sc, k).spread) }), secs = agg(c, sc, "secs").med
    const dScript = g("scriptMs") - b("scriptMs").med, dBusy = g("busyMs") - b("busyMs").med
    const dLong = g("longTasks") - b("longTasks").med, dJank = g("jankFrames") - b("jankFrames").med
    const dMo = (g("moCb") - b("moCb").med) / secs, dTmr = (g("timerFires") - b("timerFires").med) / secs
    const dWork = (g("scriptMs") + g("layoutMs") + g("styleMs")) - (b("scriptMs").med + b("layoutMs").med + b("styleMs").med)
    const dBusyPct = (dWork / 1000 / secs) * 100   // busy (TaskDuration) is too noisy to resolve 0.5%; script+layout+style is what a plugin causes
    let ok, bar
    if (sc === "idle") { bar = "script+layout+style <0.5%, no extra MO cb/timer"; ok = dBusyPct < 0.5 && dMo <= 0.1 && dTmr <= 0.1 }
    else {
      const allow = Math.max(0.03 * b("scriptMs").med, b("scriptMs").spread)
      bar = `script <=${allow.toFixed(0)}ms, long tasks/jank frames within noise`; ok = dScript <= allow && dLong <= b("longTasks").spread && dJank <= Math.max(1, b("jankFrames").spread)
    }
    const fp = [g("frameP95"), b("frameP95").med, g("frameMax"), b("frameMax").med]
    rows.push({ fp, c, sc, bareScript: b("scriptMs").med, script: g("scriptMs"), dScript, dBusy, dBusyPct, dLong, dJank, dMo, dTmr, bar, ok })
  }
  lines.push(`## Table: plugin x scenario`, ``, `| plugin | scenario | floor script ms | with ms | delta ms | delta busy ms | new long tasks | new jank frames | p95 frame ms (floor) | max frame ms (floor) | MO cb/s | timers/s | bar | |`, `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`)
  for (const r of rows) lines.push(`| ${r.c} | ${r.sc} | ${r.bareScript?.toFixed(0)} | ${r.script?.toFixed(0)} | ${r.dScript.toFixed(0)} | ${r.dBusy.toFixed(0)} | ${r.dLong} | ${r.dJank} | ${r.fp[0]?.toFixed(1)} (${r.fp[1]?.toFixed(1)}) | ${r.fp[2]?.toFixed(0)} (${r.fp[3]?.toFixed(0)}) | ${r.dMo.toFixed(2)} | ${r.dTmr.toFixed(2)} | ${r.bar} | ${r.ok ? "PASS" : "**FAIL**"} |`)

  const lat = ["open", "reopen"].filter((sc) => scs.includes(sc))
  if (lat.length) {
    lines.push(``, `## Switching to the realistic thread (ms on the page clock, click to ...; medians; floor = null plugin)`, ``, `| plugin | scenario | first row (floor) | first paint (floor) | settled (floor) | settled delta | allowed | |`, `|---|---|---|---|---|---|---|---|`)
    for (const c of ["bare", ...names]) for (const sc of lat) {
      if (agg(c, sc, "settleMs").med == null) continue
      const f = (k) => agg(ref, sc, k).med, w = (k) => agg(c, sc, k).med, noise = Math.max(agg(ref, sc, "settleMs").spread, agg("bare", sc, "settleMs").spread)
      const d = w("settleMs") - f("settleMs"), allow = Math.max(0.05 * f("settleMs"), noise, 20)
      const ok = c === "bare" ? null : d <= allow && w("paintMs") - f("paintMs") <= Math.max(0.05 * f("paintMs"), agg(ref, sc, "paintMs").spread, 20)
      lines.push(`| ${c} | ${sc} | ${w("firstRowMs")?.toFixed(0)} (${f("firstRowMs")?.toFixed(0)}) | ${w("paintMs")?.toFixed(0)} (${f("paintMs")?.toFixed(0)}) | ${w("settleMs")?.toFixed(0)} (${f("settleMs")?.toFixed(0)}) | ${d.toFixed(0)} | ${allow.toFixed(0)} | ${ok === null ? "-" : ok ? "PASS" : "**FAIL**"} |`)
    }
  }
  lines.push(``, `## Footprint after the switch scenario (delta vs bare)`, ``, `| plugin | bundle KB | nodes | listeners | heap growth KB (after GC) | node growth over switches | listener growth over switches | intervals live | switch latency ms (bare) | load ms |`, `|---|---|---|---|---|---|---|---|---|---|`)
  const sw = bare[0].scenarios.switch ? "switch" : scs[scs.length - 1]
  for (const c of names) {
    const dv = (k) => (agg(c, sw, k).med ?? 0) - (agg("bare", sw, k).med ?? 0)
    lines.push(`| ${c} | ${((byConfig[c][0].bundleBytes ?? 0) / 1024).toFixed(0)} | ${dv("nodes")} | ${dv("listeners")} | ${(agg(c, sw, "heapGrowthKB").med ?? 0).toFixed(0)} (bare ${(agg("bare", sw, "heapGrowthKB").med ?? 0).toFixed(0)}) | ${dv("switchNodesGrowth")} | ${dv("switchListenerGrowth")} | ${agg(c, sw, "intervalsLive").med} | ${(agg(c, sw, "switchLatencyMs").med ?? 0).toFixed(0)} (${(agg("bare", sw, "switchLatencyMs").med ?? 0).toFixed(0)}) | ${median(byConfig[c].map((r) => r.loadMs))?.toFixed(0)} |`)
  }

  lines.push(``, `## Bare readings (median [spread])`, ``, `| scenario | secs | busy ms | script ms | layout ms | style ms | long tasks | jank frames | frames | MO cb | timer fires | rAF fires |`, `|---|---|---|---|---|---|---|---|---|---|---|---|`)
  for (const sc of scs) {
    const f = (k) => { const a = agg("bare", sc, k); return a.med == null ? "-" : `${a.med.toFixed(k.endsWith("Ms") || k === "secs" ? 0 : 0)} [${a.spread.toFixed(0)}]` }
    lines.push(`| ${sc} | ${agg("bare", sc, "secs").med?.toFixed(0)} | ${f("busyMs")} | ${f("scriptMs")} | ${f("layoutMs")} | ${f("styleMs")} | ${f("longTasks")} | ${f("jankFrames")} | ${f("frames")} | ${f("moCb")} | ${f("timerFires")} | ${f("rafFires")} |`)
  }
  const stream = byConfig.bare.map((r) => r.scenarios.stream).filter(Boolean)
  if (stream.length) lines.push(``, `stream: model selected ${stream.map((s) => s.streamModel).join("/")}, finished ${stream.map((s) => s.streamFinished).join("/")} (a stream that never ran proves nothing; check these).`)
  const prof = runs.find((r) => Object.keys(r.profile ?? {}).length)
  if (prof) { lines.push(``, `## CPU self time by script (first profiled run per config, ms)`); for (const c of Object.keys(byConfig)) { const r = byConfig[c].find((x) => Object.keys(x.profile ?? {}).length); if (!r) continue; lines.push(``, `### ${c}`); for (const [s, p] of Object.entries(r.profile)) lines.push(`- ${s}: ${Object.entries(p.byUrl ?? {}).slice(0, 5).map(([u, v]) => `${u.split("/").slice(-1)[0] || u} ${v}`).join(", ")}`) } }
  fs.writeFileSync(path.join(args.out, "report.md"), lines.join("\n") + "\n")
  console.log(lines.join("\n"))
}

if (!args.report) await main()
report()
