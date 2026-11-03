import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { holdTop } from "./anchor.js"

// holdTop reads layout, so the DOM is a stub: a target whose top is `content - scroller.scrollTop` and a manual frame loop.
type Frame = () => void
let frames: Frame[] = []
let now = 0
let resize: (() => void) | undefined
const g = globalThis as Record<string, unknown>
const saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame, RO: g.ResizeObserver, now: performance.now }

function install() {
  g.requestAnimationFrame = (cb: Frame) => frames.push(cb)
  g.cancelAnimationFrame = () => { frames = [] }
  g.ResizeObserver = class { constructor(cb: () => void) { resize = cb } observe() {} disconnect() { resize = undefined } }
  performance.now = () => now
}
afterEach(() => {
  g.requestAnimationFrame = saved.raf
  g.cancelAnimationFrame = saved.caf
  g.ResizeObserver = saved.RO
  performance.now = saved.now
  frames = []
  resize = undefined
  now = 0
})

function rig() {
  const scroller = { scrollTop: 100 } as HTMLElement
  const state = { top: 50 }
  const target = { getBoundingClientRect: () => ({ top: state.top - (scroller.scrollTop - 100) }) } as unknown as Element
  return { scroller, state, target }
}

test("holdTop scrolls to cancel a move of the target, in the frame it happens", () => {
  install()
  const { scroller, state, target } = rig()
  holdTop(scroller, target, target, 200)
  state.top = 80 // the host pushed the header down by 30px
  resize?.()
  assert.equal(scroller.scrollTop, 130)
  assert.equal(target.getBoundingClientRect().top, 50)
})

test("holdTop leaves the scroller alone when nothing moved, and stops after its time", () => {
  install()
  const { scroller, target } = rig()
  const stop = holdTop(scroller, target, target, 100)
  now = 50
  frames.shift()?.()
  assert.equal(scroller.scrollTop, 100)
  assert.equal(frames.length, 1)
  now = 150
  frames.shift()?.()
  assert.equal(frames.length, 0)
  assert.equal(resize, undefined)
  stop()
})

test("a stopped hold ignores later resizes", () => {
  install()
  const { scroller, state, target } = rig()
  holdTop(scroller, target, target, 200)()
  state.top = 90
  resize?.()
  assert.equal(scroller.scrollTop, 100)
})

test("holdTop cannot hold past the scroller's end: closing a row near the bottom moves its header by what scrollTop exceeded the new max", () => {
  install()
  let max = 300
  let top = 0
  const scroller = { get scrollTop() { return top }, set scrollTop(value: number) { top = Math.min(Math.max(value, 0), max) } } as HTMLElement
  top = 200 // the user has scrolled down to read the open body
  const content = 700 // the header's offset in the content
  const target = { getBoundingClientRect: () => ({ top: content - top }) } as unknown as Element
  holdTop(scroller, target, target, 200)
  max = 140 // the body closed: the content below the header shrank, and the browser clamped the scroll position
  top = Math.min(top, max)
  resize?.()
  assert.equal(scroller.scrollTop, 140, "the write is clamped, so the hold neither overshoots nor loops")
  assert.equal(target.getBoundingClientRect().top - (content - 200), 60, "the header sits 60px lower than it was held at: the scroller had no room")
  now = 300
  frames.shift()?.()
  assert.equal(frames.length, 0)
})
