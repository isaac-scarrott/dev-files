import assert from "node:assert/strict"
import { test } from "node:test"
import { createStrip } from "./strip"

const host = () => globalThis.document.createElement("span") as unknown as HTMLElement
const indexes = (el: HTMLElement, attribute: string) =>
  [...el.querySelectorAll(`[data-timeline-rail-tick][${attribute}]`)].map((node) => Number(node.getAttribute("data-index"))).sort((a, b) => a - b)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("count: the faint ticks are one gradient element placed by the host's --max; no node per prompt", () => {
  const el = host()
  const strip = createStrip(el)
  strip.count(5000)
  assert.equal(el.children.length, 1, "just the gradient base")
  assert.equal(el.style.getPropertyValue("--max"), "4999")
  strip.count(5010)
  assert.equal(el.style.getPropertyValue("--max"), "5009")
  assert.equal(el.children.length, 1)
})

test("view and current make nodes only for those prompts, and touch only the ends that moved", async () => {
  const el = host()
  const strip = createStrip(el)
  strip.count(5000)
  strip.view([2, 4])
  assert.deepEqual(indexes(el, "data-view"), [2, 3, 4])
  assert.equal(el.querySelectorAll("[data-timeline-rail-tick]").length, 3)
  const kept = el.querySelector('[data-index="3"]')
  const touched: string[] = []
  const observer = new globalThis.window.MutationObserver((records) => {
    for (const record of records) touched.push((record.target as Element).getAttribute("data-index")!)
  })
  observer.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-view"] })
  strip.view([3, 5])
  await Promise.resolve()
  observer.disconnect()
  assert.deepEqual(indexes(el, "data-view"), [3, 4, 5])
  assert.deepEqual([...new Set(touched)].sort(), ["2", "5"], "only the ends moved")
  assert.equal(el.querySelector('[data-index="3"]'), kept, "nodes that stay are reused")

  strip.current(4)
  assert.deepEqual(indexes(el, "data-current"), [4])
  strip.current(4000)
  assert.deepEqual(indexes(el, "data-current"), [4000])
  strip.current(-1)
  assert.deepEqual(indexes(el, "data-current"), [])
  strip.view(undefined)
  assert.deepEqual(indexes(el, "data-view"), [])
  await wait(520)
  assert.equal(el.querySelectorAll("[data-timeline-rail-tick]").length, 0, "nodes with nothing to show are retired after their transition")
})

test("active: fisheye distances 0, 1, 2 around the index; nodes follow the pointer and none pile up", async () => {
  const el = host()
  const strip = createStrip(el)
  strip.count(5000)
  const d = () => new Map(indexes(el, "data-d").map((index) => [index, el.querySelector(`[data-index="${index}"]`)!.getAttribute("data-d")]))
  strip.active(2500)
  assert.deepEqual([...d()], [[2498, "2"], [2499, "1"], [2500, "0"], [2501, "1"], [2502, "2"]])
  strip.active(2501)
  assert.deepEqual([...d()].map(([, value]) => value), ["2", "1", "0", "1", "2"])
  assert.deepEqual([...d().keys()], [2499, 2500, 2501, 2502, 2503])
  strip.active(0)
  assert.deepEqual([...d()], [[0, "0"], [1, "1"], [2, "2"]])
  for (let index = 0; index < 5000; index += 7) strip.active(index)
  strip.active(undefined)
  assert.equal(indexes(el, "data-d").length, 0)
  await wait(520)
  assert.equal(el.querySelectorAll("[data-timeline-rail-tick]").length, 0)
})

test("a list that shrinks drops the nodes past its end", () => {
  const el = host()
  const strip = createStrip(el)
  strip.count(100)
  strip.view([90, 99])
  strip.current(95)
  strip.count(93)
  assert.deepEqual(indexes(el, "data-view"), [90, 91, 92])
  assert.deepEqual(indexes(el, "data-current"), [])
})
