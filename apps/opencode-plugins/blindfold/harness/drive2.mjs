// Second pass over the request card: it survives a page reload, a long virtualized timeline, a session switch, and both
// themes. Same environment as drive.mjs. Fake secrets only.
import { writeFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"

const CDP = process.env.BF_CDP ?? "http://127.0.0.1:9361"
const CODE = process.env.BF_CODE_FILE
const SHOTS = process.argv[2] ?? "/private/tmp/bf-run/shots"
mkdirSync(SHOTS, { recursive: true })
const { chromium } = createRequire(`${process.env.BF_PW ?? "/private/tmp/bf-pw"}/`)("playwright-core")
const results = []
const check = (name, ok, detail = "") => {
  results.push({ name, ok })
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
}
const browser = await chromium.connectOverCDP(CDP)
const page = browser.contexts()[0].pages()[0]
await page.setViewportSize({ width: 1400, height: 900 })
const card = () => page.locator("[data-blindfold-request] [data-slot=card]")
const hosts = () => page.locator("[data-blindfold-request]")
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const code = `const v = await tools.blindfold.get({ fields: [{ name: "EMAIL" }, { name: "PASSWORD" }], reason: "Log in to the demo portal to fetch the monthly report", replace: true });
return "ok " + Object.keys(v).join(",")`

async function send(message) {
  writeFileSync(CODE, code)
  const editor = page.locator('[contenteditable="true"], textarea').last()
  await editor.click()
  await page.keyboard.type(message)
  await page.keyboard.press("Enter")
}
const viewport = () => page.locator('[data-slot="session-timeline-scroll"] .scroll-view__viewport').first()

if (!process.env.BF_SKIP_A) {
// A. page reload with a request open: the card comes back, empty, and still answers.
await page.getByRole("button", { name: "New session" }).first().click()
await page.waitForTimeout(500)
await send("reload test")
await card().waitFor({ timeout: 20000 })
await page.locator('[data-field="EMAIL"] input').fill("typed.before.reload@example.test")
await page.reload()
await card().waitFor({ timeout: 30000 }).catch(() => undefined)
check("a reload with a request open shows the card again", (await hosts().count()) === 1, `hosts=${await hosts().count()}`)
if ((await hosts().count()) === 1) {
  check("the reloaded card holds no earlier value", (await page.locator('[data-field="EMAIL"] input').inputValue()) === "")
  await page.locator('[data-field="EMAIL"] input').fill("ada.fake@example.test")
  await page.locator('[data-field="PASSWORD"] input').fill("fake-Passw0rd-12345")
  await page.getByRole("button", { name: "Submit" }).click()
  await page.locator("[data-blindfold-row]").first().waitFor({ timeout: 10000 })
  check("the reloaded card still delivers the answer", /Secrets provided/.test(await page.locator("[data-blindfold-row]").first().textContent()))
  await page.waitForTimeout(2500)
  check("and the run completed", /ok EMAIL,PASSWORD|Done\./.test(await page.locator('[data-slot="session-timeline-scroll"]').innerText()))
}

}

await page.keyboard.press("Escape")
// B. long timeline: the card follows its row through virtualization; typed text survives.
await page.getByRole("button", { name: "Home" }).first().click()
await page.waitForTimeout(800)
await page.getByText("Seeded long session").last().click()
await page.waitForTimeout(2500)
// The seeded session's own model cannot run; use the stub.
if (await page.getByText("seed (unavailable)").count()) {
  await page.getByText("seed (unavailable)").first().click()
  await page.getByText("Stub 1", { exact: true }).last().click()
}
await page.waitForTimeout(500)
// Cards left open by a plugin reload in an earlier run answer "expired" when cancelled.
for (let i = 0; i < 5 && (await card().count()); i++) await card().first().getByRole("button", { name: "Cancel" }).click()
await send("long timeline request")
await card().waitFor({ timeout: 25000 })
await page.waitForTimeout(1200)
await page.locator('[data-field="EMAIL"] input').fill("kept.while.scrolling@example.test")
const placed = () => page.evaluate(() => { const h = document.querySelector("[data-blindfold-request]"); return !!h && h.isConnected && !!h.closest('[data-slot="session-timeline-scroll"]') })
check("card in a long thread sits in the timeline", await placed())
await shot("10-long-open")
await page.mouse.move(700, 450)
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, -2500)
  await page.waitForTimeout(80)
}
await page.waitForTimeout(1200)
const inView = () => page.evaluate(() => { const h = document.querySelector("[data-blindfold-request]:has([data-slot=card])"); if (!h || !h.isConnected) return false; const r = h.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight })
check("scrolled far away, the card is out of view (unmounted with its row, or off screen)", !(await inView()))
await shot("10b-scrolled-up")
for (let i = 0; i < 16; i++) {
  await page.mouse.wheel(0, 2500)
  await page.waitForTimeout(80)
}
await page.waitForTimeout(1500)
check("scrolled back, the card is in view again", await inView())
check("typed text survived the round trip", (await page.locator('[data-field="EMAIL"] input').inputValue().catch(() => "")) === "kept.while.scrolling@example.test")

// C. session switch: the card leaves with the session, a toast offers to go back, and Show returns to it.
await page.getByRole("button", { name: "Home" }).first().click()
await page.waitForTimeout(800)
const waiting = await page.evaluate(() => ({ cards: document.querySelectorAll("[data-blindfold-request]").length }))
check("away from the session no card is in the page", waiting.cards === 0 || (await page.locator("[data-blindfold-request]").evaluateAll((els) => els.every((e) => !e.closest('[data-slot="session-timeline-scroll"]')))))
await page.waitForTimeout(1200)
const toast = await page.locator(".toast-v2").allInnerTexts()
check("a toast says the agent is waiting, with Show", toast.some((t) => /Needs Email and Password/.test(t) && /Show/.test(t)), toast.join(" | ").replace(/\n/g, " ").slice(0, 120))
await shot("11-waiting-toast")
await page.locator(".toast-v2").getByRole("button", { name: "Show" }).first().click().catch(() => undefined)
await page.waitForTimeout(1500)
check("Show returns to the session and the card", await placed())
check("the toast is gone", (await page.locator(".toast-v2").count()) === 0)

// D. themes.
for (const scheme of ["dark", "light"]) {
  await page.emulateMedia({ colorScheme: scheme })
  await page.waitForTimeout(800)
  await shot(`12-${scheme}`)
}
const colours = await page.evaluate(() => { const c = document.querySelector("[data-blindfold-card] [data-slot=card]"); const s = c && getComputedStyle(c); return s && { bg: s.backgroundColor, border: s.borderTopColor } })
console.log("card colours (scheme now light):", JSON.stringify(colours))

await page.locator("[data-blindfold-request] button", { hasText: "Cancel" }).click().catch(() => undefined)
console.log(`\n${results.filter((r) => r.ok).length} PASS, ${results.filter((r) => !r.ok).length} FAIL`)
await browser.close()
process.exit(results.some((r) => !r.ok) ? 1 : 0)
