import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { findAnchor, place } from "../plugin/src/anchor"

function page(html: string) {
  const window = new Window()
  const doc = window.document as unknown as Document
  doc.body.innerHTML = html
  // happy-dom lays nothing out; treat every element as shown unless it is marked hidden.
  for (const el of doc.querySelectorAll("*")) (el as HTMLElement).getClientRects = () => (el.closest("[data-off]") ? [] : [{}]) as unknown as DOMRectList
  return doc
}

const timeline = (inner: string, attrs = "") => `<div data-slot="session-timeline-scroll" ${attrs}><div class="scroll-view__viewport">${inner}</div></div>`
const group = (ids: string) => `<div data-component="collapsed-tool-group" data-timeline-part-ids="${ids}"></div>`
const row = (id: string) => `<div data-component="tool-part-wrapper" data-timeline-part-id="${id}"></div>`
const turn = (inner: string, hidden = false) => `<div data-slot="session-turn-assistant-content"${hidden ? ' aria-hidden="true"' : ""}><div class="contents">${inner}</div></div><div data-slot="working"></div>`

test("a row with the call's part id wins, a folded group holding it comes next", () => {
  const doc = page(timeline(row("a") + row("b")))
  assert.equal(findAnchor(doc, ["b"], true)?.after.getAttribute("data-timeline-part-id"), "b")
  assert.equal(findAnchor(doc, ["b"], true)?.kind, "row")
  const folded = page(timeline(group("call_1,part_2") + group("call_3")))
  const anchor = findAnchor(folded, ["part_2"], true)
  assert.equal(anchor?.kind, "group")
  assert.equal(anchor?.after.getAttribute("data-timeline-part-ids"), "call_1,part_2")
})

test("the first id that matches wins over a later one", () => {
  const doc = page(timeline(row("a") + row("b")))
  assert.equal(findAnchor(doc, ["x", "a", "b"], true)?.after.getAttribute("data-timeline-part-id"), "a")
})

test("an unknown call falls back to the newest row or group, only while asked to", () => {
  const doc = page(timeline(row("a") + group("g1,g2")))
  assert.equal(findAnchor(doc, ["zzz"], true)?.kind, "latest")
  assert.equal(findAnchor(doc, ["zzz"], true)?.after.getAttribute("data-timeline-part-ids"), "g1,g2")
  assert.equal(findAnchor(doc, ["zzz"], false), undefined)
})

test("with no tool rows it falls back to the newest assistant message", () => {
  const doc = page(timeline(turn("")))
  assert.equal(findAnchor(doc, ["zzz"], true)?.kind, "end")
})

test("a hidden timeline (another session's, cached) is never used", () => {
  const doc = page(timeline(row("a"), "data-off") + timeline(row("b")))
  assert.equal(findAnchor(doc, ["a"], false), undefined)
  assert.equal(findAnchor(doc, ["b"], false)?.after.getAttribute("data-timeline-part-id"), "b")
})

test("the card goes after the outermost aria-hidden ancestor, so assistive technology can reach it", () => {
  const doc = page(timeline(turn(group("g1"), true)))
  const anchor = findAnchor(doc, ["g1"], true)!
  assert.equal(anchor.after.getAttribute("data-slot"), "session-turn-assistant-content")
  const host = doc.createElement("div")
  assert.equal(place(host, anchor), true)
  assert.equal(host.previousElementSibling, anchor.after)
  assert.equal(host.closest("[aria-hidden=true]"), null)
})

test("place is idempotent and moves the card when its row moves", () => {
  const doc = page(timeline(row("a") + row("b")))
  const host = doc.createElement("div")
  place(host, findAnchor(doc, ["a"], true))
  const parent = host.parentElement
  place(host, findAnchor(doc, ["a"], true))
  assert.equal(host.parentElement, parent)
  place(host, findAnchor(doc, ["b"], true))
  assert.equal(host.previousElementSibling?.getAttribute("data-timeline-part-id"), "b")
  assert.equal(place(host, undefined), false)
})
