import assert from "node:assert/strict"
import { test } from "node:test"
import { activePrompt, heldPrompt, correction, glidePlan, seekTop, probeDirection, type Row } from "./target"

const ids = ["m1", "m2", "m3", "m4"]

const row = (owner: string, top: number, height: number, prompt = false): Row => ({
  owner,
  prompt,
  top,
  bottom: top + height,
})

const box = { top: 48, bottom: 700 }

// A thread as the host mounts it: each turn is its prompt row, then reply parts, all owned by the prompt's id.
const turn = (owner: string, top: number, ...heights: number[]): Row[] => {
  let y = top

  return heights.map((height, index) => {
    const made = row(owner, y, height, index === 0)

    y += height

    return made
  })
}
const LINE = 56
const mid = { top: 4000, max: 9000 }

test("active: the owner of the last row that starts at or above the reading line", () => {
  const rows = [...turn("m1", -700, 60, 500), ...turn("m2", -140, 60, 300), ...turn("m3", 220, 60, 400)]

  assert.equal(activePrompt(ids, rows, LINE, mid), 1, "m2's reply is under the line; m3's prompt is still below it")
})

test("active: a long reply taller than the viewport keeps its prompt, though the prompt row is far above and unmounted", () => {
  assert.equal(activePrompt(ids, [row("m2", -2400, 1800), row("m2", -600, 2000), ...turn("m3", 1400, 60, 200)], LINE, mid), 1)
  assert.equal(activePrompt(ids, [row("m2", -900, 2400), ...turn("m3", 1500, 60)], LINE, mid), 1)
})

test("active: a prompt exactly on the line is active; one pixel below is not", () => {
  const above = turn("m2", -400, 60, 300)

  assert.equal(activePrompt(ids, [...above, ...turn("m3", LINE, 60, 300)], LINE, mid), 2)
  assert.equal(activePrompt(ids, [...above, ...turn("m3", LINE + 1, 60, 300)], LINE, mid), 1)
})

test("active: switches exactly when a prompt crosses the line, one tick at every offset", () => {
  const seen: number[] = []

  for (let scroll = 0; scroll <= 1200; scroll += 1) {
    const rows = [...turn("m1", 100 - scroll, 60, 540), ...turn("m2", 700 - scroll, 60, 540)]

    seen.push(activePrompt(ids, rows, LINE, { top: 2000 + scroll, max: 9000 }))
  }
  const switchAt = seen.indexOf(1)

  assert.equal(switchAt, 700 - LINE, "m2's row top reaches the line")
  assert.ok(seen.slice(0, switchAt).every((index) => index === 0) && seen.slice(switchAt).every((index) => index === 1))
})

test("active: a chat that fits is on its last prompt, scrolled to the end too, however far above its row is", () => {
  const rows = [...turn("m1", 80, 60, 100), ...turn("m2", 240, 60, 100), ...turn("m3", 400, 60, 100)]

  assert.equal(activePrompt(ids, rows, LINE, { top: 0, max: 0 }), 3)
  assert.equal(activePrompt(ids, [row("m4", -3000, 60), row("m4", -2900, 3200)], LINE, { top: 5000, max: 5000 }), 3, "bottom: the last prompt's reply is long")
  assert.equal(activePrompt(ids, [row("m3", -300, 400)], LINE, { top: 4999, max: 5000 }), 3, "within the slack of the end")
  assert.equal(activePrompt(ids, [row("m3", -300, 400)], LINE, { top: 4990, max: 5000 }), 2, "ten pixels from the end is not the bottom")
})

test("active: the very top and the space above the first prompt are the first prompt", () => {
  assert.equal(activePrompt(ids, [...turn("m1", 300, 60, 300), ...turn("m2", 700, 60)], LINE, { top: 0, max: 9000 }), 0, "first prompt row still below the line")
  assert.equal(activePrompt(ids, [...turn("m1", 20, 60, 300), ...turn("m2", 380, 60)], LINE, { top: 0, max: 9000 }), 0)
  assert.equal(activePrompt(ids, [row("m0", 0, 400), ...turn("m1", 400, 60)], LINE, { top: 0, max: 9000 }), 0, "older history the rail does not list sits above")
})

test("active: every mounted row below the line puts the line inside the turn before the first prompt row, else in that prompt's turn", () => {
  assert.equal(activePrompt(ids, turn("m3", 120, 60, 300), LINE, mid), 1)
  assert.equal(activePrompt(ids, [row("m3", 120, 300)], LINE, mid), 2)
  assert.equal(activePrompt(ids, turn("m1", 120, 60, 300), LINE, mid), 0, "nothing before the first prompt")
})

test("active: one prompt is that prompt; no prompts is none; no rows is the first", () => {
  assert.equal(activePrompt(["m1"], [...turn("m1", -300, 60, 800)], LINE, mid), 0)
  assert.equal(activePrompt(["m1"], [], LINE, { top: 0, max: 0 }), 0)
  assert.equal(activePrompt([], turn("m1", 0, 60, 80), LINE, mid), -1)
  assert.equal(activePrompt(ids, [], LINE, mid), 0)
})

test("active: streaming a new turn: the new prompt is active at the bottom, and once its row passes the line above it", () => {
  const five = [...ids, "m5"]
  const streaming = [...turn("m4", -500, 60, 400), ...turn("m5", 500, 60, 300)]

  assert.equal(activePrompt(five, streaming, LINE, mid), 3, "not pinned: m5's row is still below the line")
  assert.equal(activePrompt(five, streaming, LINE, { top: 8999, max: 9000 }), 4, "pinned to the end")
  assert.equal(activePrompt(five, [...turn("m4", -900, 60, 400), ...turn("m5", 20, 60, 600)], LINE, mid), 4, "m5's row passed the line")
})

test("active: a pending revert drops later prompts from the list; their rows and a peer message resolve to the listed prompt before", () => {
  const listed = ["m1", "m2"]

  assert.equal(activePrompt(listed, [...turn("m1", -300, 60, 200), ...turn("m1x", -40, 60, 300), ...turn("m2", 400, 60)], LINE, mid), 0, "a peer message after m1")
  assert.equal(activePrompt(listed, [...turn("m2", -300, 60, 200), ...turn("m2x", -40, 60, 300)], LINE, mid), 1, "a peer message after the last prompt")
  assert.equal(activePrompt(listed, turn("m3", -300, 60, 800), LINE, mid), 1, "a reverted turn: the last listed prompt")
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

test("held prompt: previous from the last prompt at the scroll end stays on the chosen prompt, the one before the last", () => {
  const end = { top: 5000, max: 5000 }
  // The previous prompt's row is within the final screen: the jump is clamped, the reading rule still says last.
  const rows = [...turn("m3", 4500, 60, 100), ...turn("m4", 4660, 60, 280)]
  const computed = activePrompt(ids, rows, LINE, end)

  assert.equal(computed, 3)
  assert.equal(heldPrompt({ chosen: 2, computed, count: 4, scroll: end }), 2, "previous from index 3 is index 2")
  assert.equal(heldPrompt({ chosen: 0, computed, count: 4, scroll: { top: 1, max: 1 } }), 0, "a chat that fits holds it too")
})

test("held prompt: released once the scroller leaves the end, with nothing chosen, or an index the list no longer has", () => {
  const end = { top: 5000, max: 5000 }

  assert.equal(heldPrompt({ chosen: 2, computed: 3, count: 4, scroll: { top: 4990, max: 5000 } }), 3, "ten pixels from the end")
  assert.equal(heldPrompt({ chosen: undefined, computed: 3, count: 4, scroll: end }), 3)
  assert.equal(heldPrompt({ chosen: 9, computed: 3, count: 4, scroll: end }), 3, "list shrank")
  assert.equal(heldPrompt({ chosen: -1, computed: 3, count: 4, scroll: end }), 3)
})
