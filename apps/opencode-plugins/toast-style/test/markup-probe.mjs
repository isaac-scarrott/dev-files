// Fails when the app's toast markup no longer matches what src/host-markup.ts aims at, and when the style does not apply.
// Needs the private harness running with test/probe-plugin and this plugin loaded:
//   S=../.claude/skills/opencode-gui-plugins/scripts; $S/desktop-harness.sh start $PWD/test/probe-plugin $PWD
//   OC_HARNESS_CDP_PORT=9333 npx tsx test/markup-probe.mjs
// playwright-core: $OC_PW_ROOT, else /private/tmp/pw.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { CARD, PROBES } from "../src/host-markup.ts"

const { chromium } = createRequire(`${process.env.OC_PW_ROOT ?? "/private/tmp/pw"}/`)("playwright-core")
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.OC_HARNESS_CDP_PORT ?? 9333}`)
const page = browser.contexts()[0].pages()[0]
await page.setViewportSize({ width: 1400, height: 900 })

const failures = []
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`)
  if (!ok) failures.push(what)
}

const shapes = {
  text: { title: "Probe", description: "Probe description" },
  glyph: { title: "Probe", description: "Probe description", icon: "info" },
  actions: { title: "Probe", description: "Probe description", icon: "info", actions: [{ label: "Open" }, { label: "More" }] },
  "needs-you": { title: "Probe", description: "Probe description", icon: "notifications", actions: [{ label: "Open" }] },
}
const raise = (options) => page.evaluate((o) => void globalThis.__toast.show({ persistent: true, ...o, actions: o.actions?.map((a) => ({ label: a.label, run() {} })) }), options)
const clear = async () => {
  await page.evaluate(() => document.querySelectorAll("[data-sonner-toast] [data-close-button]").forEach((button) => button.click()))
  await page.waitForTimeout(500)
}

await clear()
for (const options of Object.values(shapes)) await raise(options)
await raise({ title: "Probe 4", description: "stack" })
await raise({ title: "Probe 5", description: "stack" })
await page.waitForTimeout(900)
for (const probe of PROBES) check(await page.evaluate((selector) => !!document.querySelector(selector), probe.selector), `host markup: ${probe.name} (${probe.selector})`)

// One component, one look: a toast shaped the way the app raises its own (no glyph, or its success check) and one the notifications
// hub raises (its own glyph) render the shared parts identically, whoever raised them.
const PARTS = {
  card: ["width", "paddingTop", "paddingLeft", "borderTopLeftRadius", "backgroundColor", "boxShadow", "fontFamily", "transitionDuration", "transitionTimingFunction", "columnGap", "rowGap"],
  title: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "whiteSpace", "textOverflow"],
  description: ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color", "marginTop", "webkitLineClamp", "overflow", "gridColumnStart", "gridColumnEnd"],
  actions: ["marginTop", "columnGap", "gridColumnStart", "gridColumnEnd"],
  button: ["height", "paddingLeft", "borderTopLeftRadius", "fontFamily", "fontSize", "fontWeight"],
  close: ["width", "height", "borderTopLeftRadius", "color"],
}
const publish = (n) => page.evaluate((n) => void globalThis[Symbol.for("opencode-plugins.notify.v1")]?.sinks?.[0]?.publish({ v: 1, severity: "info", persistent: true, at: Date.now(), source: "probe", ...n }), n)
await clear()
await raise({ title: "Raised by the app", description: "Same words in both toasts, long enough to wrap onto a second line of text.", variant: "success", actions: [{ label: "Open" }] })
await page.waitForTimeout(500)
await publish({ kind: "done", severity: "success", title: "Raised by the hub", body: "Same words in both toasts, long enough to wrap onto a second line of text.", key: "probe-done" + Date.now(), target: { server: "none", session: "none" } })
await page.waitForTimeout(900)
const look = await page.evaluate(({ card, parts }) => {
  const read = (el, props) => Object.fromEntries(props.map((prop) => [prop, getComputedStyle(el)[prop] ?? getComputedStyle(el).getPropertyValue(prop)]))
  const token = document.createElement("div"); token.style.color = "var(--v2-icon-icon-base)"; document.body.append(token)
  const neutral = getComputedStyle(token).color; token.remove()
  return [...document.querySelectorAll(card)].map((li) => {
    const icon = li.querySelector("[data-icon]"), actions = li.querySelector('[data-slot="toast-v2-actions"]')
    return {
      title: li.querySelector("[data-title]").textContent,
      parts: { card: read(li, parts.card), title: read(li.querySelector("[data-title]"), parts.title), description: read(li.querySelector("[data-description]"), parts.description), actions: actions && read(actions, parts.actions), button: actions && read(actions.querySelector("button"), parts.button), close: read(li.querySelector("[data-close-button]"), parts.close) },
      glyph: icon && { w: icon.offsetWidth, h: icon.offsetHeight, x: icon.offsetLeft, y: icon.offsetTop, color: getComputedStyle(li.querySelector("[data-icon]")).color, neutral },
      offsets: { descriptionX: li.querySelector("[data-description]").offsetLeft, actionsX: actions && actions.offsetLeft },
    }
  })
}, { card: CARD, parts: PARTS })
check(look.length === 2, `two toasts to compare (${look.length})`)
if (look.length === 2) {
  const [a, b] = look
  for (const part of Object.keys(PARTS)) {
    const differs = Object.keys(a.parts[part] ?? {}).filter((prop) => a.parts[part][prop] !== b.parts[part][prop])
    check(differs.length === 0, `same look: ${part}${differs.length ? " differs in " + differs.map((prop) => `${prop} (${a.parts[part][prop]} vs ${b.parts[part][prop]})`).join(", ") : ""}`)
  }
  check(a.offsets.descriptionX === 12 && b.offsets.descriptionX === 12 && a.offsets.actionsX === 12, `description and buttons start at the card's padding (${a.offsets.descriptionX}, ${b.offsets.descriptionX}, ${a.offsets.actionsX})`)
  check(a.glyph && b.glyph && a.glyph.x === b.glyph.x && a.glyph.w === b.glyph.w && a.glyph.h === 20, "glyph slot: 16x20 at the same place")
  check(a.glyph.color === a.glyph.neutral && b.glyph.color === b.glyph.neutral, `every glyph in the app's neutral colour (${a.glyph.color}, ${b.glyph.color})`)
}
await clear()
for (const options of Object.values(shapes)) await raise(options)
await raise({ title: "Probe 4", description: "stack" })
await raise({ title: "Probe 5", description: "stack" })
await page.waitForTimeout(900)

const applied = await page.evaluate((card) => {
  const li = document.querySelector(card)
  const region = document.querySelector(".toast-v2-region")
  const behind = document.querySelector(`${card}[data-front="false"]`)
  return {
    font: getComputedStyle(region).fontFamily.split(",")[0].trim(),
    duration: getComputedStyle(li).transitionDuration.split(",")[0].trim(),
    peek: behind ? new DOMMatrix(getComputedStyle(behind).transform).m42 : undefined,
    chip: getComputedStyle(region, "::after").content,
  }
}, CARD)
check(applied.font === "Inter", `style applies: font ${applied.font}`)
check(applied.duration === "0.28s", `style applies: transition ${applied.duration}`)
check(applied.peek === -8, `style applies: first peek ${applied.peek}px`)
check(/more/.test(applied.chip), `style applies: chip ${applied.chip}`)

await clear()
await browser.close()
assert.equal(failures.length, 0, `${failures.length} failed`)
