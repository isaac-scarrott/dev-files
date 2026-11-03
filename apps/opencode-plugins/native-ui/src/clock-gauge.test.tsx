import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { createRoot, createSignal } from "solid-js"
import { render } from "solid-js/web"
import { MINUTE } from "./chip-time.js"
import { ClockGaugeIcon, clockGaugeChipCss, clockGaugeIconCss, clockMasks, createChipClock, createMinuteTick, useMinute, type MinuteTick } from "./clock-gauge.js"
import { anyFired, clockPose, fired, gaugeTurn, GAUGE_SWEEP, soonestPose, type ClockInput } from "./clock-pose.js"
import { laneChipCss } from "./lane-chip-rows.js"

const at = (minutes: number, now = 0): ClockInput => ({ nextRun: now + minutes * MINUTE })

test("the minute hand: 12 o'clock at 0, 5 degrees per minute left, the far position at 60 minutes and beyond", () => {
  assert.equal(gaugeTurn(0), 0)
  assert.equal(gaugeTurn(-5 * MINUTE), 0, "a run that is late is due, not negative")
  assert.equal(gaugeTurn(MINUTE), 5)
  assert.equal(gaugeTurn(30 * MINUTE), 150)
  assert.equal(gaugeTurn(59 * MINUTE), 295)
  assert.equal(gaugeTurn(60 * MINUTE), GAUGE_SWEEP)
  assert.equal(gaugeTurn(61 * MINUTE), GAUGE_SWEEP)
  assert.equal(gaugeTurn(3 * 24 * 60 * MINUTE), GAUGE_SWEEP)
  assert.ok(GAUGE_SWEEP < 360, "the far position is not 12 o'clock, which paused and due use")
  assert.equal(gaugeTurn(29 * MINUTE + 59_000), 145, "whole minutes, rounded down")
})

test("a pose: live at its gauge position, due under a minute, rest when paused or without a next run", () => {
  assert.deepEqual(clockPose(at(15), 0), { state: "live", turn: 75 })
  assert.deepEqual(clockPose(at(90), 0), { state: "live", turn: GAUGE_SWEEP })
  assert.deepEqual(clockPose(at(2), 0), { state: "live", turn: 10 })
  assert.deepEqual(clockPose({ nextRun: 59_000 }, 0), { state: "due", turn: 0 })
  assert.deepEqual(clockPose({ nextRun: 0 }, 0), { state: "due", turn: 0 })
  assert.deepEqual(clockPose({ nextRun: 10 * MINUTE, paused: true }, 0), { state: "rest", turn: 0 }, "paused, which is also what the loop guard sets")
  assert.deepEqual(clockPose({}, 0), { state: "rest", turn: 0 })
  assert.deepEqual(clockPose(undefined, 0), { state: "rest", turn: 0 }, "nothing scheduled: the rest pose")
})

test("the chip shows the soonest schedule that is counting down; paused ones do not count", () => {
  const soonest = soonestPose([at(40), at(12), { nextRun: 2 * MINUTE, paused: true }, at(25)], 0)
  assert.deepEqual(soonest, { state: "live", turn: 60 })
  assert.deepEqual(soonestPose([{ nextRun: MINUTE / 2, paused: true }, at(8)], 0), { state: "live", turn: 40 })
  assert.deepEqual(soonestPose([{ nextRun: MINUTE * 3, paused: true }], 0), { state: "rest", turn: 0 }, "all paused")
  assert.deepEqual(soonestPose([], 0), { state: "rest", turn: 0 })
  assert.equal(soonestPose([at(0.5), at(40)], 0).state, "due")
})

test("a lap is a fire: the run count going up, never a first look or a count going down", () => {
  assert.equal(fired(undefined, 3), false)
  assert.equal(fired(3, undefined), false)
  assert.equal(fired(3, 3), false)
  assert.equal(fired(3, 2), false)
  assert.equal(fired(3, 4), true)
  assert.equal(anyFired(new Map([["a", 1]]), new Map([["a", 1], ["b", 4]])), false, "a schedule that is new is not a fire")
  assert.equal(anyFired(new Map([["a", 1], ["b", 4]]), new Map([["a", 1]])), false)
  assert.equal(anyFired(new Map([["a", 1], ["b", 4]]), new Map([["a", 1], ["b", 5]])), true)
})

test("one shared timer, started by the first subscriber and gone with the last", () => {
  const tick = createMinuteTick()
  mock.timers.enable({ apis: ["setInterval"] })
  try {
    assert.deepEqual(tick.stats(), { listeners: 0, running: false }, "zero cost when no schedule exists")
    let a = 0
    let b = 0
    const stopA = tick.watch(() => a++)
    const stopB = tick.watch(() => b++)
    assert.deepEqual(tick.stats(), { listeners: 2, running: true })
    mock.timers.tick(MINUTE - 1)
    assert.deepEqual([a, b], [0, 0])
    mock.timers.tick(1)
    assert.deepEqual([a, b], [1, 1], "one tick reaches every clock")
    mock.timers.tick(MINUTE * 3)
    assert.deepEqual([a, b], [4, 4], "once a minute, nothing in between")
    stopA()
    assert.equal(tick.stats().running, true)
    stopB()
    assert.deepEqual(tick.stats(), { listeners: 0, running: false })
    stopB()
    assert.equal(tick.stats().running, false)
  } finally {
    mock.timers.reset()
  }
})

test("a tick made in setup is cleared with its owner even if a clock never unsubscribed", () => {
  mock.timers.enable({ apis: ["setInterval"] })
  try {
    let made!: MinuteTick
    const dispose = createRoot((dispose) => {
      made = createMinuteTick()
      made.watch(() => {})
      return dispose
    })
    assert.deepEqual(made.stats(), { listeners: 1, running: true })
    dispose()
    assert.equal(made.stats().running, false)
  } finally {
    mock.timers.reset()
  }
})

test("the timer exists only while a clock has something to count down, and a disposed owner leaves none", () => {
  const tick = createMinuteTick()
  mock.timers.enable({ apis: ["setInterval", "Date"] })
  try {
    const [active, setActive] = createSignal(false)
    let now!: () => number
    const dispose = createRoot((dispose) => {
      now = useMinute(tick, active)
      return dispose
    })
    assert.equal(tick.stats().running, false)
    setActive(true)
    assert.deepEqual(tick.stats(), { listeners: 1, running: true })
    const before = now()
    mock.timers.tick(MINUTE)
    assert.equal(now() - before, MINUTE)
    setActive(false)
    assert.equal(tick.stats().running, false, "no schedule left: the timer is stopped")
    setActive(true)
    assert.equal(tick.stats().listeners, 1)
    dispose()
    assert.deepEqual(tick.stats(), { listeners: 0, running: false }, "hot reload disposes the owner: one timer is never two")
  } finally {
    mock.timers.reset()
  }
})

test("a row's clock: its own gauge, the state on the span, the angle as a custom property", () => {
  const tick = createMinuteTick()
  mock.timers.enable({ apis: ["setInterval", "Date"] })
  const host = document.createElement("div")
  document.body.append(host)
  try {
    const [input, setInput] = createSignal<ClockInput | undefined>({ nextRun: Date.now() + 30 * MINUTE })
    const dispose = render(() => <ClockGaugeIcon tick={tick} input={input()} />, host)
    const icon = host.querySelector<HTMLElement>('[data-icon="clock-gauge"]')!
    assert.equal(icon.dataset.state, "live")
    assert.equal(icon.style.getPropertyValue("--clock-turn"), "150deg")
    assert.deepEqual([...icon.children].map((child) => (child as HTMLElement).dataset.part), ["face", "hand"])
    mock.timers.tick(MINUTE)
    assert.equal(icon.style.getPropertyValue("--clock-turn"), "145deg", "the minute tick moves it")
    setInput({ nextRun: Date.now() + 10 * 1000 })
    assert.equal(icon.dataset.state, "due")
    assert.equal(icon.style.getPropertyValue("--clock-turn"), "0deg")
    setInput({ nextRun: Date.now() + 5 * MINUTE, paused: true })
    assert.equal(icon.dataset.state, "rest")
    assert.equal(icon.style.getPropertyValue("--clock-turn"), "0deg")
    assert.equal(tick.stats().running, false, "paused: nothing counts down, no timer")
    setInput(undefined)
    assert.equal(icon.dataset.state, "rest")
    dispose()
  } finally {
    mock.timers.reset()
    host.remove()
  }
})

test("the due moment is not left to the minute tick: one timeout at the minute before a run, none further out", () => {
  const tick = createMinuteTick()
  mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"] })
  const host = document.createElement("div")
  document.body.append(host)
  try {
    const input = { nextRun: Date.now() + 90_000 }
    const dispose = render(() => <ClockGaugeIcon tick={tick} input={input} />, host)
    const icon = host.querySelector<HTMLElement>('[data-icon="clock-gauge"]')!
    assert.equal(icon.dataset.state, "live")
    mock.timers.tick(29_000)
    assert.equal(icon.dataset.state, "live")
    mock.timers.tick(1_100)
    assert.equal(icon.dataset.state, "due", "30s in: a minute left, on time, between two minute ticks")
    dispose()
    const later = { nextRun: Date.now() + 10 * MINUTE }
    const far = render(() => <ClockGaugeIcon tick={tick} input={later} />, host)
    assert.equal(tick.stats().listeners, 1)
    mock.timers.tick(MINUTE)
    assert.equal(host.querySelector<HTMLElement>('[data-icon="clock-gauge"]')!.style.getPropertyValue("--clock-turn"), "45deg")
    assert.equal(tick.stats().listeners, 1)
    far()
  } finally {
    mock.timers.reset()
    host.remove()
  }
})

test("a row laps once per run: the lap letter flips when the run count goes up and not otherwise", () => {
  const tick = createMinuteTick()
  const host = document.createElement("div")
  document.body.append(host)
  const [input, setInput] = createSignal<ClockInput>({ nextRun: Date.now() + 5 * MINUTE, runs: 2 })
  const dispose = render(() => <ClockGaugeIcon tick={tick} input={input()} />, host)
  const icon = host.querySelector<HTMLElement>('[data-icon="clock-gauge"]')!
  assert.equal(icon.dataset.lap, undefined, "mounting is not a fire")
  setInput({ nextRun: Date.now() + 5 * MINUTE, runs: 2 })
  setInput({ nextRun: Date.now() + 4 * MINUTE, runs: 2 })
  assert.equal(icon.dataset.lap, undefined)
  setInput({ nextRun: Date.now() + 10 * MINUTE, runs: 3 })
  assert.equal(icon.dataset.lap, "a")
  setInput({ nextRun: Date.now() + 9 * MINUTE, runs: 3 })
  assert.equal(icon.dataset.lap, "a", "once per run")
  setInput({ nextRun: Date.now() + 10 * MINUTE, runs: 4 })
  assert.equal(icon.dataset.lap, "b", "the next run restarts the animation")
  dispose()
  host.remove()
})

test("a still clock (the timeline row) never moves, laps or starts a timer", () => {
  const tick = createMinuteTick()
  const host = document.createElement("div")
  document.body.append(host)
  const [runs, setRuns] = createSignal(1)
  const dispose = render(() => <ClockGaugeIcon tick={tick} still input={{ nextRun: Date.now() + 20 * MINUTE, runs: runs() }} />, host)
  const icon = host.querySelector<HTMLElement>('[data-icon="clock-gauge"]')!
  assert.equal(icon.dataset.state, "still")
  assert.equal(icon.style.getPropertyValue("--clock-turn"), "0deg")
  setRuns(2)
  assert.equal(icon.dataset.lap, undefined)
  assert.equal(tick.stats().running, false)
  dispose()
  host.remove()
})

test("the chip's clock is written on the root: the soonest schedule, a lap on a fire in the same session, removed with the owner", () => {
  const tick = createMinuteTick()
  const root = document.createElement("div")
  mock.timers.enable({ apis: ["setInterval", "Date"] })
  try {
    const now = Date.now()
    const [source, setSource] = createSignal<{ key: string; items: { id: string; nextRun: number; runs: number; paused?: boolean }[] } | undefined>({
      key: "s1",
      items: [
        { id: "a", nextRun: now + 40 * MINUTE, runs: 0 },
        { id: "b", nextRun: now + 12 * MINUTE, runs: 0 },
      ],
    })
    const dispose = createRoot((dispose) => {
      createChipClock(tick, source, root)
      return dispose
    })
    assert.equal(root.dataset.chipClock, "live")
    assert.equal(root.style.getPropertyValue("--clock-turn"), "60deg")
    assert.equal(tick.stats().listeners, 1)
    mock.timers.tick(2 * MINUTE)
    assert.equal(root.style.getPropertyValue("--clock-turn"), "50deg")
    assert.equal(root.dataset.chipClockLap, undefined)

    // b fires and is rescheduled; a is the soonest now.
    setSource({ key: "s1", items: [{ id: "a", nextRun: now + 38 * MINUTE, runs: 0 }, { id: "b", nextRun: now + 130 * MINUTE, runs: 1 }] })
    assert.equal(root.dataset.chipClockLap, "a")
    assert.equal(root.style.getPropertyValue("--clock-turn"), "180deg")
    setSource({ key: "s1", items: [{ id: "a", nextRun: now + 37 * MINUTE, runs: 0 }, { id: "b", nextRun: now + 130 * MINUTE, runs: 1 }] })
    assert.equal(root.dataset.chipClockLap, "a", "once per run")

    // Another session with other counts is not a fire.
    setSource({ key: "s2", items: [{ id: "b", nextRun: now + 130 * MINUTE, runs: 7 }] })
    assert.equal(root.dataset.chipClockLap, "a")
    assert.equal(root.style.getPropertyValue("--clock-turn"), "300deg")

    setSource({ key: "s2", items: [{ id: "b", nextRun: now + 130 * MINUTE, runs: 7, paused: true }] })
    assert.equal(root.dataset.chipClock, "rest")
    assert.equal(root.style.getPropertyValue("--clock-turn"), "0deg")

    setSource(undefined)
    assert.equal(tick.stats().running, false, "no schedule: no timer")
    dispose()
    assert.equal(root.dataset.chipClock, undefined)
    assert.equal(root.style.getPropertyValue("--clock-turn"), "")
  } finally {
    mock.timers.reset()
  }
})

test("the due moment is the state itself: one tick when the state is entered, which a CSS animation plays once", () => {
  const css = clockGaugeIconCss + clockGaugeChipCss
  assert.match(css, /\[data-state="due"\] > \[data-part="hand"\] \{ animation: clock-tick 480ms/)
  assert.match(css, /data-chip-clock="due"\] [^{]*::after \{ animation: clock-tick 480ms/)
  assert.doesNotMatch(css, /clock-tick[^;]*infinite/)
  assert.doesNotMatch(css, /clock-lap[^;]*infinite/)
})

test("only transform moves: no mask, clip-path, filter, composition or will-change in any animation, and the masks are static", () => {
  const all = clockGaugeIconCss + clockGaugeChipCss
  const frames = [...all.matchAll(/@keyframes [\w-]+ \{(?:[^{}]*\{[^{}]*\})+[^{}]*\}/g)].map((m) => m[0])
  assert.equal(frames.length, 3)
  for (const frame of frames) {
    const props = new Set([...frame.matchAll(/\b([a-z-]+):/g)].map((m) => m[1]))
    assert.deepEqual([...props], ["transform"], frame)
  }
  assert.doesNotMatch(all, /clip-path|animation-composition|will-change|@property|requestAnimationFrame/)
  assert.doesNotMatch(all, /transition: [^;}]*mask/)
  assert.doesNotMatch(all, /animation: [^;}]*mask/)
  assert.doesNotMatch(clockMasks.face + clockMasks.hand, /animate/i)
  assert.ok(laneChipCss.includes(clockGaugeChipCss.trim().split("\n")[0]!) && laneChipCss.includes(clockGaugeIconCss.trim().split("\n")[1]!))
})

test("the hand rotates about the centre of its 16 unit box and only the angle changes", () => {
  assert.match(clockMasks.hand, /M8%208V4/)
  assert.match(clockMasks.face, /circle%20cx%3D'8'%20cy%3D'8'%20r%3D'6'/)
  assert.match(clockGaugeIconCss, /transform: rotate\(var\(--clock-turn, 0deg\)\); transition: transform 360ms cubic-bezier/)
  assert.doesNotMatch(clockGaugeIconCss + clockGaugeChipCss, /transform-origin/, "the default is the centre of the box, where the stroke starts")
})

test("reduced motion, by the media query and by the app's setting: same states, positions instant, no tick, no lap", () => {
  const lapKey = new Map([[clockGaugeIconCss, "data-lap"], [clockGaugeChipCss, "data-chip-clock-lap"]])
  for (const css of [clockGaugeIconCss, clockGaugeChipCss]) {
    const media = css.match(/@media \(prefers-reduced-motion: reduce\) \{([^}]*)\}/)?.[1] ?? ""
    const setting = css.match(/(:root\[data-motion="reduce"\][^{]*\{[^}]*\})/s)?.[1] ?? ""
    for (const block of [media, setting]) {
      assert.match(block, /animation: none !important; transition: none !important;/)
      assert.match(block, /\[data-(?:part="hand"|[a-z-]+)|::after/)
      for (const lap of ["a", "b"]) assert.ok(block.includes(`${lapKey.get(css)}="${lap}"`), `${lap} lap is switched off`)
      assert.ok(block.includes('"due"'), "the tick is switched off")
    }
    assert.ok(css.indexOf('data-motion="reduce"') > css.indexOf("animation: clock-lap-b"), "after the rules it overrides")
  }
})

test("states set the ink: base while counting down, muted at rest; the capsule's own geometry is the 14px slot the svg had", () => {
  assert.match(clockGaugeChipCss, /data-chip-clock="rest"\] [^{]*\{ --clock-ink: var\(--v2-icon-icon-muted\)/)
  assert.match(clockGaugeChipCss, /data-chip-clock="live"\] [^{]*, :root\[data-chip-clock="due"\] [^{]*\{ --clock-ink: var\(--v2-icon-icon-base\)/)
  assert.match(clockGaugeChipCss, /::before \{ content: ""; display: block; flex: none; width: 14px; height: 14px;/)
  assert.match(clockGaugeChipCss, /::after \{[^}]*width: 14px; height: 14px;[^}]*position: absolute; inset-block: 0; inset-inline-start: 10px; margin: auto 0;/)
  assert.match(clockGaugeChipCss, /> svg \{ display: none; \}/)
  assert.match(clockGaugeIconCss, /width: 16px; height: 16px;/)
})
