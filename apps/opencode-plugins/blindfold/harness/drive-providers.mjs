// Drives the private harness through the provider layer: the three-choice card, account choice, the unlock card, Always
// allow (then silent use), Deny, revoking a rule, auto-lock, redaction of provider values, and nothing left in the DOM.
// Fake CLIs and fake values only. Setup, in order (see README "Harness"):
//   harness/setup-fixtures.sh                              # fixture op, bw, security with an absolute node, state reset
//   node harness/stub-model.mjs                            # BF_STUB_PORT BF_CODE_FILE BF_STUB_LOG
//   desktop-harness.sh start <blindfold-providers> <blindfold>   # then node harness/harness-config.mjs <root> 0.25
//   node harness/drive-providers.mjs [shots-dir]
//
//   BF_CDP=http://127.0.0.1:9377 BF_ROOT=/private/tmp/oc-harness-prov BF_CODE_FILE=... BF_REQ_LOG=... BF_AUDIT=... BF_PW=/private/tmp/bf-pw
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const CDP = process.env.BF_CDP ?? "http://127.0.0.1:9377"
const ROOT = process.env.BF_ROOT ?? "/private/tmp/oc-harness-prov"
const CODE = process.env.BF_CODE_FILE ?? "/private/tmp/bf-run/code.js"
const REQ = process.env.BF_REQ_LOG ?? "/private/tmp/bf-run/req.json"
const AUDIT = process.env.BF_AUDIT ?? "/private/tmp/bf-run/audit.jsonl"
const SHOTS = process.argv[2] ?? "/private/tmp/bf-run/shots-prov"
mkdirSync(SHOTS, { recursive: true })
const { chromium } = createRequire(`${process.env.BF_PW ?? "/private/tmp/bf-pw"}/`)("playwright-core")

// The fake values the fixtures hold and the user would type. None of them may appear anywhere durable.
const VALUES = { googlePw: "fixture-google-pw", googleMail: "personal.fixture@example.test", workPw: "fixture-gwork-pw", workMail: "work.fixture@example.test", holibobPw: "fixture-holibob-pw", ghPw: "fixture-gh-pw" }
const SECRETS = ["ops_fixture_service_token", "fixture-bw-master", "fixture-client-secret"]
const ALL = [...Object.values(VALUES), ...SECRETS, "fixture-local-pw", "ada.fixture@example.test"]

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
const answered = () => page.locator("[data-blindfold-row]")
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const dom = () => page.evaluate(() => document.documentElement.outerHTML)
const button = (name) => page.locator("[data-blindfold-request] [data-slot=actions] button", { hasText: new RegExp(`^\\s*${name}\\s*$`) })
const leaks = (text) => ALL.filter((value) => text.includes(value))
const sleep = (ms) => page.waitForTimeout(ms)

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
/** The model's follow-up request: what it saw of the tool result. */
async function followUp(timeout = 45000) {
  for (let waited = 0; waited < timeout; waited += 250) {
    if (existsSync(REQ)) return readFileSync(REQ, "utf8")
    await sleep(250)
  }
  return ""
}
const login = (origin, names = '[{ name: "EMAIL" }, { name: "PASSWORD" }]', extra = "") => `const v = await tools.blindfold.get({ fields: ${names}, origin: ${JSON.stringify(origin)}, reason: "Sign in to ${origin}"${extra} });
return Object.entries(v).map(([k, x]) => k + "=" + x).join(" ")`

const audit = () => (existsSync(AUDIT) ? readFileSync(AUDIT, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [])

// ---- 0. Warm-up: the first Code Mode call makes the host append "the tool catalog has changed" after it; let that pass. ----
await ask('return "warm"')
await followUp()
await sleep(3000)

// ---- 1. Locked accounts: choose, wrong token, right token, Allow once ----
await ask(login("https://accounts.google.com"))
await card().waitFor({ timeout: 40000 })
await sleep(1200)
{
  const info = await page.evaluate(() => {
    const host = document.querySelector("[data-blindfold-request]")
    return {
      title: host.querySelector("[data-slot=title]").textContent,
      choices: [...host.querySelectorAll("[data-slot=choice]")].map((el) => [el.textContent, el.getAttribute("aria-checked")]),
      groups: host.querySelectorAll("[role=radiogroup]").length,
      allow: [...host.querySelectorAll("[data-slot=actions] button")].map((b) => [b.textContent.trim(), b.disabled]),
      inline: !!host.closest('[data-slot="session-timeline-scroll"]'),
      modal: !!document.querySelector("[role=dialog][aria-modal=true]"),
    }
  })
  check("card is inline, not a dialog, titled with the site", info.inline && !info.modal && /accounts\.google\.com\?$/.test(info.title), info.title)
  check("both accounts are offered, locked, as one choice for the whole login", info.groups === 1 && info.choices.length === 2 && info.choices.every(([text, checked]) => /locked/.test(text) && checked === "false"), JSON.stringify(info.choices))
  check("Deny, Always allow and Allow are the three buttons; accepting is blocked", JSON.stringify(info.allow) === JSON.stringify([["Deny", false], ["Always allow", true], ["Allow", true]]), JSON.stringify(info.allow))
}
await shot("01-choose-locked")
await page.locator("[data-slot=choice]", { hasText: "Personal" }).click()
await sleep(300)
{
  const form = await page.evaluate(() => {
    const unlock = document.querySelector("[data-blindfold-request] [data-slot=unlock]")
    return unlock && { inputs: [...unlock.querySelectorAll("input")].map((i) => i.type), labels: [...unlock.querySelectorAll("[data-slot=label]")].map((l) => l.textContent) }
  })
  check("choosing the locked account shows its unlock: one masked token input", form && JSON.stringify(form.inputs) === '["password"]' && form.labels[0] === "Service account token", JSON.stringify(form))
}
await shot("02-unlock-form")
const tokenInput = page.locator("[data-blindfold-request] [data-slot=unlock] input")
await tokenInput.fill("ops_wrong_token_123")
check("the typed token is not in the DOM markup", !(await dom()).includes("ops_wrong_token_123"))
await page.locator("[data-blindfold-request] [data-slot=unlock-foot] button").click()
await page.waitForFunction(() => /rejected/.test(document.querySelector("[data-blindfold-request] [data-slot=unlock-foot] [data-slot=hint]")?.textContent ?? ""), null, { timeout: 20000 })
{
  const after = await page.evaluate(() => ({ hint: document.querySelector("[data-blindfold-request] [data-slot=unlock-foot] [data-slot=hint]").textContent, value: document.querySelector("[data-blindfold-request] [data-slot=unlock] input").value }))
  check("a wrong token says why, does not echo it, and the input is emptied", /token was rejected/.test(after.hint) && !after.hint.includes("ops_wrong") && after.value === "", after.hint)
}
await shot("03-unlock-error")
await tokenInput.fill("ops_fixture_service_token")
await tokenInput.press("Enter")
await page.waitForFunction(() => !document.querySelector("[data-blindfold-request] [data-slot=unlock]"), null, { timeout: 20000 })
await sleep(500)
{
  const info = await page.evaluate(() => {
    const host = document.querySelector("[data-blindfold-request]")
    return { title: host.querySelector("[data-slot=title]").textContent, sources: [...host.querySelectorAll("[data-slot=source-text]")].map((el) => el.textContent), allow: [...host.querySelectorAll("[data-slot=actions] button")].map((b) => [b.textContent.trim(), b.disabled]), radios: host.querySelectorAll("[data-slot=choice]").length, inputs: host.querySelectorAll("input").length }
  })
  check("unlocking updates the card: one source, named in the title, Allow enabled, no input left", /Use EMAIL and PASSWORD for accounts\.google\.com from Personal \(1Password\)\?/.test(info.title) && info.radios === 0 && info.inputs === 0 && info.allow.every(([, disabled]) => !disabled), JSON.stringify(info))
  check("each row names the account and the item", info.sources.length === 2 && info.sources.every((text) => text === "from Personal (1Password) · Google (personal)"), JSON.stringify(info.sources))
}
await shot("04-ready")
check("neither the token nor a value is in the DOM", leaks(await dom()).length === 0, leaks(await dom()).join())
await button("Allow").click()
await answered().first().waitFor({ timeout: 10000 })
await sleep(600)
{
  const after = await page.evaluate(() => ({ text: document.querySelector("[data-blindfold-row]").textContent, inputs: document.querySelectorAll("[data-blindfold-request] input").length, toasts: document.querySelectorAll(".toast-v2").length }))
  check("Allow: the card becomes one line naming the fields and accounts; no toast (own actions are silent)", /Secrets provided/.test(after.text) && /EMAIL \(Personal \(1Password\)\)/.test(after.text) && after.inputs === 0 && after.toasts === 0, after.text)
}
await shot("05-provided")
{
  const model = await followUp()
  check("the model saw redacted values only", model !== "" && leaks(model).length === 0 && /\[REDACTED:PASSWORD\]/.test(model) && /\[REDACTED:EMAIL\]/.test(model), model === "" ? "no follow-up" : leaks(model).join() || JSON.stringify(JSON.parse(model).messages.filter((m) => m.role === "tool").at(-1)?.content).slice(0, 200))
  check("no value in the DOM after Allow", leaks(await dom()).length === 0)
}

// ---- 2. Always allow, then use without a card ----
await ask(login("https://accounts.google.com", '[{ name: "PASSWORD" }]'))
await card().waitFor({ timeout: 40000 })
check("unlocked and holding the login: ready at once, one source", (await page.locator("[data-blindfold-request] [data-slot=source-text]").allTextContents()).join() === "from Personal (1Password) · Google (personal)")
await shot("06-ready-allow-always")
await button("Always allow").click()
await answered().first().waitFor({ timeout: 10000 })
await followUp()
await ask(login("https://accounts.google.com", '[{ name: "PASSWORD" }]'))
{
  const model = await followUp(25000)
  await sleep(500)
  check("under the saved rule the use is silent: the run finished and no card appeared", model !== "" && (await page.locator("[data-blindfold-request]").count()) === 0 && /\[REDACTED:PASSWORD\]/.test(model) && leaks(model).length === 0)
}
await sleep(300)
check("the audit trail names accounts and outcomes, never a value", (() => { const lines = audit(); return lines.some((l) => l.outcome === "allowed") && lines.some((l) => l.outcome === "always") && lines.some((l) => l.outcome === "rule" && l.account === "personal") && leaks(readFileSync(AUDIT, "utf8")).length === 0 })(), audit().map((l) => `${l.outcome}:${l.name}`).join(" "))

// ---- 3. Work: the apiKey unlock (three masked inputs), a wrong master password, then OTP too ----
await ask(login("https://admin.holibob.tech", '[{ name: "EMAIL" }, { name: "PASSWORD" }, { name: "OTP", kind: "otp" }]'))
await card().waitFor({ timeout: 40000 })
await sleep(800)
{
  const info = await page.evaluate(() => {
    const host = document.querySelector("[data-blindfold-request]")
    const unlock = host.querySelector("[data-slot=unlock]")
    return { sources: [...host.querySelectorAll("[data-slot=source-text]")].map((el) => el.textContent), choices: host.querySelectorAll("[data-slot=choice]").length, labels: [...unlock.querySelectorAll("[data-slot=label]")].map((l) => l.textContent), types: [...unlock.querySelectorAll("input")].map((i) => i.type), title: host.querySelector("[data-slot=title]").textContent }
  })
  check("a work site: only Work is offered (the rule keeps Personal out), locked, with its three masked inputs", info.choices === 0 && info.sources.every((text) => text === "Work (Bitwarden) is locked") && JSON.stringify(info.labels) === JSON.stringify(["Client ID", "Client secret", "Master password"]) && info.types.every((type) => type === "password"), JSON.stringify(info))
}
await shot("07-work-locked")
const unlockInputs = page.locator("[data-blindfold-request] [data-slot=unlock] input")
await unlockInputs.nth(0).fill("user.fixture-client")
await unlockInputs.nth(1).fill("fixture-client-secret")
await unlockInputs.nth(2).fill("wrong-master-12")
await page.locator("[data-blindfold-request] [data-slot=unlock-foot] button").click()
await page.waitForFunction(() => /Invalid master password/.test(document.querySelector("[data-blindfold-request] [data-slot=unlock-foot] [data-slot=hint]")?.textContent ?? ""), null, { timeout: 30000 })
check("a wrong master password: the CLI's reason, nothing echoed, all three inputs emptied", (await page.locator("[data-blindfold-request] [data-slot=unlock] input").evaluateAll((els) => els.every((el) => el.value === ""))) && !(await dom()).includes("wrong-master-12"))
await unlockInputs.nth(0).fill("user.fixture-client")
await unlockInputs.nth(1).fill("fixture-client-secret")
await unlockInputs.nth(2).fill("fixture-bw-master")
await unlockInputs.nth(2).press("Enter")
await page.waitForFunction(() => !document.querySelector("[data-blindfold-request] [data-slot=unlock]"), null, { timeout: 40000 })
await sleep(500)
await shot("08-work-ready")
check("Work unlocked: three rows from Work (Bitwarden) · Holibob admin", (await page.locator("[data-blindfold-request] [data-slot=source-text]").allTextContents()).every((text) => text === "from Work (Bitwarden) · Holibob admin"))
await button("Allow").click()
await answered().first().waitFor({ timeout: 10000 })
{
  const model = await followUp()
  check("the model saw the three fields redacted, including the one-time code", leaks(model).length === 0 && /\[REDACTED:OTP\]/.test(model) && /\[REDACTED:EMAIL\]/.test(model) && /\[REDACTED:PASSWORD\]/.test(model))
}

// ---- 4. Two accounts hold the login: choose, Allow disabled until chosen, Always allow ----
await ask(login("https://accounts.google.com", '[{ name: "EMAIL" }]'))
await card().waitFor({ timeout: 40000 })
await sleep(800)
{
  const info = await page.evaluate(() => ({ choices: [...document.querySelectorAll("[data-blindfold-request] [data-slot=choice]")].map((el) => el.textContent), checked: [...document.querySelectorAll("[data-blindfold-request] [data-slot=choice]")].map((el) => el.getAttribute("aria-checked")), allow: [...document.querySelectorAll("[data-blindfold-request] [data-slot=actions] button")].map((b) => [b.textContent.trim(), b.disabled]) }))
  check("two accounts hold a Google login: both listed with their items, none chosen, Allow blocked", info.choices.length === 2 && info.choices.some((t) => /Personal \(1Password\) · Google \(personal\)/.test(t)) && info.choices.some((t) => /Work \(Bitwarden\) · Google \(work\)/.test(t)) && info.checked.every((c) => c === "false") && info.allow.every(([, disabled], i) => i === 0 || disabled), JSON.stringify(info))
}
await shot("09-choose-two")
await page.locator("[data-slot=choice]", { hasText: "Work (Bitwarden)" }).click()
await sleep(200)
check("choosing enables Allow and names the account in the title", (await button("Allow").isEnabled()) && /from Work \(Bitwarden\)\?$/.test(await page.locator("[data-blindfold-request] [data-slot=title]").textContent()))
await button("Always allow").click()
await answered().first().waitFor({ timeout: 10000 })
{
  const model = await followUp()
  check("the chosen account served it (redacted for the model)", leaks(model).length === 0 && /\[REDACTED:EMAIL\]/.test(model))
}

// ---- 5. Deny ----
await ask(login("https://github.com", '[{ name: "PASSWORD" }]'))
await card().waitFor({ timeout: 40000 })
await sleep(500)
await button("Deny").click()
await answered().first().waitFor({ timeout: 10000 })
{
  const row = await answered().first().textContent()
  const model = await followUp()
  check("Deny: a muted declined row, the agent got a denial and no value", /Secrets declined/.test(row) && /denied access to PASSWORD/.test(model) && leaks(model).length === 0, row)
  check("the denial is in the audit trail", audit().some((l) => l.outcome === "denied" && l.account === "personal" && l.name === "PASSWORD"))
}
await shot("10-denied")

// ---- 6. Settings page: rules visible, revocable; accounts; recent use ----
await page.keyboard.press("Meta+,")
await sleep(1500)
await page.getByText("Blindfold", { exact: true }).first().click({ timeout: 10000 }).catch(() => undefined)
await sleep(1200)
const pageText = await page.locator("[data-blindfold-page]").innerText().catch(() => "")
check("the settings page lists the accounts, the saved rules and recent use", /Personal \(1Password\)/.test(pageText) && /Work \(Bitwarden\)/.test(pageText) && /PASSWORD on accounts\.google\.com|password on accounts\.google\.com/i.test(pageText) && /Always allowed/.test(pageText) && /Recent use/.test(pageText), pageText.replace(/\n+/g, " | ").slice(0, 260))
check("the page shows no value", leaks(pageText).length === 0)
await shot("11-settings")
const revokes = page.locator("[data-blindfold-page] [data-action^=blindfold-revoke] button")
const before = await revokes.count()
await revokes.first().click()
await sleep(800)
check("Revoke removes a rule from the list", (await revokes.count()) === before - 1, `${before} -> ${await revokes.count()}`)
await shot("12-settings-after-revoke")
await page.locator("[data-titlebar-tab]").first().click()
await sleep(500)

// ---- 7. Auto-lock: Work locks itself when idle (the harness config sets 15 s) ----
await sleep(18000)
await page.keyboard.press("Meta+,")
await sleep(1500)
await page.getByText("Blindfold", { exact: true }).first().click({ timeout: 10000 }).catch(() => undefined)
await sleep(1200)
{
  const text = await page.locator("[data-blindfold-page]").innerText().catch(() => "")
  check("after its idle time Work is locked again, Personal (no idle limit on a saved token) is not asked", /Work \(Bitwarden\)\s*\n?\s*Locked/.test(text), text.replace(/\n+/g, " | ").slice(0, 200))
}
await page.locator("[data-titlebar-tab]").first().click()

// ---- 8. Fill: the value goes from the vault to the page and nowhere else ----
const PAGE = "http://127.0.0.1:47321"
const fillCode = (url, origin) => `const tab = await tools.browser.tabs.open({ url: ${JSON.stringify(url)}, focus: false })
let ready = false
for (let i = 0; i < 40 && !ready; i++) {
  const r = await tools.browser.evaluate({ tabID: tab.id, script: "new Promise((done) => setTimeout(() => done(document.readyState === 'complete' && !!document.getElementById('password')), 300))" })
  ready = r.value === true
}
const f = await tools.blindfold.fill({ tabID: tab.id, origin: ${JSON.stringify(origin)}, fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason: "Sign in to the local test page" })
const r = await tools.browser.evaluate({ tabID: tab.id, script: f.script })
return JSON.stringify({ placeholder: f.script, report: r.value })`
const target = (host = "127.0.0.1") => browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes(`${host}:47321`))
await ask(fillCode(`${PAGE}/login`, PAGE))
await card().waitFor({ timeout: 60000 })
await sleep(800)
{
  const title = await page.locator("[data-blindfold-request] [data-slot=title]").textContent()
  check("fill card: Fill EMAIL and PASSWORD for the site from the account", title === "Fill EMAIL and PASSWORD for http://127.0.0.1:47321 from Personal (1Password)?", title)
}
await shot("13-fill-card")
await button("Allow").click()
await answered().first().waitFor({ timeout: 10000 })
{
  const model = await followUp(60000)
  const content = (() => { try { return String(JSON.parse(model).messages.filter((m) => m.role === "tool").at(-1)?.content) } catch { return model } })()
  check("the agent got a placeholder and a report with no value", /"ok":true/.test(content) && /blindfold:fill\/[0-9a-f]{32}/.test(content) && leaks(model).length === 0 && !model.includes("fixture-local-pw") && !model.includes("ada.fixture@example.test"), content.slice(0, 260))
}
{
  const live = target()
  check("the test page is open in the in-app browser (a CDP target)", !!live, browser.contexts().flatMap((context) => context.pages()).map((p) => p.url()).join(" "))
  if (live) {
    const state = await live.evaluate(() => {
      const password = document.getElementById("password")
      return { password: password.value, email: document.getElementById("identifierId").value, masked: [...document.querySelectorAll("[data-blindfold-masked]")].map((el) => el.id || el.tagName), security: getComputedStyle(password).webkitTextSecurity, echo: document.body.innerText.includes("Signing in as") }
    })
    check("the page holds both values, in the fields", state.password === "fixture-local-pw" && state.email === "ada.fixture@example.test", `masked=${state.masked.join(",")}`)
    check("the fields are masked (discs), and the echo of the email too", state.security === "disc" && state.masked.includes("identifierId") && state.masked.includes("password"), JSON.stringify(state))
    await live.screenshot({ path: `${SHOTS}/14-filled-page.png` })
    const { execFileSync } = await import("node:child_process")
    const ocr = execFileSync("tesseract", [`${SHOTS}/14-filled-page.png`, "stdout"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    check("OCR of a screenshot of the page finds neither value", !/fixture-local|ada\.fixture|local-pw/i.test(ocr), ocr.replace(/\s+/g, " ").slice(0, 140))
  }
}

// The page script refuses a page whose origin is not the approved one, before touching a field.
await ask(fillCode("http://localhost:47321/login", PAGE))
await card().waitFor({ timeout: 60000 })
await button("Allow").click()
await answered().first().waitFor({ timeout: 10000 })
{
  const model = await followUp(60000)
  const content = (() => { try { return String(JSON.parse(model).messages.filter((m) => m.role === "tool").at(-1)?.content) } catch { return model } })()
  check("another origin: the report says origin, ok is false, no value", /"ok":false/.test(content) && /origin/.test(content) && !model.includes("fixture-local-pw"), content.slice(0, 200))
  const live = target("localhost")
  const typed = live ? await live.evaluate(() => (document.getElementById("password") || {}).value ?? "n/a") : "n/a"
  check("and the password field on that page is still empty", typed === "", JSON.stringify(typed))
}

// ---- 9. Nothing durable holds a value ----
{
  const listed = JSON.parse(await api("/api/session"))
  const items = Array.isArray(listed) ? listed : listed.data
  const messages = (await Promise.all(items.map((s) => api(`/api/session/${s.id}/message`)))).join("\n")
  check("no stored message holds a value or a secret", leaks(messages).length === 0 && /\[REDACTED:PASSWORD\]/.test(messages), leaks(messages).join())
  const log = readFileSync(`${ROOT}/data/opencode/log/opencode.log`, "utf8")
  check("the service log holds no value or secret", leaks(log).length === 0, leaks(log).join())
  check("the audit file holds no value or secret", leaks(readFileSync(AUDIT, "utf8")).length === 0)
}

console.log(`\n${results.filter((r) => r.ok).length} PASS, ${results.filter((r) => !r.ok).length} FAIL`)
await browser.close()
process.exit(results.some((r) => !r.ok) ? 1 : 0)
