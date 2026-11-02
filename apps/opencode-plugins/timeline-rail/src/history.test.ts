import assert from "node:assert/strict"
import { test } from "node:test"
import { Window } from "happy-dom"
import { loadHistory, PAGE_GAP_MS, QUIET_MS, START_DELAY_MS, type HistoryHost } from "./history"

const box = (top: number) => ({ top, bottom: top + 100, left: 0, right: 800, width: 800, height: 100, x: 0, y: top, toJSON: () => ({}) })

/** A scroller with one row at the fold; a page landing shifts that row down by `shift` px unless the scroller is corrected. */
function fixture(input: { pages: number; shift?: number; idle?: (frame: number) => number; fail?: boolean }) {
  const window = new Window()
  const document = window.document
  document.body.innerHTML = `<div data-scrollable><div data-message-id="m"></div></div>`
  const scroller = document.querySelector("[data-scrollable]") as unknown as HTMLElement
  const row = scroller.querySelector("[data-message-id]") as unknown as HTMLElement
  const state = { scrollTop: 500, rowTop: 100, remaining: input.pages, frames: 0, loads: 0, published: false }
  const writes: number[] = []
  const loading: boolean[] = []
  const drift: number[] = []
  const ahead = { idle: input.idle ?? (() => 10_000) }

  scroller.getBoundingClientRect = () => box(0)
  // The row's viewport top follows the content: a prepend moves it down, a scrollTo moves it back up.
  row.getBoundingClientRect = () => box(state.rowTop - (state.scrollTop - 500))
  scroller.scrollTo = ((options: ScrollToOptions) => {
    writes.push(options.top ?? 0)
    state.scrollTop = options.top ?? 0
  }) as HTMLElement["scrollTo"]
  Object.defineProperty(scroller, "scrollTop", { get: () => state.scrollTop, set: (value: number) => void (state.scrollTop = value) })

  const host: HistoryHost = {
    scroller,
    more: () => state.remaining > 0,
    loadMore: async ({ beforePublish }) => {
      state.loads += 1
      if (input.fail) throw new Error("offline")
      await Promise.resolve()
      beforePublish()
      state.remaining -= 1
      state.rowTop += input.shift ?? 0
    },
    frame: async () => void (state.frames += 1),
    idle: () => ahead.idle(state.frames),
    inset: () => 0,
    loading: (value) => void loading.push(value),
    drift: (px) => void drift.push(px),
  }

  return { host, state, writes, loading, drift, ahead, row }
}

test("pages every older page in, one request at a time, then stops", async () => {
  const f = fixture({ pages: 5 })
  await loadHistory(f.host, new AbortController().signal)
  assert.equal(f.state.loads, 5)
  assert.equal(f.host.more(), false)
  assert.deepEqual(f.loading, [true, false])
})

test("does nothing when the timeline already holds the whole conversation", async () => {
  const f = fixture({ pages: 0 })
  await loadHistory(f.host, new AbortController().signal)
  assert.equal(f.state.loads, 0)
  assert.deepEqual(f.loading, [])
})

test("waits for the user to hold still before each request", async () => {
  // The user is scrolling for the first 20 frames, then still.
  const f = fixture({ pages: 1, idle: (frame) => (frame < 20 ? 0 : QUIET_MS + 1) })
  const loads: number[] = []
  const original = f.host.loadMore
  f.host.loadMore = (options) => (loads.push(f.state.frames), original(options))
  await loadHistory(f.host, new AbortController().signal)
  assert.equal(loads.length, 1)
  assert.ok(loads[0]! >= 20, `requested at frame ${loads[0]}`)
})

test("aborting stops after the page in flight and clears the loading state", async () => {
  const f = fixture({ pages: 50 })
  const controller = new AbortController()
  const original = f.host.loadMore
  f.host.loadMore = async (options) => {
    await original(options)
    if (f.state.loads === 3) controller.abort()
  }
  await loadHistory(f.host, controller.signal)
  assert.equal(f.state.loads, 3)
  assert.deepEqual(f.loading, [true, false])
})

test("holds the reading position when a page lands above it", async () => {
  const f = fixture({ pages: 1, shift: 300 })
  await loadHistory(f.host, new AbortController().signal)
  assert.equal(f.drift[0], 300, "the shift is measured")
  assert.deepEqual(f.writes, [800], "scrolled down by exactly the shift")
  assert.equal(f.row.getBoundingClientRect().top, 100, "the row is back where it was")
  assert.equal(f.drift.at(-1), 0)
})

test("leaves the scroller alone when the host already kept the position", async () => {
  const f = fixture({ pages: 3, shift: 0 })
  await loadHistory(f.host, new AbortController().signal)
  assert.deepEqual(f.writes, [])
  assert.ok(f.drift.every((px) => px === 0))
})

test("a user who starts scrolling during the hold keeps their scroll", async () => {
  const f = fixture({ pages: 1, shift: 300, idle: (frame) => (f.state.loads > 0 ? 5 : 10_000) })
  await loadHistory(f.host, new AbortController().signal)
  assert.deepEqual(f.writes, [])
})

test("a failed page ends the run quietly and clears the loading state", async () => {
  const f = fixture({ pages: 3, fail: true })
  await loadHistory(f.host, new AbortController().signal)
  assert.equal(f.state.loads, 1)
  assert.deepEqual(f.loading, [true, false])
})

test("the loader waits before the first page and between pages, and a pause that is aborted ends the run", async () => {
  const { host, state } = fixture({ pages: 3 })
  const pauses: number[] = []
  const paced: HistoryHost = { ...host, pause: async (ms) => void pauses.push(ms) }

  await loadHistory(paced, new AbortController().signal)
  assert.equal(state.loads, 3)
  assert.deepEqual(pauses, [START_DELAY_MS, PAGE_GAP_MS, PAGE_GAP_MS])
})
