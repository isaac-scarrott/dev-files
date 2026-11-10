// Disk growth under load, scripts/writes.mjs <bare|all> <seconds> <idle|switch|scroll|type|mix|reload>: snapshot every file size under the harness root before and after an activity script
import { execFileSync, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
const MODE = process.argv[2] ?? "bare", SECS = +(process.argv[3] ?? 90), ACT = process.argv[4] ?? "mix"
const ROOT = "/private/tmp/oc-writes", S = "/Users/isaac/git/dev-files-perf/.claude/skills/opencode-gui-plugins/scripts", P = "/Users/isaac/git/dev-files-perf/apps/opencode-plugins"
const env = { ...process.env, OC_HARNESS_ROOT: ROOT, OC_HARNESS_CDP_PORT: "9631", OC_HARNESS_SERVICE_PORT: "49731", OC_HARNESS_TURNS: "200", OC_HARNESS_REALISTIC: "1", NODE_OPTIONS: "--max-old-space-size=1500" }
const sh = (...a) => execFileSync(`${S}/desktop-harness.sh`, a, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const walk = (d, o = {}) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); try { if (e.isDirectory()) walk(f, o); else if (e.isFile()) o[f] = fs.statSync(f).size } catch {} } return o }
try { sh("stop") } catch {}
fs.rmSync(ROOT, { recursive: true, force: true })
const COPY = "/private/tmp/oc-writes-plugins"; fs.rmSync(COPY, { recursive: true, force: true })
const names = MODE === "bare" ? [] : fs.readdirSync(P).filter((d) => d !== "native-ui" && d !== "claude-proxy" && fs.existsSync(`${P}/${d}/dist/gui-experimental.cjs`)).map((d) => { fs.mkdirSync(`${COPY}/${d}/dist`, { recursive: true }); for (const f of fs.readdirSync(`${P}/${d}/dist`)) if (fs.statSync(`${P}/${d}/dist/${f}`).isFile()) fs.copyFileSync(`${P}/${d}/dist/${f}`, `${COPY}/${d}/dist/${f}`); fs.copyFileSync(`${P}/${d}/package.json`, `${COPY}/${d}/package.json`); return `${COPY}/${d}` })
try {
  sh("start", ...names)
  const { chromium } = createRequire("/private/tmp/pw/")("playwright-core")
  const b = await chromium.connectOverCDP("http://127.0.0.1:9631"); const page = b.contexts()[0].pages()[0]
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.mouse.click(119, 25); await sleep(1200)
  await page.getByText("Seeded long session").first().click(); await sleep(4000)
  await sleep(5000)
  const before = walk(ROOT), t0 = Date.now()
  // activity: switching, scrolling, typing for SECS seconds
  while (Date.now() - t0 < SECS * 1000) {
    if (ACT === "reload") { for (const d of names) { const f = `${d}/dist/gui-experimental.cjs`; const t = new Date(); fs.utimesSync(f, t, t) } await sleep(900); continue }
    if (ACT === "idle") { await sleep(1000); continue }
    if (ACT === "switch" || ACT === "mix") { await page.keyboard.press("Control+Tab"); await sleep(400) }
    if (ACT === "scroll" || ACT === "mix") { await page.mouse.move(900, 500); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, i % 2 ? 400 : -400); await sleep(40) } }
    if (ACT === "type") { await page.locator("[data-component=composer-editor]").first().click().catch(() => {}); await page.keyboard.type("hello world typing text ", { delay: 30 }) }
    await sleep(300)
  }
  const after = walk(ROOT), secs = (Date.now() - t0) / 1000
  const grow = Object.entries(after).map(([f, n]) => [f.replace(ROOT, ""), n - (before[f] ?? 0)]).filter(([, d]) => d > 0).sort((a, c) => c[1] - a[1])
  const total = grow.reduce((n, [, d]) => n + d, 0)
  console.log(`${MODE}/${ACT}: ${secs.toFixed(0)}s, total growth ${(total / 1024).toFixed(0)} KB = ${(total / 1024 / secs).toFixed(1)} KB/s`)
  for (const [f, d] of grow.slice(0, 8)) console.log(`  ${(d / 1024).toFixed(0).padStart(6)} KB  ${f}`)
  await b.close()
} finally { try { sh("stop") } catch {} }
