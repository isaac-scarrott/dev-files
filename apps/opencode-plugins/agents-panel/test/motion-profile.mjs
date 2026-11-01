// Needs playwright-core (npm i in a scratch dir) and a harness window with a long seeded thread, Panel mode on and the right panel closed. OC_HARNESS_CDP_PORT picks the window.
// usage: node profile.mjs <native|ours> <runs> <out.json>
import { chromium } from "playwright-core"
import fs from "node:fs"
const [mode, runs = "10", out, flag] = process.argv.slice(2)
const NOTRACE = flag === "notrace"
const b = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.OC_HARNESS_CDP_PORT ?? 9333}`)
const page = b.contexts()[0].pages()[0]
await page.setViewportSize({ width: 2000, height: 1190 })
const cdp = await b.contexts()[0].newCDPSession(page)
await cdp.send("Performance.enable")
const sel = mode === "native" || mode === "idle" ? 'button[aria-label="Toggle review"]' : "[data-agents-toggle] button"
const isOpen = () => page.evaluate((s) => document.querySelector(s)?.getAttribute("aria-expanded") === "true", sel)
const click = () => mode === "idle" ? Promise.resolve() : page.evaluate((s) => document.querySelector(s).click(), sel)
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))

async function trace(fn) {
  const events = []
  cdp.on("Tracing.dataCollected", (e) => events.push(...e.value))
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r))
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "cc", "benchmark", "loading"] }, transferMode: "ReportEvents" })
  await fn()
  await cdp.send("Tracing.end"); await done
  cdp.removeAllListeners("Tracing.dataCollected")
  return events
}
function summarize(events, t0, t1) {
  const mains = new Set(events.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`))
  const inWin = (e) => e.ts >= t0 - 50000 && e.ts <= t1
  const main = events.filter((e) => mains.has(`${e.pid}:${e.tid}`) && e.ph === "X" && inWin(e))
  const sum = (name) => { const xs = main.filter((e) => e.name === name); return { n: xs.length, ms: +(xs.reduce((a, e) => a + e.dur, 0) / 1000).toFixed(2), max: +(Math.max(0, ...xs.map((e) => e.dur)) / 1000).toFixed(2) } }
  const tasks = main.filter((e) => e.name === "RunTask").map((e) => e.dur / 1000)
  const all = events.filter((e) => inWin(e))
  const count = (n) => all.filter((e) => e.name === n).length
  return {
    layout: sum("Layout"), style: sum("UpdateLayoutTree"), prepaint: sum("PrePaint"), paint: sum("Paint"), raster: sum("RasterTask"),
    tasksOver16: tasks.filter((d) => d > 16.7).length, tasksOver50: tasks.filter((d) => d > 50).length, maxTask: +Math.max(0, ...tasks).toFixed(2),
    drawFrame: count("DrawFrame"), dropped: count("DroppedFrame"), beginMain: count("BeginMainThreadFrame"),
  }
}
const REC = `(() => { const r = { t: [], loaf: [], lt: [] }; let on = true;
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) r.loaf.push({ d: e.duration, b: e.blockingDuration ?? 0, at: e.startTime }) });
  try { po.observe({ type: "long-animation-frame", buffered: false }) } catch {}
  const po2 = new PerformanceObserver((l) => { for (const e of l.getEntries()) r.lt.push(e.duration) }); try { po2.observe({ type: "longtask" }) } catch {}
  const loop = (t) => { r.t.push(t); if (on) requestAnimationFrame(loop) }; requestAnimationFrame(loop);
  window.__rec = { stop() { on = false; po.disconnect(); po2.disconnect(); return r } } })()`
const samples = []
for (let i = 0; i < Number(runs); i++) {
  for (const dir of ["open", "close"]) {
    if (mode !== "idle" && (await isOpen()) !== (dir === "close")) { await click(); await page.waitForTimeout(1500) }
    await page.waitForTimeout(400)
    await page.evaluate(REC)
    const m0 = await metrics()
    let t0, t1
    const body = async () => {
      t0 = (await cdp.send("Tracing.getCategories").catch(() => null), performance.now())
      const start = await page.evaluate(() => performance.timeOrigin + performance.now())
      await click()
      await page.waitForTimeout(1100)
      t1 = 0
    }
    const events = NOTRACE ? (await body(), []) : await trace(body)
    const m1 = await metrics()
    const rec = await page.evaluate(() => window.__rec.stop())
    const dts = rec.t.slice(1).map((t, i) => t - rec.t[i])
    const tsAll = events.filter((e) => e.ph === "X" || e.ph === "I").map((e) => e.ts)
    if (NOTRACE) tsAll.push(0)
    const tmin = Math.min(...events.filter((e) => e.name === "EventDispatch" && e.args?.data?.type === "click").map((e) => e.ts), Infinity)
    const start = Number.isFinite(tmin) ? tmin : Math.min(...tsAll)
    const s = NOTRACE ? {} : summarize(events, start, start + 1000000)
    samples.push({ dir, run: i, ...s,
      rafMax: +Math.max(...dts).toFixed(1), rafMedian: +[...dts].sort((a,b)=>a-b)[Math.floor(dts.length/2)].toFixed(1), rafOver9: dts.filter((d) => d > 9.5).length, rafOver17: dts.filter((d) => d > 17.5).length, rafOver20: dts.filter((d) => d > 20).length, rafOver25: dts.filter((d) => d > 25).length, rafN: dts.length,
      loafN: rec.loaf.length, loafMax: +Math.max(0, ...rec.loaf.map((l) => l.d)).toFixed(1), loafBlock: +rec.loaf.reduce((a, l) => a + l.b, 0).toFixed(1), longtasks: rec.lt.length,
      layoutCount: m1.LayoutCount - m0.LayoutCount, layoutMs: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(2),
      recalcCount: m1.RecalcStyleCount - m0.RecalcStyleCount, recalcMs: +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000).toFixed(2),
      scriptMs: +((m1.ScriptDuration - m0.ScriptDuration) * 1000).toFixed(2), taskMs: +((m1.TaskDuration - m0.TaskDuration) * 1000).toFixed(2) })
  }
}
fs.writeFileSync(out, JSON.stringify(samples, null, 1))
const med = (k, d) => { const xs = samples.filter((s) => !d || s.dir === d).map((s) => typeof s[k] === "object" ? s[k].n : s[k]).sort((a, b) => a - b); return xs[Math.floor(xs.length / 2)] }
const ks = ["rafOver17","layoutCount", "layoutMs", "recalcCount", "recalcMs", "scriptMs", "taskMs", "rafMax", "rafOver20", "loafN", "loafMax", "longtasks", "maxTask", "tasksOver16", "dropped", "drawFrame"]
for (const d of ["open", "close"]) console.log(mode, d, ks.map((k) => `${k}=${med(k, d)}`).join(" "))
await b.close()
