import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { Window } from "happy-dom"
import { createDomHub } from "./dom-hub.js"
import { KIND_GLYPH, NOTIFY_KINDS } from "./notify-contract.js"
import { createTabMarks, iconSymbol, tabMarkCss, TAB_MARK_OWN, type TabMarkSpec } from "./tab-marks.js"

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
    createTabMarks({ doc, hub, mark: (key) => (key === "a" ? { kind: "info", severity: "error", label: "Schedule failed" } : undefined) })
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
  const [spec, setSpec] = createSignal<TabMarkSpec | undefined>({ kind: "info", severity: "info", label: "Monitor ended" })
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
  setSpec({ kind: "info", severity: "warning", label: "Paused" })
  sync()
  assert.equal(mark().length, 1)
  assert.equal(mark()[0]!.getAttribute("aria-label"), "Paused")
  assert.equal((mark()[0] as HTMLElement).dataset.severity, "warning")
  setSpec(undefined)
  sync()
  assert.equal(mark().length, 0)
  assert.equal(doc.querySelector("[data-notify]"), null)
  setSpec({ kind: "info", severity: "info", label: "x" })
  sync()
  assert.equal(mark().length, 1)
  dispose()
  assert.equal(mark().length, 0, "cleanup")
  assert.equal(doc.querySelector("[data-notify]"), null)
})

test("a mark draws its kind's glyph from the host's sprite: the same icon names as the toast and the pill", () => {
  const { doc } = fixture(["a"])
  doc.body.insertAdjacentHTML("beforeend", `<svg id="sprite"><symbol id="opencode-v2-icon-notifications" viewBox="0 0 16 16"></symbol><symbol id="opencode-v2-icon-circle-x" viewBox="0 0 20 20"></symbol></svg>`)
  const hrefs: string[] = []
  for (const kind of NOTIFY_KINDS) {
    createRoot((dispose) => {
      const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
      createTabMarks({ doc, hub, mark: () => ({ kind, severity: "info", label: kind }) })
      const use = doc.querySelector(`${TAB_MARK_OWN} svg use`)!
      hrefs.push(`${kind}:${use.getAttribute("href")}`)
      assert.equal(use.parentElement!.getAttribute("width"), "14")
      if (kind === "needs-you") assert.equal(use.parentElement!.getAttribute("viewBox"), "0 0 16 16")
      dispose()
    })
  }
  assert.deepEqual(hrefs, NOTIFY_KINDS.map((kind) => `${kind}:#opencode-v2-icon-${KIND_GLYPH[kind]}`))
  assert.match(tabMarkCss, /--v2-state-fg-danger/)
  assert.match(tabMarkCss, /\[data-notify\]:not\(\[data-status="attention"\], \[data-active="true"\]\) \[data-notify-mark\] \{ display: grid; \}/)
})

test("the New icons experiment picks the new symbol, as the host's Icon does", () => {
  const { doc } = fixture(["a"])
  doc.body.insertAdjacentHTML("beforeend", `<svg data-slot="icon-svg"><use href="#opencode-v2-icon-new-cross"></use></svg><svg><symbol id="opencode-v2-icon-new-notifications" viewBox="0 0 16 16"></symbol></svg>`)
  assert.equal(iconSymbol(doc, "notifications"), "opencode-v2-icon-new-notifications")
  assert.equal(iconSymbol(doc, "circle-x"), "opencode-v2-icon-circle-x")
})

test("a row added later is marked by the hub's next frame, and the mark's own insertion does not wake it", () => {
  const { doc } = fixture(["a"])
  let runs = 0
  createRoot((dispose) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    createTabMarks({ doc, hub, mark: () => (runs++, { kind: "info", severity: "info", label: "x" }) })
  })
  const before = runs
  flush()
  assert.equal(runs, before, "no frame queued by the initial injection")
})

test("the clock glyph keeps the snooze clock's drawing and its own colour", () => {
  const { doc } = fixture(["a"])
  createRoot((dispose) => {
    const hub = createDomHub(doc, schedule, () => {}, TAB_MARK_OWN)
    createTabMarks({ doc, hub, mark: () => ({ kind: "info", severity: "info", label: "Woke from snooze", glyph: "clock" }) })
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
    const [clock, setClock] = createSignal<TabMarkSpec | undefined>({ kind: "info", severity: "info", label: "Woke from snooze", glyph: "clock" })
    const first = createTabMarks({ doc, hub, owner: "snooze-archive", mark: () => clock() })
    const second = createTabMarks({ doc, hub, owner: "notifications", mark: () => ({ kind: "info", severity: "error", label: "Failed" }) })
    second.sync()
    assert.equal(doc.querySelectorAll(TAB_MARK_OWN).length, 1, "the second owner leaves the first one's mark")
    assert.equal(doc.querySelector(TAB_MARK_OWN)!.getAttribute("aria-label"), "Woke from snooze")
    setClock(undefined)
    first.sync()
    assert.equal(doc.querySelectorAll(TAB_MARK_OWN).length, 0)
    second.sync()
    assert.equal(doc.querySelector(TAB_MARK_OWN)!.getAttribute("aria-label"), "Failed")
    setClock({ kind: "info", severity: "info", label: "Woke from snooze", glyph: "clock" })
    first.sync()
    assert.equal(doc.querySelector(TAB_MARK_OWN)!.getAttribute("aria-label"), "Failed", "the first owner does not take the second's mark")
    dispose()
  })
})
