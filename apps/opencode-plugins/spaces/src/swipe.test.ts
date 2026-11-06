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

test("however long the swipe runs without pausing, it changes space only once", () => {
  // A trackpad swipe with momentum: hundreds of events, 16ms apart, far past any timeout.
  const { kinds } = run(burst(-6, 400))
  assert.equal(kinds.filter((kind) => kind === "switch").length, 1)
})

test("a second, deliberate swipe after the gesture ends changes space again", () => {
  // The wheel binding ends a gesture with `release` after a pause; until then nothing more happens.
  let state = idleSwipe()
  const switches: number[] = []
  for (const event of burst(20, 6, 0)) {
    const step = swipe(state, event, { atEnd: false })
    state = step.state
    if (step.action.type === "switch") switches.push(step.action.direction)
  }
  state = release(state)
  for (const event of burst(-20, 6, 400)) {
    const step = swipe(state, event, { atEnd: false })
    state = step.state
    if (step.action.type === "switch") switches.push(step.action.direction)
  }
  assert.deepEqual(switches, [1, -1])
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

test("progress reports the travel, and the pull that opens the new-space slot", () => {
  const { actions } = run([{ dx: -10, dy: 0, at: 0 }, { dx: -20, dy: 0, at: 16 }])
  assert.deepEqual(actions[1], { type: "progress", offset: -30, pull: 0, revealed: false })
})

test("past the threshold the direction is re-armed only after a pause", () => {
  const first = run(burst(20, 5, 0))
  const second = run(burst(-20, 5, 400))
  assert.deepEqual(first.actions.find((action) => action.type === "switch"), { type: "switch", direction: 1 })
  assert.deepEqual(second.actions.find((action) => action.type === "switch"), { type: "switch", direction: -1 })
})

test("at the last space, the slot opens under a pull and only fills when dragged far", () => {
  const short = run(burst(10, 8), { atEnd: true })
  const pulls = short.actions.filter((action) => action.type === "progress").map((action) => (action as { pull: number }).pull)
  assert.ok(pulls.some((pull) => pull > 0 && pull < 1), "a light drag only opens it part way")
  assert.equal(short.kinds.filter((kind) => kind === "create").length, 0, "and never creates")
  const hard = run(burst(30, 20), { atEnd: true })
  const peek = hard.actions.filter((action) => action.type === "progress").map((action) => (action as { pull: number }).pull)
  assert.equal(Math.max(...peek), 1, "a real pull fills the slot")
  assert.equal(hard.kinds.filter((kind) => kind === "create").length, 0, "creating is the release, not the drag")
})

test("the pull resists: the same finger travel opens less and less of the slot", () => {
  const { actions } = run(burst(6, 30), { atEnd: true })
  const pulls = actions.flatMap((action) => (action.type === "progress" ? [action.pull] : []))
  const growing = pulls.filter((pull) => pull > 0)
  assert.ok(growing.length > 2)
  const steps = growing.slice(1).map((pull, index) => pull - growing[index]!)
  assert.ok(steps.every((step) => step <= 0.05), "no single event fills the slot")
})

test("at the last space, swiping back still changes space", () => {
  const { actions } = run(burst(-25, 5), { atEnd: true })
  assert.deepEqual(actions.find((action) => action.type === "switch"), { type: "switch", direction: -1 })
})

test("a momentum tail never creates on its own", () => {
  const { kinds } = run([...burst(40, 10), ...burst(40, 10, 200)], { atEnd: true })
  assert.equal(kinds.filter((kind) => kind === "create").length, 0)
})

test("releasing resets travel and the reveal", () => {
  const { state } = run(burst(12, 4), { atEnd: true })
  const after = release(state)
  assert.deepEqual(after, { phase: "idle", dx: 0, at: state.at, revealed: false, pull: 0 })
})

test("a tiny jitter never starts a gesture", () => {
  const { state } = run([{ dx: 1, dy: -1, at: 0 }, { dx: -1, dy: 1, at: 16 }])
  assert.equal(state.phase, "idle")
})
