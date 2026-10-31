import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { openPublishedGroups } from "./groups"

function setup() {
  const window = new Window({ url: "https://app.test/" })
  const doc = window.document as unknown as Document
  const group = (ids: string[], expanded = false) => {
    const root = doc.createElement("div")
    root.setAttribute("data-component", "collapsed-tool-group")
    root.setAttribute("data-timeline-part-ids", ids.join(","))
    root.innerHTML = `<div data-component="collapsible"><button data-slot="collapsible-trigger" aria-expanded="${expanded}"></button></div>`
    const trigger = root.querySelector("button")!
    const clicks = { count: 0 }
    // The host flips aria-expanded on click.
    trigger.addEventListener("click", () => {
      clicks.count++
      trigger.setAttribute("aria-expanded", String(trigger.getAttribute("aria-expanded") !== "true"))
    })
    doc.body.append(root)
    return { root, trigger, clicks }
  }
  return { doc, group }
}

test("opens a collapsed group that holds a published page", () => {
  const t = setup()
  const g = t.group(["a", "b"])
  openPublishedGroups(t.doc, new Set(["b"]), new Set())
  assert.equal(g.clicks.count, 1)
  assert.equal(g.trigger.getAttribute("aria-expanded"), "true")
})

test("leaves groups without a published page closed and reports their ids", () => {
  const t = setup()
  const g = t.group(["a", "b"])
  const scan = openPublishedGroups(t.doc, new Set(["z"]), new Set())
  assert.equal(g.clicks.count, 0)
  assert.deepEqual(scan.unknown, ["a", "b"])
})

test("opens once per page: a group the reader closed stays closed", () => {
  const t = setup()
  const g = t.group(["a", "b"])
  const known = new Set(["b"])
  const opened = new Set<string>()
  openPublishedGroups(t.doc, known, opened)
  g.trigger.click() // the reader collapses it
  openPublishedGroups(t.doc, known, opened)
  openPublishedGroups(t.doc, known, opened)
  assert.equal(g.clicks.count, 2)
  assert.equal(g.trigger.getAttribute("aria-expanded"), "false")
})

test("a group that remounts closed is not reopened", () => {
  const t = setup()
  const known = new Set(["b"])
  const opened = new Set<string>()
  const first = t.group(["a", "b"])
  openPublishedGroups(t.doc, known, opened)
  first.root.remove() // virtualized out of the list
  const again = t.group(["a", "b"])
  openPublishedGroups(t.doc, known, opened)
  assert.equal(again.clicks.count, 0)
})

test("a new page joining an already-handled group opens it again", () => {
  const t = setup()
  const g = t.group(["a"])
  const opened = new Set<string>()
  openPublishedGroups(t.doc, new Set(["a"]), opened)
  g.trigger.click()
  g.root.setAttribute("data-timeline-part-ids", "a,c")
  openPublishedGroups(t.doc, new Set(["a", "c"]), opened)
  assert.equal(g.trigger.getAttribute("aria-expanded"), "true")
})

test("an already open group is not clicked", () => {
  const t = setup()
  const g = t.group(["a"], true)
  openPublishedGroups(t.doc, new Set(["a"]), new Set())
  assert.equal(g.clicks.count, 0)
})
