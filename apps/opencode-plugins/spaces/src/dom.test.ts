import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { createRowFilter, HIDDEN, ROW } from "./dom"

function sidebar(keys: string[]) {
  const window = new Window()
  // happy-dom keeps its observers on the window; the app has them globally.
  ;(globalThis as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver
  const doc = window.document as unknown as Document
  doc.body.innerHTML = `<div data-slot="vertical-tabs"><div data-slot="vertical-tabs-scroll">${keys
    .map((key) => `<div data-tab-key="${key}"></div>`)
    .join("")}</div></div>`
  return { doc, window, list: () => doc.querySelector('[data-slot="vertical-tabs"]')! as HTMLElement }
}

test("a pass hides exactly the keys it was told and shows the rest", () => {
  const { doc, list } = sidebar(["a", "b", "c"])
  let hidden = new Set(["b"])
  const filter = createRowFilter(doc, () => hidden)
  filter.start(list())
  filter.applyNow()
  const state = () => [...doc.querySelectorAll<HTMLElement>(ROW)].map((row) => [row.getAttribute("data-tab-key"), row.hasAttribute(HIDDEN)])
  assert.deepEqual(state(), [["a", false], ["b", true], ["c", false]])
  hidden = new Set(["a", "c"])
  filter.applyNow()
  assert.deepEqual(state(), [["a", true], ["b", false], ["c", true]])
})

test("our own attribute never wakes the observer: no write loops", async () => {
  const { doc, list } = sidebar(["a", "b"])
  let passes = 0
  const filter = createRowFilter(doc, () => {
    passes += 1
    return new Set(["a"])
  })
  filter.start(list())
  filter.applyNow()
  const after = passes
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(passes, after, "no extra pass from our own attribute writes")
})

test("rows the host adds later are filtered on the next frame", async () => {
  const { doc, list } = sidebar(["a"])
  const hidden = new Set(["b"])
  const filter = createRowFilter(doc, () => hidden)
  filter.start(list())
  filter.applyNow()
  const row = doc.createElement("div")
  row.setAttribute("data-tab-key", "b")
  doc.querySelector('[data-slot="vertical-tabs-scroll"]')!.appendChild(row)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.ok(row.hasAttribute(HIDDEN))
})

test("a changed tab key is re-read, not remembered", () => {
  const { doc, list } = sidebar(["a"])
  const filter = createRowFilter(doc, () => new Set(["b"]))
  filter.start(list())
  filter.applyNow()
  const row = doc.querySelector<HTMLElement>(ROW)!
  row.setAttribute("data-tab-key", "b")
  filter.applyNow()
  assert.ok(row.hasAttribute(HIDDEN))
})

test("stop shows every row again and forgets the observer", () => {
  const { doc, list } = sidebar(["a", "b"])
  const filter = createRowFilter(doc, () => new Set(["a", "b"]))
  filter.start(list())
  filter.applyNow()
  assert.equal(doc.querySelectorAll(`[${HIDDEN}]`).length, 2)
  filter.stop()
  assert.equal(doc.querySelectorAll(`[${HIDDEN}]`).length, 0)
})

test("rows without a key are left alone", () => {
  const window = new Window()
  ;(globalThis as { MutationObserver?: unknown }).MutationObserver = window.MutationObserver
  const doc = window.document as unknown as Document
  doc.body.innerHTML = '<div data-slot="vertical-tabs"><div data-tab-key="a"></div><div data-slot="group"></div></div>'
  const filter = createRowFilter(doc, () => new Set(["a"]))
  filter.start(doc.querySelector('[data-slot="vertical-tabs"]')! as HTMLElement)
  filter.applyNow()
  assert.equal(doc.querySelector('[data-slot="group"]')!.hasAttribute(HIDDEN), false)
})
