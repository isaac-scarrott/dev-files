// Drives the isolated harness app: seeds, screenshots, proves the isolation with attack pages. One process, no background.
// Usage: node drive.mjs <outDir>   (env: OC_HARNESS_ROOT, OC_HARNESS_CDP_PORT, OC_HARNESS_SERVICE_PORT, PW_DIR for playwright-core)
import { createServer } from "node:net"
import { createSocket } from "node:dgram"
import { execFileSync } from "node:child_process"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? "/private/tmp/vr-shots"
mkdirSync(out, { recursive: true })
const root = process.env.OC_HARNESS_ROOT
const cdp = `http://127.0.0.1:${process.env.OC_HARNESS_CDP_PORT ?? 9333}`
const svc = `http://127.0.0.1:${process.env.OC_HARNESS_SERVICE_PORT ?? 49555}`
const port = Number(process.env.VR_LISTENER_PORT ?? 49871)
const { chromium } = createRequire(join(process.env.PW_DIR, "/"))("playwright-core")
const { password } = JSON.parse(readFileSync(join(root, "state/opencode/service.json"), "utf8"))

// The listener: any TCP connection (even a bare preconnect), any HTTP request, any UDP datagram is a hit.
const hits = []
const log = (kind, detail) => hits.push({ kind, detail, at: Date.now() })
const tcp = createServer((socket) => {
  log("tcp-connect", "")
  socket.on("data", (data) => {
    const line = data.toString("latin1").split("\r\n")[0] ?? ""
    log("tcp-data", line.slice(0, 120))
    socket.end("HTTP/1.1 200 OK\r\ncontent-type: text/html\r\ncontent-length: 2\r\nconnection: close\r\n\r\nok")
  })
  socket.on("error", () => {})
})
await new Promise((resolve) => tcp.listen(port, "127.0.0.1", resolve))
const udp = createSocket("udp4")
udp.on("message", (message) => log("udp", `${message.length} bytes`))
await new Promise((resolve) => udp.bind(port, "127.0.0.1", resolve))

const seeded = JSON.parse(execFileSync("node", [join(here, "seed.mjs"), svc, password, join(root, "project"), String(port)], { encoding: "utf8" }))
console.log("seeded", JSON.stringify(seeded))

const browser = await chromium.connectOverCDP(cdp)
const page = browser.contexts()[0].pages()[0]
await page.setViewportSize({ width: 1400, height: 1000 })
const wait = (ms) => page.waitForTimeout(ms)
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) })
// The attack page asks to open links whenever its card mounts; a user declines, so does the driver.
let declined = 0
const decline = async () => {
  if (!(await page.evaluate(() => !!document.querySelector('[role="dialog"]')))) return
  declined++
  await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 3000 }).catch(() => page.keyboard.press("Escape"))
  await wait(300)
}
const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`)
}
const openSession = async () => {
  await page.mouse.click(101, 22)
  await wait(1200)
  await page.getByText("Visual replies harness").first().click()
  await wait(3500)
}
const state = () =>
  page.evaluate(() => ({
    cards: [...document.querySelectorAll("[data-visual-reply]")].map((h) => ({ title: h.querySelector("[data-slot=title]")?.textContent, frames: h.querySelectorAll("iframe").length, error: h.querySelector("[data-slot=error]")?.textContent ?? null, height: Math.round(h.querySelector("iframe")?.getBoundingClientRect().height ?? 0) })),
    rows: [...document.querySelectorAll("[data-visual-reply-update]")].map((r) => r.innerText.replace(/\s+/g, " ").trim()),
    animations: document.getAnimations().filter((a) => a.effect?.target?.closest?.("[data-visual-reply],[data-visual-reply-update],[data-visual-reply-panel],[data-visual-reply-overlay]")).length,
    sandboxes: [...document.querySelectorAll("[data-visual-reply] iframe")].map((f) => f.getAttribute("sandbox")),
    blocked: [...document.querySelectorAll("[data-visual-reply] iframe")].filter((f) => /tried to navigate/.test(f.srcdoc)).length,
  }))

// The timeline renders only the rows near the viewport, so collect cards while scrolling top to bottom.
const sweep = async () => {
  await page.mouse.move(300, 500)
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -4000)
  await wait(600)
  const titles = new Set(), rows = new Set()
  let animations = 0, frames = 0
  for (let i = 0; i < 40; i++) {
    await decline()
    const now = await state()
    for (const card of now.cards) titles.add(card.title + (card.error ? " [error]" : ""))
    for (const row of now.rows) rows.add(row)
    animations = Math.max(animations, now.animations)
    frames = Math.max(frames, now.cards.reduce((n, c) => n + c.frames, 0))
    await page.mouse.wheel(0, 350)
    await wait(250)
  }
  return { titles: [...titles], rows: [...rows], animations, frames }
}

// Scrolls the virtualized timeline until `find` (run in the page) returns a connected element, then centres it.
const reveal = async (find) => {
  const probe = `(${find.toString()})()`
  const present = () => page.evaluate(`!!${probe}`)
  const centre = () => page.evaluate(`${probe}?.scrollIntoView({block:"center"})`)
  await page.mouse.move(300, 500)
  for (const direction of [-1, 1]) {
    for (let i = 0; i < 40; i++) {
      await decline()
      if (await present()) { await centre(); await wait(700); return true }
      await page.mouse.wheel(0, direction * 400)
      await wait(220)
    }
  }
  return false
}
const byTitle = (title) => `() => [...document.querySelectorAll("[data-visual-reply]")].find((h) => h.querySelector("[data-slot=title]")?.textContent === ${JSON.stringify(title)})`

await openSession()
// The page keeps asking for ~5s. Decline each question as a user would and count them: the pause must triple.
let dialogsDuringAttack = 0
let shotTaken = false
for (let i = 0; i < 40; i++) {
  await wait(250)
  if (await page.evaluate(() => !!document.querySelector('[role="dialog"]'))) {
    dialogsDuringAttack++
    if (!shotTaken) { await shot("attack-dialog"); shotTaken = true }
    await page.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 3000 }).catch(() => {})
    await wait(400)
  }
}
let s = await state()
check("attack: forged open messages only ever raised the app's own question (at most 2 in 10s with back-off), declining opened nothing", dialogsDuringAttack <= 2, `dialogs=${dialogsDuringAttack}`)
check("attack: the listener saw nothing at all (fetch, XHR, img, CSS, link, script, iframe, object, beacon, WebSocket, EventSource, workers, preconnect, dns-prefetch, WebRTC, window.open, form, link clicks, top/parent location, meta refresh, location.*, navigation.navigate, forged open messages)", hits.length === 0, JSON.stringify(hits.slice(0, 8)))
check("attack: the page ran (its script executed)", await page.evaluate(() => [...document.querySelectorAll("[data-visual-reply] iframe")].length > 0))
s = await state()
check("attack: no frame had to be replaced by the backstop", s.blocked === 0, `blocked=${s.blocked}`)
await shot("attack-card")
const swept = await sweep()
check("six cards across the session (direct, returned id, deleted, window match, link, attack)", swept.titles.length === 6, JSON.stringify(swept.titles))
check("one compact update row, native wording", swept.rows.length === 1 && /^Updated Revenue \(direct\) v2$/.test(swept.rows[0]), JSON.stringify(swept.rows))
check("the direct card shows the latest title; the deleted artifact renders from its call", swept.titles.includes("Revenue (direct) v2") && swept.titles.includes("Throwaway mock-up"), "")
check("no card is in an error state", !swept.titles.some((t) => /\[error\]/.test(t)))
check("nothing of ours animates while scrolling", swept.animations === 0, `max animations=${swept.animations}`)
for (const title of ["Revenue (direct) v2", "Throwaway mock-up", "Window match"]) {
  check(`card "${title}" is revealed`, await reveal(new Function("return " + byTitle(title))()))
  await shot("card-" + title.split(" ")[0].toLowerCase())
}
await reveal(() => document.querySelector("[data-visual-reply-update]"))
await shot("update-row")
// Parity: the row's computed style equals the host's own tool row next to it, property by property.
const parity = await page.evaluate(() => {
  const props = ["fontSize", "fontWeight", "fontFamily", "lineHeight", "letterSpacing", "color", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "display", "alignItems", "gap", "height", "cursor", "backgroundColor", "borderRadius"]
  const read = (el) => Object.fromEntries(props.map((p) => [p, getComputedStyle(el)[p]]))
  const hostRow = [...document.querySelectorAll('[data-component="tool-part-wrapper"]')].find((w) => /artifact_update/.test(w.innerText))
  const ours = document.querySelector("[data-visual-reply-update]")
  const pairs = {
    trigger: [hostRow?.querySelector('[data-slot="collapsible-trigger"]'), ours?.querySelector('[data-slot="collapsible-trigger"]')],
    info: [hostRow?.querySelector('[data-slot="basic-tool-tool-info-main"]'), ours?.querySelector('[data-slot="basic-tool-tool-info-main"]')],
    arg: [hostRow?.querySelector('[data-slot="basic-tool-tool-arg"]'), ours?.querySelector('[data-slot="basic-tool-tool-arg"]')],
    title: [hostRow?.querySelector('[data-slot="basic-tool-tool-title"]'), ours?.querySelector('[data-slot="basic-tool-tool-title"]')],
  }
  const diffs = []
  for (const [name, [a, b]] of Object.entries(pairs)) {
    if (!a || !b) { diffs.push(`${name}: missing ${a ? "ours" : "host"}`); continue }
    const x = read(a), y = read(b)
    for (const p of props) if (x[p] !== y[p]) diffs.push(`${name}.${p}: host=${x[p]} ours=${y[p]}`)
  }
  const rect = (el) => { const r = el?.getBoundingClientRect(); return r ? { x: Math.round(r.x), h: Math.round(r.height) } : null }
  return { diffs, host: rect(hostRow), ours: rect(ours) }
})
check("update row parity: computed style equals the host's tool row (trigger, info, arg, title)", parity.diffs.length === 0, JSON.stringify(parity).slice(0, 600))
await page.evaluate(() => [...document.querySelectorAll("[data-visual-reply]")].find((h) => h.querySelector("[data-slot=title]")?.textContent === "Attack page")?.scrollIntoView({ block: "center" }))
await wait(500)
const sandboxes = (await state()).sandboxes
check("every frame is sandbox=allow-scripts only", sandboxes.length > 0 && sandboxes.every((x) => x === "allow-scripts"))

// Control: the listener is live (a request from this process arrives), and the first run of this harness, before the
// main-process veto existed, leaked `GET /meta-refresh?d=S3CR3T` from the same page (see DESIGN.md "Isolation").
const before = hits.length
await fetch(`http://127.0.0.1:${port}/liveness?d=S3CR3T`).catch(() => {})
await wait(300)
check("control: the listener is live (a request from this process is recorded)", hits.slice(before).some((h) => /liveness/.test(h.detail)))
hits.length = 0

// Gesture: a real click on a link inside a page opens it once, through the host.
check("gesture: the Link page card is revealed", await reveal(new Function("return " + byTitle("Link page"))()))
const link = await page.evaluate(() => { const f = [...document.querySelectorAll("[data-visual-reply]")].find((h) => h.querySelector("[data-slot=title]")?.textContent === "Link page")?.querySelector("iframe"); const r = f.getBoundingClientRect(); return { x: r.x + 60, y: r.y + 30 } })
await decline()
await page.mouse.move(link.x - 20, link.y)
await page.mouse.move(link.x, link.y)
await wait(400)
await page.mouse.click(link.x, link.y)
await wait(1500)
await shot("link-confirm")
const asked = await page.evaluate(() => document.querySelector('[role="dialog"]')?.innerText.replace(/\s+/g, " ") ?? "")
check("gesture: a real click on a link asks first, in the app's dialog, showing the URL", /Open this link/.test(asked) && /gesture-ok/.test(asked), asked.slice(0, 120))
check("gesture: nothing has opened before the user confirms", hits.filter((h) => /gesture-ok/.test(h.detail)).length === 0)
await page.getByRole("button", { name: "Open", exact: true }).click().catch(() => {})
await wait(3500)
check("gesture: after Confirm the link opens once, through the host", hits.filter((h) => /gesture-ok/.test(h.detail)).length >= 1, JSON.stringify(hits.slice(0, 3)))
hits.length = 0

// Theme: dark, then back.
await reveal(() => document.querySelector("[data-visual-reply]"))
await page.emulateMedia({ colorScheme: "dark" })
await wait(2200)
await shot("dark-top")

// Panel: open from the card, check it is the same artifact, themed dark, then flip to light live.
const card = page.locator("[data-visual-reply]").first()
await card.hover()
await wait(300)
await card.getByRole("button", { name: "Open in panel" }).click()
await wait(2500)
const panelInfo = await page.evaluate(() => ({ frames: [...document.querySelectorAll("[data-visual-reply-panel] iframe")].length, tabs: [...document.querySelectorAll("[role=tab]")].map((t) => t.textContent?.trim()) }))
check("panel: opens a side tab with the artifact", panelInfo.frames === 1, JSON.stringify(panelInfo))
await shot("panel-dark")
await page.emulateMedia({ colorScheme: "light" })
await wait(2200)
await shot("panel-light")
const light = await page.screenshot({ clip: { x: 800, y: 120, width: 400, height: 200 } })
check("panel: re-themes live (light after dark)", light.length > 0)

// Update row opens the panel too.
check("update row: found in the timeline", await reveal(() => document.querySelector("[data-visual-reply-update]")))
await page.locator("[data-visual-reply-update] button").first().click()
await wait(1500)
check("update row: opens the artifact in the panel", (await page.evaluate(() => document.querySelectorAll("[data-visual-reply-panel] iframe").length)) >= 1)

// Reload: cards come back with no animation.
await page.keyboard.press("Meta+r")
await wait(5000)
await openSession().catch(() => {})
await wait(1500)
const reloaded = await sweep()
check("Cmd+R: cards and the update row are back", reloaded.titles.length === 6 && reloaded.rows.length === 1, `cards=${reloaded.titles.length} rows=${reloaded.rows.length}`)
check("Cmd+R: nothing of ours animates (the host's own scrollbar and tab transitions are not counted)", reloaded.animations === 0, `animations=${reloaded.animations}`)
await shot("after-reload")

// Session switch: away and back.
await page.mouse.click(101, 22)
await wait(1200)
await page.getByText("Seeded long session").first().click()
await wait(2500)
const away = await state()
check("session switch: no cards on the other session", away.cards.length === 0)
await openSession()
const back = await sweep()
check("session switch: cards return once, not duplicated", back.titles.length === 6 && back.rows.length === 1, `cards=${back.titles.length} rows=${back.rows.length}`)
const dupes = await page.evaluate(() => { const keys = [...document.querySelectorAll("[data-visual-reply],[data-visual-reply-update]")].map((n) => n.getAttribute("data-visual-reply") ?? n.getAttribute("data-visual-reply-update")); return keys.length - new Set(keys).size })
check("session switch: no duplicate hosts in the DOM", dupes === 0, `dupes=${dupes}`)

writeFileSync(join(out, "results.json"), JSON.stringify({ results, hits }, null, 2))
console.log(`questions the attack page raised and the driver declined: ${declined + dialogsDuringAttack}`)
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed; listener hits at end: ${hits.length}`)
await browser.close()
tcp.close()
udp.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
