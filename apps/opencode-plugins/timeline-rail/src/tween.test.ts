import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { easeOut, tweenDuration, tweenScroll } from "./tween"

function fixture(from: number) {
  const window = new Window()
  window.document.body.innerHTML = `<div data-scrollable></div>`
  const scroller = window.document.querySelector("[data-scrollable]") as unknown as HTMLElement
  const state = { top: from, clock: 0 }
  const writes: number[] = []
  Object.defineProperty(scroller, "scrollTop", { get: () => state.top })
  scroller.scrollTo = ((options: ScrollToOptions) => {
    writes.push(options.top ?? 0)
    state.top = options.top ?? 0
  }) as HTMLElement["scrollTo"]
  // 16ms per frame.
  const host = { scroller, now: () => state.clock, frame: async () => void (state.clock += 16) }

  return { host, state, writes, scroller, window }
}

test("ease-out: fast start, long settle, exact ends", () => {
  assert.equal(easeOut(0), 0)
  assert.equal(easeOut(1), 1)
  assert.ok(easeOut(0.25) > 0.6, "most of the distance in the first quarter of the time")
  assert.ok(easeOut(0.5) - easeOut(0.4) < easeOut(0.2) - easeOut(0.1), "slowing down")
})

test("duration scales with distance and never passes 420ms", () => {
  assert.equal(tweenDuration(0), 180)
  assert.ok(tweenDuration(600) < tweenDuration(1500))
  assert.equal(tweenDuration(100_000), 420)
  assert.equal(tweenDuration(-100_000), 420)
})

test("lands exactly on the target, never goes backwards, writes instantly", async () => {
  const f = fixture(0)
  const done = await tweenScroll(f.host, 1000, new AbortController().signal)
  assert.equal(done, true)
  assert.equal(f.writes.at(-1), 1000)
  assert.deepEqual(f.writes, [...f.writes].sort((a, b) => a - b))
  assert.ok(f.writes.length >= 10 && f.writes.length <= 30, `${f.writes.length} frames`)
})

test("works upwards too", async () => {
  const f = fixture(2000)
  await tweenScroll(f.host, 500, new AbortController().signal)
  assert.equal(f.writes.at(-1), 500)
  assert.deepEqual(f.writes, [...f.writes].sort((a, b) => b - a))
})

test("the user's wheel stops it where it is", async () => {
  const f = fixture(0)
  let frames = 0
  const original = f.host.frame
  f.host.frame = async () => {
    await original()
    if (++frames === 4) f.scroller.dispatchEvent(new f.window.Event("wheel") as unknown as Event)
  }
  const done = await tweenScroll(f.host, 1000, new AbortController().signal)
  assert.equal(done, false)
  assert.equal(f.writes.length, 3, "no write after the input")
})

test("abort stops it, and its listeners are gone afterwards", async () => {
  const f = fixture(0)
  const controller = new AbortController()
  let frames = 0
  const original = f.host.frame
  f.host.frame = async () => {
    await original()
    if (++frames === 3) controller.abort()
  }
  assert.equal(await tweenScroll(f.host, 1000, controller.signal), false)
  assert.equal(f.writes.length, 2)
  f.scroller.dispatchEvent(new f.window.Event("wheel") as unknown as Event)
})
