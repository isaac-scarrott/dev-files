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
const switches = (actions: SwipeAction[]) => actions.flatMap((action) => (action.type === "switch" ? [action.direction] : []))

// A trackpad gesture as macOS sends it: one event a frame, the stroke easing in and out with the jitter Chromium's
// coalescing adds (a frame that carries two events, then a light one), then the momentum tail decaying from the lift
// speed until it dies. No pause anywhere, and no phase: a DOM WheelEvent has none.
const jitter = [1, 1.15, 0.9, 1.6, 0.55, 1.05, 0.85, 1.2]
function stroke(sign: 1 | -1, peak: number, options: { events?: number; tail?: number; decay?: number } = {}) {
  const events = options.events ?? 8
  const deltas: number[] = []
  for (let index = 0; index < events; index++) {
    const ease = Math.sin(((index + 1) / (events + 1)) * Math.PI)
    deltas.push(Math.max(1, peak * ease * jitter[index % jitter.length]!))
  }
  // Momentum starts at the speed the fingers lifted at, never above it, and only falls.
  let speed = Math.max(deltas.at(-1)!, peak * 0.6)
  for (let index = 0; index < (options.tail ?? 200) && speed >= 0.5; index++) {
    deltas.push(speed)
    speed *= options.decay ?? 0.94
  }
  return deltas.map((delta) => sign * Math.round(delta * 2) / 2)
}
/** Gestures back to back, 16ms apart throughout: each new one cuts the tail before it short, as touching the pad does. */
const gestures = (...strokes: number[][]) => strokes.flat().map((dx, index) => ({ dx, dy: 0, at: 1 + index * 16 }))

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

test("a pause ends the gesture: the next swipe changes space again", () => {
  const { actions } = run([...burst(20, 5, 0), ...burst(-20, 5, 400)])
  assert.deepEqual(switches(actions), [1, -1])
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

test("letting go of a full pull creates, and the rest of that gesture is swallowed", () => {
  const pulled = run(burst(30, 20), { atEnd: true })
  assert.equal(pulled.state.pull, 1)
  const step = release(pulled.state)
  assert.equal(step.create, true)
  let state = step.state
  const kinds: string[] = []
  for (const event of burst(30, 20, 20 * 16)) {
    const next = swipe(state, event, { atEnd: true })
    state = next.state
    kinds.push(next.action.type)
  }
  assert.ok(kinds.every((kind) => kind === "none"), "the momentum after the release does not pull a second slot open")
})

test("a quiet spell short of a full pull changes nothing: the events' own times decide whether the gesture paused", () => {
  const partial = run(burst(10, 8), { atEnd: true })
  assert.ok(partial.state.pull > 0 && partial.state.pull < 1)
  assert.deepEqual(release(partial.state), { state: partial.state, create: false })
  // A page busy for longer than the timer still delivers the tail with its trackpad times: one gesture, one change.
  const changed = run(burst(-20, 8))
  assert.deepEqual(release(changed.state), { state: changed.state, create: false })
  assert.deepEqual(switches(run([...burst(-20, 8), ...burst(-20, 10, 8 * 16)]).actions), [-1])
})

test("a tiny jitter never starts a gesture", () => {
  const { state } = run([{ dx: 1, dy: -1, at: 0 }, { dx: -1, dy: 1, at: 16 }])
  assert.equal(state.phase, "idle")
})

test("one gesture with a long momentum tail changes space once", () => {
  const events = gestures(stroke(1, 40))
  assert.ok(events.length >= 60, "the tail runs on for dozens of events")
  assert.deepEqual(switches(run(events).actions), [1])
})

test("a strong, fast stroke that is still speeding up when it changes space does not change it twice", () => {
  assert.deepEqual(switches(run(gestures(stroke(-1, 90, { events: 14 }))).actions), [-1])
})

test("a slow drag that never pauses changes space once", () => {
  assert.deepEqual(switches(run(gestures(stroke(1, 7, { events: 80, tail: 30 }))).actions), [1])
})

test("a tail that flickers as it dies never counts as a new gesture", () => {
  const tail = [...stroke(1, 40, { tail: 20 }), 2, 1, 2, 1, 1.5, 3, 1, 2, 2.5, 1, 1, 0.5, 0]
  assert.deepEqual(switches(run(gestures(tail)).actions), [1])
})

test("a second swipe after the first has died down changes space again, with no pause between", () => {
  assert.deepEqual(switches(run(gestures(stroke(1, 40), stroke(1, 40))).actions), [1, 1])
})

test("without the flag, three quick swipes change space three times, each once the last tail has died down", () => {
  // Ten tail events, 160ms: the tail has fallen to a third of its peak and the next stroke climbs well clear of it.
  const quick = () => stroke(1, 35, { events: 6, tail: 10 })
  const { actions } = run(gestures(quick(), quick(), quick()))
  assert.deepEqual(switches(actions), [1, 1, 1])
})

test("without the flag, a lighter swipe after a hard one counts once it climbs to twice what is left of the tail", () => {
  assert.deepEqual(switches(run(gestures(stroke(-1, 80, { tail: 40 }), stroke(-1, 20, { events: 10 }))).actions), [-1, -1])
})

test("swiping back during the tail changes space back", () => {
  assert.deepEqual(switches(run(gestures(stroke(1, 40, { tail: 10 }), stroke(-1, 30))).actions), [1, -1])
})

test("a wobble against the swipe is not a swing back", () => {
  const wobble = [...stroke(1, 40, { tail: 6 }), -2, 3, -1, 2]
  assert.deepEqual(switches(run(gestures(wobble)).actions), [1])
})

test("after a change to the last space, the next swipe on opens the new-space slot", () => {
  let state = idleSwipe()
  let atEnd = false
  const kinds: string[] = []
  let peak = 0
  for (const event of gestures(stroke(1, 40, { tail: 10 }), stroke(1, 40, { events: 14 }))) {
    const step = swipe(state, event, { atEnd })
    state = step.state
    kinds.push(step.action.type)
    if (step.action.type === "switch") atEnd = true
    if (step.action.type === "progress") peak = Math.max(peak, step.action.pull)
  }
  assert.equal(kinds.filter((kind) => kind === "switch").length, 1)
  assert.equal(peak, 1, "the second swipe pulls the slot full")
})

test("a scroll down the list, then a sideways swipe, changes space without waiting for a pause", () => {
  const scroll = stroke(1, 30).map((dy) => ({ dx: 0, dy }))
  const side = stroke(1, 40).map((dx) => ({ dx, dy: 0 }))
  const events = [...scroll, ...side].map((event, index) => ({ ...event, at: 1 + index * 16 }))
  const { actions } = run(events)
  assert.deepEqual(switches(actions), [1])
  assert.ok(actions.slice(0, scroll.length).every((action) => action.type === "none"), "the scroll itself is the list's")
})

test("events merged while the page is busy after a change do not look like a new swipe", () => {
  // The switch re-renders the sidebar; Chromium hands the tail that queued meanwhile over as one large event, then
  // another few merged ones as it catches up. By size they spike; by speed they are the same decaying tail.
  const tail = stroke(1, 40)
  const events = gestures(tail)
  const commit = run(events).actions.findIndex((action) => action.type === "switch")
  const merged: { dx: number; dy: number; at: number }[] = events.slice(0, commit + 1)
  let index = commit + 1
  for (const size of [6, 1, 3, 5, 1, 1]) {
    const group = events.slice(index, index + size)
    index += size
    merged.push({ dx: group.reduce((sum, event) => sum + event.dx, 0), dy: 0, at: group.at(-1)!.at })
  }
  merged.push(...events.slice(index))
  assert.deepEqual(switches(run(merged).actions), [1])
})

// Chromium 151+ marks the OS's inertia with `WheelEvent.momentum`. Where it does, the flag decides; the shape is the
// fallback for engines and devices that leave it unset.
const flagged = (sign: 1 | -1, peak: number, options: { events?: number; tail?: number } = {}) => {
  const events = options.events ?? 8
  return stroke(sign, peak, options).map((dx, index) => ({ dx, momentum: index >= events }))
}
const timed = (...strokes: { dx: number; momentum: boolean }[][]) =>
  strokes.flat().map((event, index) => ({ ...event, dy: 0, at: 1 + index * 16 }))

test("with the momentum flag, a tail however lively never changes space again", () => {
  // A tail that by shape alone would read as a new stroke: it dips and surges. The flag says it is still inertia.
  const tail = flagged(1, 40, { tail: 10 }).concat([2, 30, 60, 90, 90, 90].map((dx) => ({ dx, momentum: true })))
  assert.deepEqual(switches(run(timed(tail)).actions), [1])
})

test("with the momentum flag, the fingers moving after the tail are a new swipe at once", () => {
  // The second stroke starts at full speed straight out of a strong tail, which the shape alone would miss.
  const second = Array.from({ length: 4 }, () => ({ dx: 40, momentum: false }))
  assert.deepEqual(switches(run(timed(flagged(1, 60, { tail: 4 }), second)).actions), [1, 1])
})

test("with the momentum flag, three quick swipes change space three times", () => {
  const quick = () => flagged(-1, 35, { events: 6, tail: 5 })
  assert.deepEqual(switches(run(timed(quick(), quick(), quick())).actions), [-1, -1, -1])
})

test("inertia with no gesture under way starts nothing", () => {
  const tail = Array.from({ length: 30 }, (_, index) => ({ dx: 40 * 0.95 ** index, momentum: true }))
  assert.deepEqual(run(timed(tail)).kinds.filter((kind) => kind !== "none"), [])
})
