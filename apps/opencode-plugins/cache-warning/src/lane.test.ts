import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"
import { attach, visibleLane } from "./lane"

const window = new Window()
const doc = window.document as unknown as Document
const frames: Array<() => void> = []
Object.assign(globalThis, {
  MutationObserver: window.MutationObserver,
  requestAnimationFrame: (callback: () => void) => frames.push(callback),
  cancelAnimationFrame: (id: number) => void (frames[id - 1] = () => {}),
})

/** Runs the frames queued so far, once each. */
const tick = () => frames.splice(0).forEach((frame) => frame())

const panel = () => {
  const root = doc.createElement("div")
  root.setAttribute("data-slot", "session-chat-panel")
  const lane = doc.createElement("div")
  lane.setAttribute("data-component", "session-composer-lane")
  root.append(lane)
  doc.body.append(root)

  return { root, lane }
}

const reset = () => {
  doc.body.innerHTML = ""
  frames.length = 0
}

test("the host goes into the lane and onPlaced runs once", () => {
  reset()
  const { lane } = panel()
  const host = doc.createElement("div")
  let placed = 0
  attach(host as unknown as HTMLElement, () => placed++, () => lane as unknown as HTMLElement)
  tick()
  tick()
  assert.equal(host.parentElement, lane)
  assert.equal(placed, 1)
})

test("a lane that mounts later is found", () => {
  reset()
  const host = doc.createElement("div")
  let lane: HTMLElement | undefined
  attach(host as unknown as HTMLElement, undefined, () => lane)
  tick()
  tick()
  assert.equal(host.parentElement, null)
  lane = panel().lane as unknown as HTMLElement
  tick()
  assert.equal(host.parentElement, lane)
})

test("a swapped lane takes the host with it", () => {
  reset()
  const first = panel()
  const host = doc.createElement("div")
  let current = first.lane as unknown as HTMLElement
  attach(host as unknown as HTMLElement, undefined, () => current)
  tick()
  assert.equal(host.parentElement, first.lane)
  first.root.remove()
  const second = panel()
  current = second.lane as unknown as HTMLElement
  tick()
  assert.equal(host.parentElement, second.lane)
})

test("giving up after the wait leaves nothing scheduled", () => {
  reset()
  const host = doc.createElement("div")
  attach(host as unknown as HTMLElement, undefined, () => undefined)

  for (let index = 0; index < 200; index++) tick()
  assert.equal(frames.length, 0)
})

test("cleanup removes the host and stops looking", () => {
  reset()
  const { lane } = panel()
  const host = doc.createElement("div")
  const stop = attach(host as unknown as HTMLElement, undefined, () => lane as unknown as HTMLElement)
  tick()
  stop()
  tick()
  assert.equal(host.isConnected, false)
  assert.equal(frames.length, 0)
})

test("one lane needs no layout read; several pick the one with boxes", () => {
  reset()
  const one = panel().lane
  assert.equal(visibleLane(doc), one)
  const two = panel().lane
  Object.assign(one, { getClientRects: () => [] })
  Object.assign(two, { getClientRects: () => [{}] })
  assert.equal(visibleLane(doc), two)
})
