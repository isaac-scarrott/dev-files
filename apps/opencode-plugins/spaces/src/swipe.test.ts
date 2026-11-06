import assert from "node:assert/strict"
import { test } from "node:test"
import { idleSwipe, release, swipe, type SwipeAction, type SwipeState } from "./swipe"

const run = (events: { dx: number; dy: number; at: number }[], options: { atEnd?: boolean } = {}) => {
  let state: SwipeState = idleSwipe()
  const actions: SwipeAction[] = []
  for (const event of events) {
    const step = swipe(state, event, { atEnd: options.atEnd ?? false })
    state = step.state
    actions.push(step.action)
  }
  return { state, actions, kinds: actions.map((action) => action.type) }
}
const burst = (dx: number, count: number, start = 0, dy = 0) =>
  Array.from({ length: count }, (_, index) => ({ dx, dy, at: start + index * 16 }))

test("a horizontal burst past the threshold changes space once, and its tail is swallowed", () => {
  const { kinds, state } = run([...burst(-20, 8), ...burst(-20, 10, 200)])
  assert.equal(kinds.filter((kind) => kind === "switch").length, 1)
  assert.equal(state.phase, "cool")
})

test("swiping left goes back a space, swiping right goes on", () => {
  assert.deepEqual(run(burst(-25, 5)).actions.find((action) => action.type === "switch"), { type: "switch", direction: -1 })
  assert.deepEqual(run(burst(25, 5)).actions.find((action) => action.type === "switch"), { type: "switch", direction: 1 })
})

test("a vertical scroll is left to the list", () => {
  const { kinds } = run([{ dx: 1, dy: 18, at: 0 }, { dx: 2, dy: 30, at: 16 }, { dx: 90, dy: 40, at: 32 }])
  assert.ok(!kinds.includes("switch"), "once the gesture is vertical it stays vertical")
})

test("a short movement does not change space", () => {
  const { kinds } = run(burst(-12, 3))
  assert.ok(!kinds.includes("switch"))
})

test("progress reports the travel so the strip can follow the finger", () => {
  const { actions } = run([{ dx: -10, dy: 0, at: 0 }, { dx: -20, dy: 0, at: 16 }])
  assert.deepEqual(actions[1], { type: "progress", offset: -30, revealed: false })
})

test("past the threshold the direction is re-armed only after a pause", () => {
  const events = [
    ...burst(20, 5, 0),
    ...burst(-20, 5, 400),
  ]
  const { actions } = run(events)
  const switches = actions.filter((action) => action.type === "switch")
  assert.equal(switches.length, 2, "a second, later gesture works")
  assert.deepEqual(switches.map((action) => (action as { direction: number }).direction), [1, -1])
})

test("at the last space, swiping on reveals the plus, then creates one space", () => {
  const revealed = run(burst(12, 5), { atEnd: true })
  assert.ok(revealed.actions.some((action) => action.type === "progress" && action.revealed))
  const created = run(burst(30, 6), { atEnd: true })
  assert.equal(created.kinds.filter((kind) => kind === "create").length, 1)
})

test("at the last space, swiping back still changes space", () => {
  const { actions } = run(burst(-25, 5), { atEnd: true })
  assert.deepEqual(actions.find((action) => action.type === "switch"), { type: "switch", direction: -1 })
})

test("a momentum tail after create does not create twice", () => {
  const { kinds } = run([...burst(40, 10), ...burst(40, 10, 200)], { atEnd: true })
  assert.equal(kinds.filter((kind) => kind === "create").length, 1)
})

test("releasing resets travel and the reveal", () => {
  const { state } = run(burst(12, 4), { atEnd: true })
  const after = release(state)
  assert.deepEqual(after, { phase: "idle", dx: 0, at: state.at, revealed: false })
})

test("a tiny jitter never starts a gesture", () => {
  const { state } = run([{ dx: 1, dy: -1, at: 0 }, { dx: -1, dy: 1, at: 16 }])
  assert.equal(state.phase, "idle")
})
