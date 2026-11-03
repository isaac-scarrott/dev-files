// Drives headless Chromium over CDP against spike/page and measures fill-and-mask. Fake values only.
// The OpenCode in-app browser is Chromium too, and browser.evaluate / browser.screenshot map to Runtime.evaluate /
// Page.captureScreenshot; this harness stands in because the subagent session had no desktop browser attached.
// Usage: node cdp-run.mjs <chromium binary> <page url> <out dir>
import { spawn, execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { fillScript } from "./fill.js"
const [chrome, url, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

// FAKE values. Two sets of equal length per field, for the pixel-equality check.
const SETS = [
  { email: "spike.user@example.test", password: "Fixture Pw-7731!(x)", workspace: "fixture-workspace-9", code: "492039" },
  { email: "qwer.tyuio@zxcvbnm.asdf", password: "Other Val-0000?[y]", workspace: "another-workspace-1", code: "118274" },
]
SETS[1].password = SETS[1].password.padEnd(SETS[0].password.length, "z")

const profile = join(out, "profile")
rmSync(profile, { recursive: true, force: true })
const proc = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--window-size=900,1100", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const wsUrl = await new Promise((resolve, reject) => {
  let buf = ""
  proc.stderr.on("data", (d) => {
    buf += d
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
    if (m) resolve(m[1])
  })
  setTimeout(() => reject(new Error("chromium did not start")), 15000)
})

const browser = new WebSocket(wsUrl)
await new Promise((r) => browser.addEventListener("open", r, { once: true }))
let seq = 0
const waiting = new Map()
const listeners = []
browser.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id)
    waiting.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method) listeners.forEach((fn) => fn(msg))
})
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq
  waiting.set(id, { resolve, reject })
  browser.send(JSON.stringify({ id, method, params, sessionId }))
})

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const page = (method, params) => send(method, params, sessionId)
await page("Page.enable")
await page("Runtime.enable")
await page("Network.enable")
await page("Emulation.setDeviceMetricsOverride", { width: 900, height: 1100, deviceScaleFactor: 1, mobile: false })

const consoleText = []
const posts = []
listeners.push((m) => {
  if (m.sessionId !== sessionId) return
  if (m.method === "Runtime.consoleAPICalled") consoleText.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "))
  if (m.method === "Network.requestWillBeSent" && m.params.request.method === "POST") posts.push(m.params.request.postData ?? "")
})

async function evaluate(expression) {
  const r = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}
async function load() {
  const loaded = new Promise((resolve) => listeners.push((m) => m.sessionId === sessionId && m.method === "Page.loadEventFired" && resolve()))
  await page("Page.navigate", { url })
  await loaded
  for (let i = 0; i < 50 && !(await evaluate("typeof window.__spikeState === 'function'")); i++) await new Promise((r) => setTimeout(r, 50))
}
const frames = () => evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
async function shot(name, clip) {
  // No caret in the image: blur, so a blinking caret cannot make two equal fields differ.
  await evaluate("document.activeElement && document.activeElement.blur()")
  await frames()
  const r = await page("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })
  const file = join(out, `${name}.png`)
  writeFileSync(file, Buffer.from(r.data, "base64"))
  return { file, data: r.data }
}
const rect = (selector) => evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })()`)
function ocr(file) {
  try { return execFileSync("tesseract", ["stdin", "-", "--psm", "6"], { input: readFileSync(file), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) } catch (error) { throw new Error(`tesseract failed: ${String(error.stderr || error.message).slice(0, 300)}`) }
}
// Does OCR text contain the value or a 6+ character run of it (OCR drops or swaps characters)?
function leaks(text, value) {
  const t = text.replace(/\s+/g, "")
  const v = value.replace(/\s+/g, "")
  if (t.includes(v)) return "full"
  for (let i = 0; i + 6 <= v.length; i++) if (t.includes(v.slice(i, i + 6))) return "partial"
  return "none"
}
const FIELDS = [
  { key: "email", spec: { label: "Email or phone", name: "EMAIL" } },
  { key: "password", spec: { selector: "#password", name: "PASSWORD" } },
  { key: "workspace", spec: { label: "workspace", name: "WORKSPACE" } },
  { key: "code", spec: { label: "Enter code", name: "TOTP" } },
]
const ORIGIN = new URL(url).origin
const showPassword = () => evaluate(`[...document.querySelectorAll('input[type=checkbox]')][0].click()`)
const results = {}

// S0 control: fill the same way, without the mask, and reveal the password.
await load()
for (const f of FIELDS) {
  await evaluate(`(() => { const el = ${f.spec.selector ? `document.querySelector(${JSON.stringify(f.spec.selector)})` : `[...document.querySelectorAll('input')].find(e => (e.getAttribute('aria-label')||'').toLowerCase().includes(${JSON.stringify(f.spec.label.toLowerCase())}) || [...(e.labels||[])].some(l => l.textContent.toLowerCase().includes(${JSON.stringify(f.spec.label.toLowerCase())})))`}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(SETS[0][f.key])}); el.dispatchEvent(new Event('input',{bubbles:true})) })()`)
}
await showPassword()
const s0 = await shot("s0-unmasked")
const s0text = ocr(s0.file)
results.s0_control = {
  state: await evaluate("window.__spikeState()"),
  ocrLeaks: Object.fromEntries(FIELDS.map((f) => [f.key, leaks(s0text, SETS[0][f.key])])),
}

// S1: fill-and-mask with each set; then reveal the password and re-render; OCR and pixel-compare.
const crops = []
for (const [index, set] of SETS.entries()) {
  await load()
  const reports = []
  const started = performance.now()
  for (const f of FIELDS) reports.push(await evaluate(fillScript({ ...f.spec, origins: [ORIGIN] }, set[f.key])))
  const fillMs = Math.round(performance.now() - started)
  await frames()
  await showPassword() // Show password: type=text now
  await frames()
  const after = await evaluate(`({ masked: [...document.querySelectorAll('[data-blindfold-masked]')].map(e => e.id || e.tagName.toLowerCase()), passwordType: document.querySelector('#password').type, security: getComputedStyle(document.querySelector('#password')).webkitTextSecurity, echoSecurity: getComputedStyle(document.querySelector('#echo')).webkitTextSecurity })`)
  const full = await shot(`s1-masked-set${index}`)
  const text = ocr(full.file)
  const fieldCrops = {}
  for (const sel of ["#identifierId", "#password", "#workspace", "#totp", "#echo"]) fieldCrops[sel] = (await shot(`s1-crop${index}-${sel.slice(1)}`, await rect(sel))).data
  crops.push(fieldCrops)
  results[`s1_set${index}`] = {
    reports,
    fillMs,
    state: await evaluate("window.__spikeState()"),
    after,
    ocrLeaks: Object.fromEntries(FIELDS.map((f) => [f.key, leaks(text, set[f.key])])),
    ocrSample: text.split("\n").filter(Boolean).slice(0, 12),
  }
}
results.s1_pixel_identical_across_values = Object.fromEntries(Object.keys(crops[0]).map((sel) => [sel, crops[0][sel] === crops[1][sel]]))

// S2: origin binding. An item for accounts.google.com must not fill this page.
await load()
results.s2_origin_mismatch = {
  report: await evaluate(fillScript({ label: "Email or phone", name: "EMAIL", origins: ["https://accounts.google.com"] }, SETS[0].email)),
  state: await evaluate("window.__spikeState()"),
}

// S3: what the page itself leaks after a masked fill and submit: console and the POST body.
await load()
for (const f of FIELDS) await evaluate(fillScript({ ...f.spec, origins: [ORIGIN] }, SETS[0][f.key]))
consoleText.length = 0
posts.length = 0
await evaluate("document.querySelector('button[type=submit]').click()")
for (let i = 0; i < 40 && posts.length === 0; i++) await new Promise((r) => setTimeout(r, 50))
await new Promise((r) => setTimeout(r, 200))
// Run what the model would get through blindfold's own Redactor (read-only import from the fork's build).
let redaction = "skipped: set BLINDFOLD_DIST"
if (process.env.BLINDFOLD_DIST) {
  const { Redactor } = await import(join(process.env.BLINDFOLD_DIST, "redact.js"))
  const redactor = new Redactor()
  for (const f of FIELDS) redactor.set(f.spec.name, SETS[0][f.key])
  const body = redactor.text(posts[0] ?? "")
  const log = redactor.text(consoleText.join("\n"))
  redaction = {
    consoleStillHasValue: FIELDS.some((f) => log.includes(SETS[0][f.key])),
    postBodyStillHasPlainValue: FIELDS.filter((f) => body.includes(SETS[0][f.key])).map((f) => f.key),
    postBodyStillHasFormEncodedValue: FIELDS.filter((f) => body.includes(new URLSearchParams({ x: SETS[0][f.key] }).toString().slice(2))).map((f) => f.key),
    postBodyRedactedShape: body.replace(/=[^&]*/g, (m) => (m.includes("REDACTED") ? m : "=<not redacted>")),
  }
}
results.s3_page_leaks = { consoleLines: consoleText.length, postCaptured: posts.length, redaction }

writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
browser.close()
proc.kill()
rmSync(profile, { recursive: true, force: true })
