// Needs playwright-core (npm i in a scratch dir) and a harness window with a long seeded thread, Panel mode on and the right panel closed. OC_HARNESS_CDP_PORT picks the window.
// usage: node geom.mjs <native|ours> <open|close> out.json  -- per-frame centres while toggling
import { chromium } from "playwright-core"
import fs from "node:fs"
const [mode, dir, out] = process.argv.slice(2)
const b = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.OC_HARNESS_CDP_PORT ?? 9333}`)
const page = b.contexts()[0].pages()[0]
await page.setViewportSize({ width: 2000, height: 1190 })
const sel = mode === "native" ? 'button[aria-label="Toggle review"]' : "[data-agents-toggle] button"
const open = () => page.evaluate((s) => document.querySelector(s)?.getAttribute("aria-expanded") === "true", sel)
if ((await open()) !== (dir === "close")) { await page.evaluate((s) => document.querySelector(s).click(), sel); await page.waitForTimeout(1500) }
await page.waitForTimeout(500)
const rows = await page.evaluate((s) => new Promise((resolve) => {
  const card = () => document.querySelector("[data-slot=session-chat-panel]").firstElementChild
  const comp = () => card().querySelector(":scope > div:has(form) > div.shrink-0.items-center > div")
  const msg = () => [...card().querySelectorAll("[data-slot=session-timeline-scroll] .md\\:max-w-session")].find((e) => e.getBoundingClientRect().top > 100 && e.getBoundingClientRect().width > 300)
  const hdr = () => card().querySelector(".session-header-actions")
  const cx = (e) => { const r = e.getBoundingClientRect(); return r.left + r.width / 2 }
  const rec = []
  const t0 = performance.now()
  document.querySelector(s).click()
  const tick = (t) => {
    const m = msg(), c = comp(), h = hdr(), cr = card().getBoundingClientRect()
    rec.push({ t: +(t - t0).toFixed(1), msg: m ? +cx(m).toFixed(2) : null, comp: c ? +cx(c).toFixed(2) : null, hdr: h ? +h.getBoundingClientRect().right.toFixed(2) : null, cardW: +cr.width.toFixed(1), dock: (() => { const d = document.querySelector("[data-agents-dock]"); return d ? +d.getBoundingClientRect().left.toFixed(1) : null })() })
    if (t - t0 < 900) requestAnimationFrame(tick); else resolve(rec)
  }
  requestAnimationFrame(tick)
}), sel)
fs.writeFileSync(out, JSON.stringify(rows))
const f = rows[0], l = rows.at(-1)
console.log(mode, dir, "frames", rows.length, "msg", f.msg, "->", l.msg, "comp", f.comp, "->", l.comp, "hdr", f.hdr, "->", l.hdr, "cardW", f.cardW, "->", l.cardW)
await b.close()
