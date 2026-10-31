import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createSidebar, css } from "./sidebar"

test("bottom groups default collapsed; keyed counts, native buttons and arrow keys", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<aside><header>Host controls</header><div id="host"><div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll"><span data-slot="tab-title">Rename me</span></div></div></div><footer>Native footer</footer></aside>`
  const sidebar = createSidebar(doc, () => 1, () => {})
  let woke = 0
  const row = { key: "a\ns", title: "Session", detail: "Later", action: "Wake", run: () => { woke++ } }
  sidebar.update({ rows: [row], count: 1 }, { rows: [], count: 100 })
  const buttons = doc.querySelectorAll<HTMLButtonElement>("[data-sa-toggle]")
  assert.equal(buttons.length, 2)
  assert.equal(buttons[0].getAttribute("aria-expanded"), "false")
  assert.equal(buttons[1].textContent, "Archived100›")
  buttons[0].click()
  assert.equal(buttons[0].getAttribute("aria-expanded"), "true")
  buttons[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft" }) as unknown as Event)
  assert.equal(buttons[0].getAttribute("aria-expanded"), "false")
  buttons[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight" }) as unknown as Event)
  assert.equal(buttons[0].getAttribute("aria-expanded"), "true")
  const action = doc.querySelector<HTMLButtonElement>("[data-sa-row] button")!
  action.click()
  assert.equal(woke, 1)
  sidebar.update({ rows: [{ ...row, title: "Renamed" }], count: 1 }, { rows: [], status: "Offline" })
  assert.equal(doc.querySelector("[data-sa-row] button"), action)
  assert.equal(doc.querySelectorAll("[data-snooze-archive]").length, 1)
  assert.equal(doc.querySelector('[data-slot="tab-title"]')?.textContent, "Rename me")
  assert.equal(buttons[1].textContent, "Archived—›")
  assert.match(css, /max-height: min\(24vh, 220px\)/)
  sidebar.dispose()
  assert.equal(doc.querySelector("[data-snooze-archive]"), null)
  assert.equal(doc.querySelector("[data-sa-host]"), null)
  assert.equal(doc.querySelector("header")?.textContent, "Host controls")
  assert.equal(doc.querySelector("footer")?.textContent, "Native footer")
  await window.happyDOM.close()
})

test("attachment survives cold startup, sidebar replacement and cleanup/reload", async () => {
  const window = new Window()
  const doc = window.document as unknown as Document
  const frames = new Map<number, () => void>()
  const schedule = (fn: () => void) => { frames.set(1, fn); return 1 }
  const start = () => createSidebar(doc, schedule, (id) => { frames.delete(id) })
  let sidebar = start()
  assert.equal(doc.querySelector("[data-snooze-archive]"), null)
  doc.body.innerHTML = `<div><div data-slot="vertical-tabs"></div></div>`
  await window.happyDOM.whenAsyncComplete()
  for (const fn of frames.values()) fn()
  frames.clear()
  assert.equal(doc.querySelectorAll("[data-snooze-archive]").length, 1)
  doc.body.innerHTML = `<main><div data-slot="vertical-tabs"></div></main>`
  await window.happyDOM.whenAsyncComplete()
  for (const fn of frames.values()) fn()
  frames.clear()
  assert.ok(doc.querySelector("main > [data-snooze-archive]"))
  await window.happyDOM.whenAsyncComplete()
  assert.equal(frames.size, 0, "own attachment must not schedule observer loops")
  const strip = doc.querySelector('[data-slot="vertical-tabs"]')!
  strip.setAttribute("data-slot", "titlebar-tabs")
  await window.happyDOM.whenAsyncComplete()
  for (const fn of frames.values()) fn()
  frames.clear()
  assert.equal(doc.querySelector("[data-snooze-archive]"), null)
  strip.setAttribute("data-slot", "vertical-tabs")
  await window.happyDOM.whenAsyncComplete()
  for (const fn of frames.values()) fn()
  frames.clear()
  assert.equal(doc.querySelectorAll("[data-snooze-archive]").length, 1)
  sidebar.dispose()
  sidebar = start()
  assert.equal(doc.querySelectorAll("[data-snooze-archive]").length, 1)
  sidebar.dispose()
  assert.equal(frames.size, 0)
  await window.happyDOM.close()
})
