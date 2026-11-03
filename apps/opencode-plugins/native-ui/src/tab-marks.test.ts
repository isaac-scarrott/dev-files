import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import { createDomHub } from "./dom-hub.js"
import { createTabMarks, tabMarkCss, TAB_MARK_OWN, type TabMarkSpec } from "./tab-marks.js"

function fixture(keys: string[]) {
  const win = new Window()
  const doc = win.document as unknown as Document
  doc.body.innerHTML = `<main></main><div data-slot="vertical-tabs-sidebar"><div data-slot="vertical-tabs">${keys
    .map((key) => `<div data-tab-key="${key}"><div data-titlebar-tab><div data-slot="tab-close"><span data-slot="tab-status"></span></div></div></div>`)
    .join("")}</div></div>`
  return { win, doc }
}

const frames: (() => void)[] = []
const schedule = (fn: () => void) => frames.push(fn)
const flush = () => frames.splice(0).forEach((fn) => fn())

test("a mark is injected after the status slot, carries its label and severity, and leaves other tabs alone", () => {
  const { doc } = fixture(["a", "b"])
  createRoot((dispose) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    createTabMarks({ doc, hub, mark: (key) => (key === "a" ? { severity: "error", label: "Schedule failed" } : undefined) })
    const marks = doc.querySelectorAll(TAB_MARK_OWN)
    assert.equal(marks.length, 1)
    const mark = marks[0]!
    assert.equal(mark.getAttribute("role"), "img")
    assert.equal(mark.getAttribute("aria-label"), "Schedule failed")
    assert.equal((mark as HTMLElement).dataset.severity, "error")
    assert.equal(mark.previousElementSibling?.getAttribute("data-slot"), "tab-status")
    assert.ok(doc.querySelector('[data-tab-key="a"] [data-titlebar-tab]')?.hasAttribute("data-notify"))
    assert.equal(doc.querySelector('[data-tab-key="b"] [data-titlebar-tab]')?.hasAttribute("data-notify"), false)
    dispose()
  })
})

test("sync follows what mark() reads: a changed spec replaces the node, a cleared one removes it, cleanup removes all", () => {
  const { doc } = fixture(["a"])
  const [spec, setSpec] = createSignal<TabMarkSpec | undefined>({ severity: "info", label: "Monitor ended" })
  let sync!: () => void
  const dispose = createRoot((d) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    sync = createTabMarks({ doc, hub, mark: () => spec() }).sync
    return d
  })
  const mark = () => doc.querySelectorAll(TAB_MARK_OWN)
  assert.equal(mark().length, 1)
  sync()
  assert.equal(mark().length, 1, "idempotent: no second node")
  setSpec({ severity: "warning", label: "Paused" })
  sync()
  assert.equal(mark().length, 1)
  assert.equal(mark()[0]!.getAttribute("aria-label"), "Paused")
  assert.equal((mark()[0] as HTMLElement).dataset.severity, "warning")
  setSpec(undefined)
  sync()
  assert.equal(mark().length, 0)
  assert.equal(doc.querySelector("[data-notify]"), null)
  setSpec({ severity: "info", label: "x" })
  sync()
  assert.equal(mark().length, 1)
  dispose()
  assert.equal(mark().length, 0, "cleanup")
  assert.equal(doc.querySelector("[data-notify]"), null)
})

test("every severity draws a different glyph with a stroke colour from the host's tokens", () => {
  const { doc } = fixture(["a"])
  const shapes = new Set<string>()
  for (const severity of ["info", "success", "warning", "error"] as const) {
    createRoot((dispose) => {
      const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
      createTabMarks({ doc, hub, mark: () => ({ severity, label: severity }) })
      shapes.add(doc.querySelector(TAB_MARK_OWN)!.innerHTML)
      dispose()
    })
  }
  assert.equal(shapes.size, 4)
  assert.match(tabMarkCss, /--v2-state-fg-danger/)
  assert.match(tabMarkCss, /\[data-notify\]:not\(\[data-status="attention"\], \[data-active="true"\]\) \[data-notify-mark\] \{ display: grid; \}/)
})

test("a row added later is marked by the hub's next frame, and the mark's own insertion does not wake it", () => {
  const { doc } = fixture(["a"])
  let runs = 0
  createRoot((dispose) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    createTabMarks({ doc, hub, mark: () => (runs++, { severity: "info", label: "x" }) })
  })
  const before = runs
  flush()
  assert.equal(runs, before, "no frame queued by the initial injection")
})

test("the clock glyph keeps the snooze clock's drawing and its own colour", () => {
  const { doc } = fixture(["a"])
  createRoot((dispose) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    createTabMarks({ doc, hub, mark: () => ({ severity: "info", label: "Woke from snooze", glyph: "clock" }) })
    const mark = doc.querySelector<HTMLElement>(TAB_MARK_OWN)!
    assert.equal(mark.dataset.glyph, "clock")
    assert.equal(mark.querySelector("circle")?.getAttribute("r"), "6")
    assert.equal(mark.querySelector("path")?.getAttribute("d"), "M8 4.5V8l2.5 1.5")
    dispose()
  })
  assert.match(tabMarkCss, /\[data-glyph="clock"\] \{ color: var\(--v2-orange-800\); \}/)
})

test("two owners in one sidebar: a mark of another owner is never replaced or removed", () => {
  const { doc } = fixture(["a"])
  createRoot((dispose) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    const [clock, setClock] = createSignal<TabMarkSpec | undefined>({ severity: "info", label: "Woke from snooze", glyph: "clock" })
    const first = createTabMarks({ doc, hub, owner: "snooze-archive", mark: () => clock() })
    const second = createTabMarks({ doc, hub, owner: "notifications", mark: () => ({ severity: "error", label: "Failed" }) })
    second.sync()
    assert.equal(doc.querySelectorAll(TAB_MARK_OWN).length, 1, "the second owner leaves the first one's mark")
    assert.equal(doc.querySelector(TAB_MARK_OWN)!.getAttribute("aria-label"), "Woke from snooze")
    setClock(undefined)
    first.sync()
    assert.equal(doc.querySelectorAll(TAB_MARK_OWN).length, 0)
    second.sync()
    assert.equal(doc.querySelector(TAB_MARK_OWN)!.getAttribute("aria-label"), "Failed")
    setClock({ severity: "info", label: "Woke from snooze", glyph: "clock" })
    first.sync()
    assert.equal(doc.querySelector(TAB_MARK_OWN)!.getAttribute("aria-label"), "Failed", "the first owner does not take the second's mark")
    dispose()
  })
})
