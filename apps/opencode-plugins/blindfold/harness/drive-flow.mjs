// Drives the private harness through flow approval: one card for a whole sign-in on a multi-step page (email, password,
// code), then the later steps with no card; what still asks (an unrelated field, a second tab, an expired approval, a
// code after Always allow); Always allow on a sign-in and its rule on the settings page; Deny; hot reload.
// Fake CLIs and fake values only. Run through harness/run-flow.sh.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const CDP = process.env.BF_CDP ?? "http://127.0.0.1:9611"
const ROOT = process.env.BF_ROOT ?? "/private/tmp/oc-harness-flow"
const CODE = process.env.BF_CODE_FILE ?? "/private/tmp/bf-flow-run/code.js"
const REQ = process.env.BF_REQ_LOG ?? "/private/tmp/bf-flow-run/req.json"
const AUDIT = process.env.BF_AUDIT ?? "/private/tmp/bf-flow-run/audit.jsonl"
const SHOTS = process.argv[2] ?? "/private/tmp/bf-flow-run/shots"
mkdirSync(SHOTS, { recursive: true })
const { chromium } = createRequire(`${process.env.BF_PW ?? "/private/tmp/bf-pw"}/`)("playwright-core")

const ORIGIN = "http://127.0.0.1:47341"
const ITEM = "Local sign-in (flow test)"
const ALL = ["fixture-flow-pw", "grace.fixture@example.test", "ops_fixture_service_token"]

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
const hosts = () => page.locator("[data-blindfold-request]")
const rows = () => page.locator("[data-blindfold-row]")
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const dom = () => page.evaluate(() => document.documentElement.outerHTML)
const button = (name) => page.locator("[data-blindfold-request] [data-slot=actions] button", { hasText: new RegExp(`^\\s*${name}\\s*$`) })
const leaks = (text) => ALL.filter((value) => text.includes(value))
const sleep = (ms) => page.waitForTimeout(ms)
const audit = () => (existsSync(AUDIT) ? readFileSync(AUDIT, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [])
const forOrigin = () => audit().filter((line) => line.origin === ORIGIN)

let sessions = 0
async function ask(code, message = "go") {
  writeFileSync(CODE, code)
  if (existsSync(REQ)) rmSync(REQ)
  await page.getByRole("button", { name: "New session" }).first().click()
  await sleep(600)
  await page.locator('[contenteditable="true"], textarea').first().click()
  await page.keyboard.type(`${message} ${++sessions}`)
  await page.keyboard.press("Enter")
}
async function followUp(timeout = 120000) {
  for (let waited = 0; waited < timeout; waited += 250) {
    if (existsSync(REQ)) return readFileSync(REQ, "utf8")
    await sleep(250)
  }
  return ""
}
const toolContent = (model) => {
  try {
    return String(JSON.parse(model).messages.filter((m) => m.role === "tool").at(-1)?.content)
  } catch {
    return model
  }
}
/** Waits until n blindfold hosts exist in the timeline and the last one is an open card. */
async function openCard(n, timeout = 90000) {
  await page.waitForFunction((count) => {
    const all = [...document.querySelectorAll("[data-blindfold-request]")]
    return all.length === count && !!all[count - 1].querySelector("[data-slot=card]")
  }, n, { timeout })
  await sleep(500)
}
const info = () =>
  page.evaluate(() => {
    const host = [...document.querySelectorAll("[data-blindfold-request]")].at(-1)
    return {
      title: host.querySelector("[data-slot=title]")?.textContent,
      label: host.querySelector("[data-slot=label]")?.textContent,
      source: host.querySelector("[data-slot=source-text]")?.textContent,
      note: host.querySelector("[data-slot=note]")?.textContent,
      buttons: [...host.querySelectorAll("[data-slot=actions] button")].map((b) => [b.textContent.trim(), b.disabled]),
      toggle: host.querySelector("[data-slot=flow-toggle]")?.textContent.trim(),
      inputs: host.querySelectorAll("input").length,
      inline: !!host.closest('[data-slot="session-timeline-scroll"]'),
      modal: !!document.querySelector("[role=dialog][aria-modal=true]"),
      toasts: document.querySelectorAll(".toast-v2").length,
    }
  })
const scheme = async (name, label) => {
  for (const s of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: s })
    await sleep(600)
    await shot(`${name}-${s}`)
  }
  void label
}

// ---- scripts the stub model runs (Code Mode) ----
const PRELUDE = `const ORIGIN = ${JSON.stringify(ORIGIN)}
const wait = async (tabID, id) => {
  for (let i = 0; i < 40; i++) {
    const r = await tools.browser.evaluate({ tabID, script: "new Promise((done) => setTimeout(() => done(!!document.getElementById(" + JSON.stringify(id) + ")), 250))" })
    if (r.value === true) return true
  }
  return false
}
const step = async (tabID, name, id, kind) => {
  await wait(tabID, id)
  const f = await tools.blindfold.fill({ tabID, origin: ORIGIN, fields: [{ name, ...(kind ? { kind } : {}) }], reason: "Sign in to the flow test page" })
  const r = await tools.browser.evaluate({ tabID, script: f.script })
  await tools.browser.evaluate({ tabID, script: "document.getElementById('next') && document.getElementById('next').click()" })
  return r.value && r.value.ok
}
const open = async () => (await tools.browser.tabs.open({ url: ORIGIN + "/signin", focus: false })).id
`
const full = (tail = "") => `${PRELUDE}const tab = await open()
const out = []
out.push(await step(tab, "EMAIL", "identifierId"))
out.push(await step(tab, "PASSWORD", "password"))
out.push(await step(tab, "OTP", "totp", "otp"))
const state = (await tools.browser.evaluate({ tabID: tab, script: "JSON.stringify(window.__flow())" })).value
${tail}return JSON.stringify({ out, state${tail ? ", extra" : ""} })`
const withFourth = full(`let extra
try {
  await tools.blindfold.fill({ tabID: tab, origin: ORIGIN, fields: [{ name: "RECOVERY" }], reason: "Recovery answer" })
  extra = "filled"
} catch (e) {
  extra = "refused: " + String(e.message).slice(0, 80)
}
`)
const twoTabs = `${PRELUDE}const a = await open()
const first = await step(a, "EMAIL", "identifierId")
const b = await open()
let second
try {
  second = await step(b, "PASSWORD", "password")
} catch (e) {
  second = "refused: " + String(e.message).slice(0, 60)
}
const third = await step(a, "PASSWORD", "password")
return JSON.stringify({ first, second, third })`
const expiring = `${PRELUDE}const a = await open()
const first = await step(a, "EMAIL", "identifierId")
for (let i = 0; i < 2; i++) await tools.browser.evaluate({ tabID: a, script: "new Promise((done) => setTimeout(done, 17000))" })
let second
try {
  second = await step(a, "PASSWORD", "password")
} catch (e) {
  second = "refused: " + String(e.message).slice(0, 60)
}
return JSON.stringify({ first, second })`
const emailOnly = `${PRELUDE}const a = await open()
let r
try {
  r = await step(a, "EMAIL", "identifierId")
} catch (e) {
  r = "refused: " + String(e.message).slice(0, 80)
}
return JSON.stringify({ r })`

// ---- 0. Warm-up ----
await ask('return "warm"')
await followUp()
await sleep(3000)

// ---- 1. One card for the whole sign-in ----
await ask(withFourth)
await card().waitFor({ timeout: 90000 })
await sleep(1000)
await page.locator("[data-blindfold-request] [data-slot=unlock] input").fill("ops_fixture_service_token")
await page.locator("[data-blindfold-request] [data-slot=unlock] input").press("Enter")
await page.waitForFunction(() => !document.querySelector("[data-blindfold-request] [data-slot=unlock]"), null, { timeout: 30000 })
await sleep(800)
{
  const c = await info()
  check("the first field opens ONE card titled for the sign-in, inline, not a dialog", c.inline && !c.modal && c.title === `Sign in to ${ORIGIN}`, c.title)
  check("the row names account, item and the parts: Personal › item · email, password, one-time code", c.source === `Personal (1Password) › ${ITEM} · email, password, one-time code`, c.source)
  check("Deny, Always allow and Allow, all enabled, and a small 'Only this field' beside the note", JSON.stringify(c.buttons) === JSON.stringify([["Deny", false], ["Always allow", false], ["Allow", false]]) && c.toggle === "Only this field", JSON.stringify(c.buttons) + " " + c.toggle)
  check("the note says once each, within the time, and that Always allow still asks for the code", /filled once, within 0\.5 minutes/.test(c.note) && /Always allow still asks for the one-time code/.test(c.note), c.note)
  check("no input in the card, no toast", c.inputs === 0 && c.toasts === 0)
}
await scheme("01-flow-card")
await page.emulateMedia({ colorScheme: "dark" })
await button("Allow").click()
await rows().first().waitFor({ timeout: 15000 })
await openCard(2, 120000)
{
  const lines = forOrigin().filter((line) => line.outcome !== "error")
  const grants = new Set(lines.map((line) => line.grant))
  check("Allow: PASSWORD and the one-time code were served with no further card (the next card is the unrelated field)", JSON.stringify(lines.map((line) => [line.name, line.outcome])) === JSON.stringify([["EMAIL", "allowed"], ["PASSWORD", "flow"], ["OTP", "flow"]]), JSON.stringify(lines.map((line) => [line.name, line.outcome])))
  check("the audit names the approval on every line of the sign-in", grants.size === 1 && !!lines[0].grant, [...grants].join())
  const row = await rows().first().textContent()
  check("the answered row says: Signed in with Personal (1Password): 3 fields; no toast", /Signed in\s*with Personal \(1Password\): 3 fields/.test(row) && (await info()).toasts === 0, row)
  const typed = await info()
  check("the fourth, unrelated field gets its own card (typed input, Cancel and Submit)", typed.inputs === 1 && typed.title !== undefined && /RECOVERY|Recovery/i.test(typed.title ?? "") && typed.buttons.map(([name]) => name).join() === "Cancel,Submit", JSON.stringify(typed))
  await shot("02-answered-row-and-fourth-card-dark")
  await page.emulateMedia({ colorScheme: "light" })
  await sleep(600)
  await shot("02-answered-row-and-fourth-card-light")
}
await button("Cancel").click()
{
  const model = await followUp(60000)
  const content = toolContent(model)
  check("the three fills reported ok to the agent, which saw no value; the fourth was refused", /\\"out\\":\[true,true,true\]/.test(content) || /"out":\[true,true,true\]/.test(content.replaceAll('\\"', '"')), content.slice(0, 200))
  check("and the page reached 'Signed in'; the model's request holds no value", /done\\?":true/.test(content) && /refused/.test(content) && leaks(model).length === 0, leaks(model).join())
  check("nothing in the DOM holds a value", leaks(await dom()).length === 0, leaks(await dom()).join())
}

// ---- 2. A second tab asks ----
await ask(twoTabs)
await openCard(1)
await button("Allow").click()
await rows().first().waitFor({ timeout: 15000 })
await openCard(2, 90000)
{
  const c = await info()
  check("a second tab in the same session gets its own card (the approval belongs to the first tab)", /Sign in to|Fill PASSWORD/.test(c.title ?? ""), c.title)
  await shot("03-second-tab-card")
}
await button("Deny").click()
{
  const content = toolContent(await followUp(90000)).replaceAll('\\"', '"')
  check("denying the second tab's card refuses it, and the first tab's password still fills silently", /"second":"refused/.test(content) && /"third":true/.test(content), content.slice(0, 200))
  check("still exactly two cards in that session (the first tab's password asked nothing)", (await hosts().count()) === 2, String(await hosts().count()))
}

// ---- 3. An approval expires ----
await ask(expiring)
await openCard(1)
await button("Allow").click()
await rows().first().waitFor({ timeout: 15000 })
await openCard(2, 120000)
{
  const c = await info()
  check("after the time is up (30 s here) the next field asks again", /Sign in to|Fill PASSWORD/.test(c.title ?? ""), c.title)
}
await button("Deny").click()
await followUp(60000)

// ---- 4. Always allow on the sign-in: one rule, silent username and password, the code still asks ----
await ask(full())
await openCard(1)
await button("Always allow").click()
await rows().first().waitFor({ timeout: 15000 })
await openCard(2, 120000)
{
  const c = await info()
  const row = await rows().first().textContent()
  check("Always allow: the row reads 'Sign-in always allowed'", /Sign-in always allowed\s*127\.0\.0\.1:47341 with|Sign-in always allowed\s*http:\/\/127\.0\.0\.1:47341 with/.test(row) && row.includes(ITEM), row)
  check("then only the one-time code asks, with Deny and Allow, no Always allow", c.buttons.map(([name]) => name).join() === "Deny,Allow", JSON.stringify(c.buttons))
  await shot("04-code-card")
}
await button("Allow").click()
{
  const content = toolContent(await followUp(90000)).replaceAll('\\"', '"')
  check("the login completed (email, password, code ok; page at the end)", /"out":\[true,true,true\]/.test(content) && /"done":true/.test(content), content.slice(0, 160))
  const lines = forOrigin().slice(-3).map((line) => [line.name, line.outcome])
  check("audit: EMAIL always, PASSWORD rule, OTP allowed", JSON.stringify(lines) === JSON.stringify([["EMAIL", "always"], ["PASSWORD", "rule"], ["OTP", "allowed"]]), JSON.stringify(lines))
}

// ---- 5. The next login is silent except for the code ----
await ask(full())
await openCard(1)
{
  const c = await info()
  check("a full login under the rule asks only for the code", /OTP/.test(c.title ?? "") && c.buttons.map(([name]) => name).join() === "Deny,Allow", c.title + " " + JSON.stringify(c.buttons))
}
await button("Allow").click()
{
  const content = toolContent(await followUp(90000)).replaceAll('\\"', '"')
  check("and it signs in", /"out":\[true,true,true\]/.test(content) && /"done":true/.test(content), content.slice(0, 160))
  check("exactly one card was shown", (await hosts().count()) === 1)
}

// ---- 6. The rule is one row on the rules page, and Revoke removes it ----
await page.keyboard.press("Meta+,")
await sleep(1500)
await page.getByText("Blindfold", { exact: true }).first().click({ timeout: 10000 }).catch(() => undefined)
await sleep(1200)
{
  const text = await page.locator("[data-blindfold-page]").innerText().catch(() => "")
  const flowRows = text.split("\n").filter((line) => line.startsWith("Sign in to "))
  check("one row 'Sign in to <site> with <item>' with its source and parts", flowRows.length === 1 && flowRows[0] === `Sign in to ${ORIGIN} with ${ITEM}` && /From Personal \(1Password\) · email, password · fill only/.test(text), flowRows.join("|") + " :: " + text.replace(/\n+/g, " | ").slice(0, 300))
  for (const s of ["dark", "light"]) {
    await page.emulateMedia({ colorScheme: s })
    await sleep(500)
    await shot(`05-rules-page-${s}`)
  }
  const revoke = page.locator("[data-blindfold-page] [data-action^=blindfold-revoke-]")
  const before = await revoke.count()
  await revoke.first().click()
  await sleep(900)
  const after = await page.locator("[data-blindfold-page]").innerText()
  check("Revoke removes the sign-in rule", (await revoke.count()) === before - 1 && !after.includes(`Sign in to ${ORIGIN} with`), `${before} -> ${await revoke.count()}`)
}
await page.locator("[data-titlebar-tab]").first().click()
await sleep(500)

// ---- 7. After the revoke the first field asks again; Deny ----
await ask(emailOnly)
await openCard(1)
await button("Deny").click()
{
  const content = toolContent(await followUp(60000))
  const last = forOrigin().at(-1)
  check("Deny: the agent is told, nothing is created", /denied/i.test(content) && last.outcome === "denied" && leaks(content).length === 0, content.slice(0, 120))
  check("the answered row reads 'Secrets declined'", /Secrets declined/.test(await rows().first().textContent()))
}

// ---- 8. Hot reload with a card open ----
await ask(emailOnly)
await openCard(1)
const bundle = new URL("../dist/gui-experimental.cjs", import.meta.url).pathname
const original = readFileSync(bundle, "utf8")
const styles = () => page.evaluate(() => [...document.querySelectorAll("style[data-plugin]")].filter((el) => el.textContent.includes("data-blindfold-card")).length)
try {
  const before = await styles()
  writeFileSync(bundle, `${original}\n/* hot reload ${Date.now()} */\n`)
  await sleep(7000)
  await card().waitFor({ timeout: 20000 })
  const c = await info()
  check("a rebuilt bundle reloads in place: one style, one card back, still the sign-in", before === 1 && (await styles()) === 1 && (await hosts().count()) === 1 && c.title === `Sign in to ${ORIGIN}`, JSON.stringify({ before, after: await styles(), title: c.title }))
  await button("Deny").click({ timeout: 15000 })
  await rows().first().waitFor({ timeout: 10000 })
  check("and it still answers after the reload", /Secrets declined/.test(await rows().first().textContent()))
} finally {
  writeFileSync(bundle, original)
}
await sleep(4000)

// ---- 9. Nothing durable holds a value ----
{
  const listed = JSON.parse(await api("/api/session"))
  const items = Array.isArray(listed) ? listed : listed.data
  const messages = (await Promise.all(items.map((s) => api(`/api/session/${s.id}/message`)))).join("\n")
  check("no stored message holds a value or a secret", leaks(messages).length === 0, leaks(messages).join())
  const log = readFileSync(`${ROOT}/data/opencode/log/opencode.log`, "utf8")
  check("the service log holds no value or secret", leaks(log).length === 0, leaks(log).join())
  check("the audit file holds no value or secret", leaks(readFileSync(AUDIT, "utf8")).length === 0)
}

console.log(`\n${results.filter((r) => r.ok).length} PASS, ${results.filter((r) => !r.ok).length} FAIL`)
await browser.close()
process.exit(results.some((r) => !r.ok) ? 1 : 0)
