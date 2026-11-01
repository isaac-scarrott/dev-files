import assert from "node:assert/strict"
import { test } from "node:test"
import { countText, firstOf, moreLabel, moreStep } from "./page"

test("step is 25, or what remains when that is fewer; unknown remainder means a full page", () => {
  assert.equal(moreStep(10, 500, false), 25)
  assert.equal(moreStep(10, 20, false), 10)
  assert.equal(moreStep(10, 11, false), 1)
  assert.equal(moreStep(10, 10, false), 0, "none left: no button")
  assert.equal(moreStep(10, 10, true), 25, "pages remain on the server")
  assert.equal(moreStep(10, 12, true), 25)
})
test("labels", () => {
  assert.equal(moreLabel(25), "Show 25 more")
  assert.equal(moreLabel(moreStep(10, 17, false)), "Show 7 more")
  assert.equal(moreLabel(1), "Show 1 more")
})
test("walking the pages: 10, then 25 at a time, ends exactly", () => {
  let shown = 10
  const steps: number[] = []
  for (let step = moreStep(shown, 62, false); step; step = moreStep(shown, 62, false)) { steps.push(step); shown += step }
  assert.deepEqual(steps, [25, 25, 2])
  assert.equal(shown, 62)
})
test("count: dash until every server's first page, + while pages remain, exact on the last", () => {
  assert.equal(countText([]), undefined)
  assert.equal(countText([{ loaded: false, rows: 0, more: false }]), undefined)
  assert.equal(countText([{ loaded: true, rows: 10, more: true }]), "10+")
  assert.equal(countText([{ loaded: true, rows: 35, more: true }]), "35+")
  assert.equal(countText([{ loaded: true, rows: 62, more: false }]), "62")
  assert.equal(countText([{ loaded: true, rows: 0, more: false }]), "0")
  assert.equal(countText([{ loaded: true, rows: 5, more: false }, { loaded: true, rows: 3, more: true }]), "8+")
  assert.equal(countText([{ loaded: true, rows: 5, more: false }, { loaded: false, rows: 0, more: false }]), undefined)
})
test("window merges servers newest first, keeps each server's order, and caps at the limit", () => {
  const r = (id: string, updated: number) => ({ id, time: { updated } })
  const out = firstOf([{ id: "s1", rows: [r("a", 9), r("b", 4)] }, { id: "s2", rows: [r("c", 7), r("d", 6), r("e", 1)] }], 4)
  assert.deepEqual(out.map((o) => `${o.server}:${o.row.id}`), ["s1:a", "s2:c", "s2:d", "s1:b"])
  assert.equal(firstOf([{ id: "s", rows: [r("a", 1)] }], 10).length, 1)
})
