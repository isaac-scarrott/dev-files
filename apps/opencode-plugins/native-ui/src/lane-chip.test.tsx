import assert from "node:assert/strict"
import { test } from "node:test"
import { createRoot } from "solid-js"
import type { ComposerPillProps } from "@opencode/plugin/gui"
import type { ChipMotion, ChipRun } from "./chip-motion.js"
import { createLaneChip } from "./lane-chip.js"

class FakeRun implements ChipRun {
  finishers: (() => void)[] = []
  reversed = 0
  cancelled = false
  constructor(readonly kind: string) {}
  reverse() { this.reversed++ }
  cancel() { this.cancelled = true }
  onFinish(fn: () => void) { this.finishers.push(fn) }
  finish() { this.finishers.forEach((fn) => fn()) }
}

function setup() {
  const runs: FakeRun[] = []
  const chip = { getBoundingClientRect: () => ({ width: 100 }) } as unknown as HTMLElement
  const motion: ChipMotion = {
    enter: () => { const run = new FakeRun("enter"); runs.push(run); return run },
    exit: () => { const run = new FakeRun("exit"); runs.push(run); return run },
    resize: () => { const run = new FakeRun("resize"); runs.push(run); return run },
  }
  let dispose!: () => void
  const lane = createRoot((d) => {
    dispose = d
    return createLaneChip({ id: "monitors", icon: "outline-wave-audio", restIcon: "outline-dots", label: (n) => `${n} monitors`, menu: () => null as never, motion, find: () => [chip] })
  })
  const input = (key: string) => ({ session: { key } }) as unknown as ComposerPillProps
  const shows = (key: string) => lane.pill.show(input(key))?.label
  const visit = {}
  const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))
  return { lane, runs, shows, visit, flush, dispose }
}

test("a count the session arrives with is set at rest, with no motion", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 2)
  await t.flush()
  assert.equal(t.shows("a"), "2 monitors")
  assert.equal(t.runs.length, 0)
  assert.equal(t.shows("b"), undefined)
  t.dispose()
})

test("a chip that appears while watched enters, and one that empties leaves only after the motion ends", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  t.lane.settle({ key: "a", visit: t.visit }, 1)
  assert.equal(t.shows("a"), "1 monitors")
  await t.flush()
  assert.deepEqual(t.runs.map((run) => run.kind), ["enter"])
  t.runs[0]!.finish()

  t.lane.settle({ key: "a", visit: t.visit }, 0)
  assert.deepEqual(t.runs.map((run) => run.kind), ["enter", "exit"])
  assert.equal(t.shows("a"), "1 monitors", "the chip keeps its text while it collapses")
  t.runs[1]!.finish()
  assert.equal(t.shows("a"), undefined)
  t.dispose()
})

test("a chip that is asked back while leaving turns round instead of jumping", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 1)
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  assert.equal(t.runs.length, 1)
  assert.equal(t.runs[0]!.kind, "exit")
  t.lane.settle({ key: "a", visit: t.visit }, 2)
  assert.equal(t.runs[0]!.reversed, 1)
  assert.equal(t.shows("a"), "1 monitors", "the text waits for the chip to come back")
  t.runs[0]!.finish()
  assert.equal(t.shows("a"), "2 monitors", "a chip that came back is not removed when the reversed run ends")
  await t.flush()
  assert.deepEqual(t.runs.map((run) => run.kind), ["exit", "resize"], "and its width eases to the new text")
  t.dispose()
})

test("a count that arrives while the chip is entering waits for the enter, then eases the width", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  t.lane.settle({ key: "a", visit: t.visit }, 1)
  await t.flush()
  t.lane.settle({ key: "a", visit: t.visit }, 2)
  assert.equal(t.shows("a"), "1 monitors")
  assert.equal(t.runs.length, 1)
  t.runs[0]!.finish()
  assert.equal(t.shows("a"), "2 monitors")
  await t.flush()
  assert.deepEqual(t.runs.map((run) => run.kind), ["enter", "resize"])
  t.dispose()
})

test("a chip that is emptied while entering turns round and leaves", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  t.lane.settle({ key: "a", visit: t.visit }, 1)
  await t.flush()
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  assert.equal(t.runs[0]!.reversed, 1)
  assert.equal(t.shows("a"), "1 monitors")
  t.runs[0]!.finish()
  assert.equal(t.shows("a"), undefined)
  t.dispose()
})

test("a change of count between non-zero values eases the width", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 1)
  t.lane.settle({ key: "a", visit: t.visit }, 2)
  assert.equal(t.shows("a"), "2 monitors")
  await t.flush()
  assert.deepEqual(t.runs.map((run) => run.kind), ["resize"])
  t.dispose()
})

test("a new routing visit never animates: it is a switch, not a change", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  t.lane.settle({ key: "a", visit: {} }, 3)
  await t.flush()
  assert.equal(t.shows("a"), "3 monitors")
  assert.equal(t.runs.length, 0)
  t.lane.settle({ key: "a", visit: {} }, 0)
  assert.equal(t.shows("a"), undefined)
  assert.equal(t.runs.length, 0)
  t.dispose()
})

test("ending the plugin cancels what is moving", async () => {
  const t = setup()
  t.lane.settle({ key: "a", visit: t.visit }, 1)
  t.lane.settle({ key: "a", visit: t.visit }, 0)
  t.dispose()
  assert.equal(t.runs[0]!.cancelled, true)
})

test("the chip wears its rest icon while every item rests, with no motion for the change", async () => {
  const t = setup()
  const icon = (key: string) => t.lane.pill.show({ session: { key } } as unknown as ComposerPillProps)?.icon
  t.lane.settle({ key: "a", visit: t.visit }, 2)
  assert.equal(icon("a"), "outline-wave-audio")
  t.lane.settle({ key: "a", visit: t.visit }, 2, true)
  await t.flush()
  assert.equal(icon("a"), "outline-dots")
  assert.equal(t.runs.length, 0)
  t.lane.settle({ key: "a", visit: t.visit }, 2, false)
  assert.equal(icon("a"), "outline-wave-audio")
  t.dispose()
})
