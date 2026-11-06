import assert from "node:assert/strict"
import test from "node:test"
import { Window } from "happy-dom"
import { afterExit } from "./leave"

const window = new Window()
const doc = window.document as unknown as Document
const frames: Array<() => void> = []
Object.assign(globalThis, {
  requestAnimationFrame: (callback: () => void) => frames.push(callback),
  cancelAnimationFrame: (id: number) => void (frames[id - 1] = () => {}),
})
const tick = () => frames.splice(0).forEach((frame) => frame())
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const end = (host: HTMLElement, propertyName: string, type = "transitionend") => {
  const event = new window.Event(type) as unknown as Event & { propertyName: string }
  event.propertyName = propertyName
  host.dispatchEvent(event)
}

test("a stalled main thread does not cut the exit: nothing ends it before the transition does", async () => {
  const host = doc.createElement("div")
  let calls = 0
  afterExit(host, () => calls++, 20, 1000)
  // The stall: far longer than the exit's duration, with no frame painted yet.
  await sleep(60)
  assert.equal(calls, 0)
  end(host, "transform")
  assert.equal(calls, 0)
  end(host, "opacity")
  assert.equal(calls, 1)
  end(host, "opacity")
  assert.equal(calls, 1)
})

test("the backstop starts after the first painted frame", async () => {
  const host = doc.createElement("div")
  let calls = 0
  afterExit(host, () => calls++, 20, 1000)
  tick()
  await sleep(50)
  assert.equal(calls, 1)
})

test("a cancelled transition and the hard cap also end it, once", async () => {
  const host = doc.createElement("div")
  let calls = 0
  afterExit(host, () => calls++, 20, 40)
  end(host, "opacity", "transitioncancel")
  assert.equal(calls, 1)
  const other = doc.createElement("div")
  let more = 0
  afterExit(other, () => more++, 20, 40)
  await sleep(80)
  assert.equal(more, 1)
})

test("the returned function ends it early", () => {
  const host = doc.createElement("div")
  let calls = 0
  const stop = afterExit(host, () => calls++, 20, 1000)
  stop()
  stop()
  assert.equal(calls, 1)
})
