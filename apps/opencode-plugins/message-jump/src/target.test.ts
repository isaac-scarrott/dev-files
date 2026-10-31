import assert from "node:assert/strict"
import { test } from "node:test"
import { candidates, glidePlan, hostCursor, pickTarget, revealPlan, type Row } from "./target"

const ids = ["m1", "m2", "m3", "m4"]

const row = (owner: string, top: number, height: number, prompt = false): Row => ({
  owner,
  prompt,
  top,
  bottom: top + height,
})

test("candidates keep user messages in order and drop prompts at or after a pending revert", () => {
  const messages = [
    { id: "m1", type: "user" },
    { id: "m1a", type: "assistant" },
    { id: "m2", type: "user" },
    { id: "m3", type: "user" },
  ]
  assert.deepEqual(candidates(messages), ["m1", "m2", "m3"])
  assert.deepEqual(candidates(messages, "m3"), ["m1", "m2"])
})

test("inside a turn whose prompt scrolled off above, the target is that prompt", () => {
  const rows = [row("m2", -300, 60, true), row("m2", -240, 900), row("m3", 660, 60, true)]
  assert.deepEqual(pickTarget({ ids, rows, fold: 48, more: false }), { kind: "message", id: "m2" })
})

test("a prompt sitting on the fold targets the prompt before it, within tolerance", () => {
  const rows = [row("m2", -200, 60, true), row("m2", -140, 180), row("m3", 44, 60, true), row("m3", 104, 500)]
  assert.deepEqual(pickTarget({ ids, rows, fold: 48, more: false }), { kind: "message", id: "m2" })
})

test("a prompt partly under the header is already above: it is the target", () => {
  const rows = [row("m3", 20, 60, true), row("m3", 80, 500)]
  assert.deepEqual(pickTarget({ ids, rows, fold: 48, more: false }), { kind: "message", id: "m3" })
})

test("inside a turn whose prompt row is unmounted, the owning prompt is the target", () => {
  const rows = [row("m3", -100, 400), row("m3", 300, 400), row("m4", 700, 60, true)]
  assert.deepEqual(pickTarget({ ids, rows, fold: 48, more: false }), { kind: "message", id: "m3" })
})

test("the first prompt on the fold has nothing above unless older history exists", () => {
  const rows = [row("m1", 50, 60, true), row("m1", 110, 300)]
  assert.equal(pickTarget({ ids, rows, fold: 48, more: false }), undefined)
  assert.deepEqual(pickTarget({ ids, rows, fold: 48, more: true }), { kind: "load" })
})

test("a row the host does not list falls back to the listed prompt before it", () => {
  const rows = [row("m2x", 60, 300)]
  assert.deepEqual(pickTarget({ ids, rows, fold: 48, more: false }), { kind: "message", id: "m2" })
})

test("no prompts or no rows give no target", () => {
  assert.equal(pickTarget({ ids: [], rows: [row("m1", 0, 10)], fold: 0, more: true }), undefined)
  assert.equal(pickTarget({ ids, rows: [], fold: 0, more: true }), undefined)
})

test("host cursor picks the row on the 100px line, else the nearest shown row", () => {
  const box = { top: 0, bottom: 800 }
  assert.equal(hostCursor([row("m1", -50, 100), row("m2", 50, 100), row("m3", 150, 100)], box), "m2")
  assert.equal(hostCursor([row("m2", 300, 100), row("m3", 500, 100)], box), "m2")
  assert.equal(hostCursor([row("m1", -500, 100), row("m2", -300, 100)], box), "m2")
  assert.equal(hostCursor([], box), undefined)
})

test("reveal plan steps the host back once per prompt between its cursor and the target", () => {
  assert.deepEqual(revealPlan({ ids, cursor: "m4", target: "m2", more: false }), {
    kind: "commands",
    commands: ["message.previous", "message.previous"],
  })
  assert.deepEqual(revealPlan({ ids, cursor: undefined, target: "m4", more: false }), {
    kind: "commands",
    commands: ["message.previous"],
  })
})

test("reveal plan steps back and forward when the cursor already owns the target's turn", () => {
  assert.deepEqual(revealPlan({ ids, cursor: "m2", target: "m2", more: false }), {
    kind: "commands",
    commands: ["message.previous", "message.next"],
  })
})

test("reveal plan for the first prompt loads older history or scrolls to the top", () => {
  assert.deepEqual(revealPlan({ ids, cursor: "m1", target: "m1", more: true }), { kind: "load" })
  assert.deepEqual(revealPlan({ ids, cursor: "m1", target: "m1", more: false }), { kind: "top" })
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
