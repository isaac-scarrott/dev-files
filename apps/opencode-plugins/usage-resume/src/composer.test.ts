import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { MOUNT_ATTR, placeMount, visibleControls } from "./composer.js"

function page() {
  const win = new Window()
  const doc = win.document as unknown as Document
  doc.body.innerHTML = `<div data-slot="composer-controls"><div id="row"><div id="model"></div></div></div>`
  return doc
}

test("placeMount puts one mount after the model picker and reuses it", () => {
  const doc = page()
  const row = doc.getElementById("row")!
  const first = placeMount(row, () => doc.createElement("span"))
  const second = placeMount(row, () => doc.createElement("span"))
  assert.equal(first, second)
  assert.equal(row.querySelectorAll(`[${MOUNT_ATTR}]`).length, 1)
  assert.equal(row.lastElementChild, first)
  assert.equal(row.firstElementChild?.id, "model")
})

test("visibleControls skips composers that are not on screen", () => {
  const doc = page()
  const row = doc.getElementById("row")!
  ;(row as any).getClientRects = () => []
  assert.equal(visibleControls(doc), undefined)
  ;(row as any).getClientRects = () => [{}]
  assert.equal(visibleControls(doc), row)
})
