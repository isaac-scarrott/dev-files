import assert from "node:assert/strict"
import { test } from "node:test"
import { correction, currentPrompt, glidePlan, seekTop, probeDirection, type Row } from "./target"

const ids = ["m1", "m2", "m3", "m4"]

const row = (owner: string, top: number, height: number, prompt = false): Row => ({
  owner,
  prompt,
  top,
  bottom: top + height,
})

const box = { top: 48, bottom: 700 }

test("the current prompt is the first prompt row in view, as t3-code's minimap", () => {
  const rows = [row("m2", -300, 60, true), row("m2", -240, 900), row("m3", 660, 60, true)]
  assert.equal(currentPrompt(ids, rows, box), 2, "m3's row is the first prompt row in view, while the viewport top is inside m2's answer")
  assert.equal(currentPrompt(ids, [row("m2", 60, 60, true), row("m2", 120, 400), row("m3", 520, 60, true)], box), 1)
})

test("with no prompt row in view, the turn being read is current", () => {
  const rows = [row("m3", -100, 400), row("m3", 300, 400), row("m4", 720, 60, true)]
  assert.equal(currentPrompt(ids, rows, box), 2)
})

test("rows out of view do not decide", () => {
  assert.equal(currentPrompt(ids, [row("m1", -500, 100, true), row("m1", -400, 300)], box), -1)
  assert.equal(currentPrompt(ids, [row("m1", -500, 100, true), row("m2", 60, 300)], box), 1)
})

test("a row the host does not list resolves to the listed prompt before it; older than the list gives -1", () => {
  assert.equal(currentPrompt(ids, [row("m2x", 60, 300)], box), 1)
  assert.equal(currentPrompt(ids, [row("m0", 60, 300)], box), -1)
  assert.equal(currentPrompt(ids, [row("m9", 60, 300)], box), 3)
})

test("no prompts or no rows give no current prompt", () => {
  assert.equal(currentPrompt([], [row("m1", 60, 10)], box), -1)
  assert.equal(currentPrompt(ids, [], box), -1)
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
