import assert from "node:assert/strict"
import { test } from "node:test"
import { correction, currentPrompt, glidePlan, seekTop, probeDirection, revealPlan, type Row } from "./target"

const ids = ["m1", "m2", "m3", "m4"]

const row = (owner: string, top: number, height: number, prompt = false): Row => ({
  owner,
  prompt,
  top,
  bottom: top + height,
})

test("the current prompt owns the first row that extends below the fold", () => {
  const rows = [row("m2", -300, 60, true), row("m2", -240, 900), row("m3", 660, 60, true)]
  assert.equal(currentPrompt(ids, rows, 48), 1)
})

test("a prompt sitting on the fold is current, within tolerance; the turn before it ends there", () => {
  const rows = [row("m2", -200, 60, true), row("m2", -140, 180), row("m3", 44, 60, true), row("m3", 104, 500)]
  assert.equal(currentPrompt(ids, rows, 48), 2)
})

test("inside a turn whose prompt row is unmounted, the owning prompt is current", () => {
  const rows = [row("m3", -100, 400), row("m3", 300, 400), row("m4", 700, 60, true)]
  assert.equal(currentPrompt(ids, rows, 48), 2)
})

test("a row the host does not list resolves to the listed prompt before it", () => {
  assert.equal(currentPrompt(ids, [row("m2x", 60, 300)], 48), 1)
  assert.equal(currentPrompt(ids, [row("m0", 60, 300)], 48), 0)
  assert.equal(currentPrompt(ids, [row("m9", 60, 300)], 48), 3)
})

test("every row above the fold: the last row's turn is current", () => {
  assert.equal(currentPrompt(ids, [row("m1", -500, 100, true), row("m1", -400, 300)], 48), 0)
})

test("no prompts or no rows give no current prompt", () => {
  assert.equal(currentPrompt([], [row("m1", 0, 10)], 0), -1)
  assert.equal(currentPrompt(ids, [], 0), -1)
})

test("probe direction: rows in view of the target's turn or later mean it is above, earlier turns mean below", () => {
  const box = { top: 0, bottom: 800 }
  assert.equal(probeDirection([row("m3", -500, 1200)], "m3", box), -1)
  assert.equal(probeDirection([row("m4", 0, 60, true), row("m4", 60, 900)], "m3", box), -1)
  assert.equal(probeDirection([row("m2", -200, 900), row("m2", 700, 300)], "m3", box), 1)
  assert.equal(probeDirection([row("m2", -200, 300), row("m4", 100, 300)], "m3", box), 0)
  assert.equal(probeDirection([], "m3", box), -1)
})

test("probe direction ignores rows out of view, like the last turn's row the virtualizer keeps mounted", () => {
  const box = { top: 0, bottom: 800 }
  assert.equal(probeDirection([row("m2", -200, 900), row("m6", 20000, 300)], "m3", box), 1)
  assert.equal(probeDirection([row("m3", -200, 900), row("m6", 20000, 300)], "m3", box), -1)
  // Nothing in view yet: the mounted rows decide.
  assert.equal(probeDirection([row("m2", -2000, 900), row("m2", 3000, 300)], "m3", box), 1)
})

test("reveal plan probes for any prompt but the first", () => {
  assert.deepEqual(revealPlan({ ids, target: "m2", more: false }), { kind: "probe" })
  assert.deepEqual(revealPlan({ ids, target: "m4", more: true }), { kind: "probe" })
})

test("reveal plan for the first prompt loads older history or scrolls to the top", () => {
  assert.deepEqual(revealPlan({ ids, target: "m1", more: true }), { kind: "load" })
  assert.deepEqual(revealPlan({ ids, target: "m1", more: false }), { kind: "top" })
})

test("glide plan glides short distances, jumps to one screen away for long ones, and clamps", () => {
  assert.deepEqual(glidePlan({ from: 1000, to: 200, viewport: 500, max: 5000, reduced: false }), {
    to: 200,
    behavior: "smooth",
  })
  assert.deepEqual(glidePlan({ from: 4000, to: 200, viewport: 500, max: 5000, reduced: false }), {
    to: 200,
    start: 700,
    behavior: "smooth",
  })
  assert.deepEqual(glidePlan({ from: 0, to: 4000, viewport: 500, max: 5000, reduced: false }), {
    to: 4000,
    start: 3500,
    behavior: "smooth",
  })
  assert.deepEqual(glidePlan({ from: 4000, to: -10, viewport: 500, max: 5000, reduced: true }), {
    to: 0,
    behavior: "auto",
  })
  assert.deepEqual(glidePlan({ from: 0, to: 9000, viewport: 500, max: 5000, reduced: true }), {
    to: 5000,
    behavior: "auto",
  })
})

test("seek estimate: the prompt's share of the content height, clamped to the scrollable range", () => {
  const base = { count: 1000, scrollHeight: 400000, clientHeight: 800 }
  assert.equal(seekTop({ ...base, index: 0 }), 0)
  assert.equal(seekTop({ ...base, index: 500 }), 200000)
  assert.equal(seekTop({ ...base, index: 999 }), 399200)
  assert.equal(seekTop({ ...base, index: 1000 }), 399200, "clamped to the end")
  assert.equal(seekTop({ count: 0, scrollHeight: 0, clientHeight: 800, index: 0 }), 0)
})

test("correction: index gap to the middle of the turns in view times the measured prompt height", () => {
  const indexOf = new Map(Array.from({ length: 100 }, (_, index) => [`m${index}`, index] as const))
  const box = { top: 0, bottom: 800 }
  // Prompts 40 and 41 are mounted 500px apart, so a prompt is 500px: the target 10 turns below the middle (40.5).
  const rows = [row("m40", 100, 60, true), row("m40", 160, 440), row("m41", 600, 60, true), row("m41", 660, 440)]
  assert.equal(correction({ rows, indexOf, target: 51, fallback: 300, box }), 5250)
  assert.equal(correction({ rows, indexOf, target: 30, fallback: 300, box }), -5250)
  assert.equal(correction({ rows, indexOf, target: 41, fallback: 300, box }), 0, "in view: the row is about to mount")
  // One prompt row mounted: the content-height average stands in.
  assert.equal(correction({ rows: [row("m40", 100, 60, true), row("m40", 160, 900)], indexOf, target: 50, fallback: 300, box }), 3000)
  assert.equal(correction({ rows: [row("m40", 900, 60, true)], indexOf, target: 50, fallback: 300, box }), undefined, "nothing in view")
  assert.equal(correction({ rows: [row("zzz", 100, 60)], indexOf, target: 50, fallback: 300, box }), undefined, "unlisted owner")
})
