// Drives the private harness (desktop-harness.sh with this plugin and a stub model) through the request card: single and
// multi, masking and reveal, validation, Enter and Escape, redaction in what the model and the thread see, and the DOM
// leaving no value behind. Fake secrets only. See README "Harness" for how to start it.
//
//   BF_CDP=http://127.0.0.1:9361 BF_ROOT=/private/tmp/oc-harness-... BF_CODE_FILE=/private/tmp/bf-run/code.js \
//   BF_REQ_LOG=/private/tmp/bf-run/req.json BF_PW=/private/tmp/bf-pw node drive.mjs [shots-dir]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"

const CDP = process.env.BF_CDP ?? "http://127.0.0.1:9361"
const ROOT = process.env.BF_ROOT
const CODE = process.env.BF_CODE_FILE
const REQ = process.env.BF_REQ_LOG
const SHOTS = process.argv[2] ?? "/private/tmp/bf-run/shots"
mkdirSync(SHOTS, { recursive: true })
const { chromium } = createRequire(`${process.env.BF_PW ?? "/private/tmp/bf-pw"}/`)("playwright-core")

const EMAIL = "ada.fake@example.test"
const PASSWORD = "fake-Passw0rd-12345"
const TOKEN = "tok_fake_9f8e7d6c5b4a"

const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}

const browser = await chromium.connectOverCDP(CDP)
const page = browser.contexts()[0].pages()[0]
await page.setViewportSize({ width: 1400, height: 900 })

const service = JSON.parse(readFileSync(`${ROOT}/state/opencode/service.json`, "utf8"))
const api = async (path) => (await fetch(`${service.url}${path}`, { headers: { authorization: "Basic " + Buffer.from(`opencode:${service.password}`).toString("base64") } })).text()

const card = () => page.locator("[data-blindfold-request] [data-slot=card]")
const row = () => page.locator("[data-blindfold-row]")
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const dom = () => page.evaluate(() => document.documentElement.outerHTML)

async function ask(code, message) {
  writeFileSync(CODE, code)
  await page.getByRole("button", { name: "New session" }).first().click()
  await page.waitForTimeout(600)
  const editor = page.locator('[contenteditable="true"], textarea').first()
  await editor.click()
  await page.keyboard.type(message)
  await page.keyboard.press("Enter")
}

const multi = (extra = "", replace = true) => `const v = await tools.blindfold.get({ fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason: "Log in to the demo portal to fetch the monthly report"${replace ? ", replace: true" : ""} });
return "email=" + v.EMAIL + " password=" + v.PASSWORD + " keys=" + Object.keys(v).join(",") ${extra}`

// 1. Multi request: inline, anchored, masked, composer usable.
await ask(multi(), "multi request")
await card().waitFor({ timeout: 20000 })
await page.waitForTimeout(1500)
const info = await page.evaluate(() => {
  const host = document.querySelector("[data-blindfold-request]")
  const rect = host.getBoundingClientRect()
  const timeline = document.querySelector('[data-slot="session-timeline-scroll"]').getBoundingClientRect()
  const fields = [...host.querySelectorAll("[data-field]")].map((f) => ({ name: f.dataset.field, label: f.querySelector("[data-slot=label]").textContent, type: f.querySelector("input").type, eye: !!f.querySelector("[data-slot=reveal] button") }))
  return { anchor: host.dataset.anchor, inTimeline: !!host.closest('[data-slot="session-timeline-scroll"]'), width: rect.width, timelineWidth: timeline.width, fields, active: document.activeElement?.closest("[data-field]")?.dataset.field, fixed: getComputedStyle(host).position, modal: !!document.querySelector("[role=dialog][aria-modal=true]"), reason: host.querySelector("[data-slot=reason]").textContent, title: host.querySelector("[data-slot=title]").textContent }
})
check("card is inline in the timeline, not a dialog", info.inTimeline && !info.modal && info.fixed === "static", `anchor=${info.anchor} width=${Math.round(info.width)}/${Math.round(info.timelineWidth)}`)
check("anchored to the tool call (group or row), not the fallback", info.anchor === "group" || info.anchor === "row", info.anchor)
check("two fields: Email unmasked, Password masked with eye", JSON.stringify(info.fields) === JSON.stringify([{ name: "EMAIL", label: "Email", type: "text", eye: false }, { name: "PASSWORD", label: "Password", type: "password", eye: true }]), JSON.stringify(info.fields))
check("focus is in the first empty field", info.active === "EMAIL", String(info.active))
check("label and reason are shown", info.reason.includes("demo portal") && info.title.includes("Email and Password"), info.title)
await shot("01-multi-open")

// composer stays usable while the card is open
const composer = page.locator('[contenteditable="true"], textarea').last()
await composer.click()
await page.keyboard.type("still typing here")
const composerText = await composer.evaluate((el) => el.value ?? el.textContent)
check("composer is usable while the card is open", composerText.includes("still typing here"), composerText.slice(0, 30))
check("composer text did not leak into the card", (await page.locator("[data-field] input").evaluateAll((els) => els.map((e) => e.value))).every((v) => v === ""))
await page.keyboard.press("Control+a")
await page.keyboard.press("Backspace")

// masked until revealed
await page.locator('[data-field="EMAIL"] input').fill("not-an-email")
await page.locator('[data-field="PASSWORD"] input').fill(PASSWORD)
await page.waitForTimeout(150)
const typed = await dom()
check("no value is in the DOM markup while typing", !typed.includes(PASSWORD) && !typed.includes("not-an-email"))
const invalid = await page.evaluate(() => ({ hint: document.querySelector('[data-field="EMAIL"] [data-slot=hint]').textContent, level: document.querySelector('[data-field="EMAIL"] [data-slot=hint]').dataset.level, invalid: document.querySelector('[data-field="EMAIL"] input').getAttribute("aria-invalid"), disabled: [...document.querySelectorAll("[data-blindfold-request] button")].find((b) => b.textContent.trim() === "Submit")?.disabled }))
check("clearly invalid email blocks Submit and warns inline", invalid.level === "invalid" && invalid.disabled === true && /email/i.test(invalid.hint), JSON.stringify(invalid))
check("the warning does not echo the value", !invalid.hint.includes("not-an-email"))
await shot("02-invalid")
await page.locator('[data-field="PASSWORD"] [data-slot=reveal] button').click()
const revealed = await page.evaluate(() => ({ type: document.querySelector('[data-field="PASSWORD"] input').type, pressed: document.querySelector('[data-field="PASSWORD"] [data-slot=reveal] button').getAttribute("aria-pressed"), label: document.querySelector('[data-field="PASSWORD"] [data-slot=reveal] button').getAttribute("aria-label") }))
check("eye reveals the password and reports pressed", revealed.type === "text" && revealed.pressed === "true" && /Hide/.test(revealed.label), JSON.stringify(revealed))
await shot("03-revealed")
await page.locator('[data-field="PASSWORD"] [data-slot=reveal] button').click()
check("eye hides it again", (await page.locator('[data-field="PASSWORD"] input').getAttribute("type")) === "password")
await page.locator('[data-field="EMAIL"] input').fill(EMAIL)
await page.locator('[data-field="PASSWORD"] input').focus()
await page.keyboard.press("Enter")
await row().first().waitFor({ timeout: 10000 })
await page.waitForTimeout(800)
const after = await page.evaluate(() => ({ rowText: document.querySelector("[data-blindfold-row]").textContent, inputs: document.querySelectorAll("[data-blindfold-request] input").length, toasts: document.querySelectorAll(".toast-v2").length }))
check("Enter submits; the card collapses to a one-line row naming the fields", /Secrets provided/.test(after.rowText) && /EMAIL and PASSWORD/.test(after.rowText) && after.inputs === 0, after.rowText)
check("no success toast", after.toasts === 0, String(after.toasts))
const done = await dom()
check("no value in the DOM after submit", !done.includes(PASSWORD) && !done.includes(EMAIL) && !done.includes("not-an-email"))
await shot("04-provided")
await page.waitForTimeout(4000)
const model = readFileSync(REQ, "utf8")
check("the model request carries no value", !model.includes(PASSWORD) && !model.includes(EMAIL))
check("redaction: the model saw both fields redacted", model.includes("[REDACTED:PASSWORD]") && model.includes("[REDACTED:EMAIL]"))
const sessions = JSON.parse(await api("/api/session"))
const list = Array.isArray(sessions) ? sessions : sessions.data
const all = (await Promise.all(list.map((s) => api(`/api/session/${s.id}/message`)))).join("\n")
check("no stored message holds a value", !all.includes(PASSWORD) && !all.includes(EMAIL) && all.includes("[REDACTED:PASSWORD]"))
check("the service log holds no value", !readFileSync(`${ROOT}/data/opencode/log/opencode.log`, "utf8").includes(PASSWORD))

// 2. Single name, still a string, one masked field.
await ask(`const t = await tools.blindfold.get({ name: "API_TOKEN", reason: "Call the demo API", replace: true });
return "type=" + typeof t + " token=" + t`, "single request")
await card().waitFor({ timeout: 20000 })
const single = await page.evaluate(() => [...document.querySelectorAll("[data-blindfold-request] [data-field]")].map((f) => [f.dataset.field, f.querySelector("input").type]))
check("single-name call shows one masked field", JSON.stringify(single) === JSON.stringify([["API_TOKEN", "password"]]), JSON.stringify(single))
await page.locator("[data-field] input").fill(TOKEN)
await page.getByRole("button", { name: "Submit" }).click()
await row().first().waitFor({ timeout: 10000 })
await page.waitForTimeout(3000)
const model2 = readFileSync(REQ, "utf8")
const seen = JSON.parse(model2).messages.filter((m) => m.role === "tool").map((m) => m.content).join(" | ")
check("single call returns a string to the code (redacted in what the model sees)", model2.includes("type=string token=[REDACTED:API_TOKEN]") && !model2.includes(TOKEN), seen.slice(0, 120))

// 3. Escape declines and does not stop the session.
await ask(multi("", true), "escape request")
await card().waitFor({ timeout: 20000 })
await page.locator('[data-field="EMAIL"] input').fill("partial@example.test")
await page.keyboard.press("Escape")
await row().first().waitFor({ timeout: 10000 })
const declined = await row().first().textContent()
check("Escape declines: muted row, no values", /Secrets declined/.test(declined) && !(await dom()).includes("partial@example.test"), declined)
await page.waitForTimeout(3000)
const timelineText = await page.locator('[data-slot="session-timeline-scroll"]').innerText()
check("the session carried on after Escape (it was not stopped)", /Done\./.test(timelineText))
await shot("05-declined")

// 4. Cancel button.
await ask(multi("", true), "cancel request")
await card().waitFor({ timeout: 20000 })
await page.getByRole("button", { name: "Cancel" }).click()
await row().first().waitFor({ timeout: 10000 })
check("Cancel declines", /Secrets declined/.test(await row().first().textContent()))

console.log(`\n${results.filter((r) => r.ok).length} PASS, ${results.filter((r) => !r.ok).length} FAIL`)
await browser.close()
process.exit(results.some((r) => !r.ok) ? 1 : 0)
