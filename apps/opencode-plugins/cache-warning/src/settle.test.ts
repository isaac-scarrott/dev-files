import assert from "node:assert/strict"
import test from "node:test"
import { CAP, QUIET, settler, type Timers } from "./settle"

const clock = () => {
  let now = 0
  let next = 1
  const pending = new Map<number, { at: number; run: () => void }>()
  const timers: Timers = {
    set: (run, ms) => {
      pending.set(next, { at: now + ms, run })
      return next++
    },
    clear: (handle) => void pending.delete(handle as number),
  }
  const advance = (ms: number) => {
    const end = now + ms
    for (;;) {
      const due = [...pending].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      pending.delete(due[0])
      now = due[1].at
      due[1].run()
    }
    now = end
  }

  return { timers, advance }
}

test("settles once the inputs have been quiet", () => {
  const time = clock()
  const settled: string[] = []
  const gate = settler((key) => settled.push(key), time.timers)

  gate.watch("a", true)
  time.advance(QUIET - 1)
  assert.deepEqual(settled, [])
  time.advance(1)
  assert.deepEqual(settled, ["a"])
})

test("a change inside the quiet time starts it again: the fallback-then-real model chain never settles early", () => {
  const time = clock()
  const settled: string[] = []
  const gate = settler((key) => settled.push(key), time.timers)

  gate.watch("a", false)
  time.advance(40)
  gate.watch("a", true)
  time.advance(QUIET - 1)
  assert.deepEqual(settled, [])
  time.advance(1)
  assert.deepEqual(settled, ["a"])
})

test("a composer that reports no model delays the settle to the cap, not for ever", () => {
  const time = clock()
  const settled: string[] = []
  const gate = settler((key) => settled.push(key), time.timers)

  gate.watch("a", false)
  time.advance(CAP - 1)
  assert.deepEqual(settled, [])
  time.advance(1)
  assert.deepEqual(settled, ["a"])
})

test("after it has settled, further input changes do not hold it again", () => {
  const time = clock()
  const settled: string[] = []
  const gate = settler((key) => settled.push(key), time.timers)

  gate.watch("a", true)
  time.advance(QUIET)
  gate.watch("a", true)
  time.advance(CAP * 2)
  assert.deepEqual(settled, ["a"])
})

test("another session settles on its own, and coming back to one settles it again", () => {
  const time = clock()
  const settled: string[] = []
  const gate = settler((key) => settled.push(key), time.timers)

  gate.watch("a", true)
  time.advance(QUIET)
  gate.watch("b", true)
  time.advance(QUIET - 1)
  assert.deepEqual(settled, ["a"])
  time.advance(1)
  gate.watch(undefined, false)
  gate.watch("b", true)
  time.advance(QUIET)
  assert.deepEqual(settled, ["a", "b", "b"])
})

test("no session cancels a pending settle", () => {
  const time = clock()
  const settled: string[] = []
  const gate = settler((key) => settled.push(key), time.timers)

  gate.watch("a", true)
  gate.watch(undefined, false)
  time.advance(CAP * 2)
  assert.deepEqual(settled, [])
})

test("the default timers work when called as methods of the timers object (a browser's setTimeout rejects another receiver)", async () => {
  const real = globalThis.setTimeout
  globalThis.setTimeout = function (this: unknown, run: () => void, ms?: number) {
    if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation")
    return real(run, ms)
  } as typeof setTimeout
  try {
    const gate = settler(() => {})
    gate.watch("a", true)
    gate.stop()
  } finally {
    globalThis.setTimeout = real
  }
})
