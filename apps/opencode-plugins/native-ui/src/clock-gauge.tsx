import { createKeyed } from "@opencode/plugin/gui"
import { createMemo, createSignal, getOwner, onCleanup, type Accessor } from "solid-js"
import { MINUTE } from "./chip-time"
import { anyFired, clockPose, fired, REST, soonestPose, soonestDue, type ClockInput, type ClockPose } from "./clock-pose"

// The schedule clock (see clock-pose.ts for what the hand means). Two ways to draw one, one set of rules:
//   rows   `ClockGaugeIcon`: a 16px span with a face child and a minute-hand child (popover rows: each row's own schedule; the timeline
//          row: at rest).
//   chip   the host's `ComposerPill` takes catalog icon names only, so the pill names a placeholder icon, its svg is hidden, `::before`
//          is the face and `::after` the hand. The capsule cannot carry per-instance state, so `createChipClock` writes it on the root
//          element: `data-chip-clock` (live, due, rest), `--clock-turn` and `data-chip-clock-lap`.
// The face is a static mask (circle and the fixed hour hand); the hand is the same 16px box with a static mask of one stroke, rotated
// about the box centre. Only `transform` animates, so nothing repaints: a move is a 360ms transition, the due tick and the lap are
// one-shot keyframes. Nothing runs between changes; the angle is recomputed once a minute by one shared timer that exists only while
// a clock has something to count down.

/** The placeholder catalog icon a pill names where the catalog has no clock; its glyph is hidden and the clock drawn instead. */
export const CLOCK_PLACEHOLDER = "outline-rotate-clockwise" as const

export interface MinuteTick {
  /** Calls `listener` once a minute until the returned function is called. */
  watch(listener: () => void): () => void
  /** Subscribers, and whether the timer exists. */
  stats(): { listeners: number; running: boolean }
}

/**
 * The one timer every clock of a plugin shares: it starts with the first subscriber and is cleared with the last (or with the
 * owner), so a plugin with no schedule counting down has no timer and a reloaded plugin never leaves two. Make it once in `setup`
 * and hand it to the clocks.
 */
export function createMinuteTick(): MinuteTick {
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }
  if (getOwner()) onCleanup(stop)
  return {
    watch(listener) {
      listeners.add(listener)
      timer ??= setInterval(() => {
        for (const each of [...listeners]) each()
      }, MINUTE)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
    stats: () => ({ listeners: listeners.size, running: timer !== undefined }),
  }
}

/**
 * The time, refreshed once a minute while `active`; current as soon as it becomes active. `dueAt`, when given, is the moment the
 * clock turns due (a minute before a run): if that is less than a minute away, one timeout is set for it, so the due tick plays on
 * time instead of at the next minute tick. That timeout is the only other timer, set again after each tick, never a loop.
 */
export function useMinute(tick: MinuteTick | undefined, active: Accessor<boolean>, dueAt?: Accessor<number | undefined>): Accessor<number> {
  const [now, setNow] = createSignal(Date.now())
  createKeyed(
    () => tick !== undefined && active(),
    () => {
      setNow(Date.now())
      onCleanup(tick!.watch(() => setNow(Date.now())))
    },
  )
  // Keyed by the due time and the last tick: a tick (or a new next run) sets the timeout again.
  createKeyed(
    () => {
      const at = dueAt?.()
      return tick !== undefined && active() && at !== undefined ? `${at}:${now()}` : undefined
    },
    () => {
      const wait = dueAt!()! - Date.now()
      if (wait <= 0 || wait > MINUTE) return
      const timer = setTimeout(() => setNow(Date.now()), wait + 20)
      onCleanup(() => clearTimeout(timer))
    },
  )
  return now
}

const lapAfter = (lap: string) => (lap === "a" ? "b" : "a")

const SAME = (a: ClockPose, b: ClockPose) => a.state === b.state && a.turn === b.turn

type Item = ClockInput & { readonly id: string }

interface Looked {
  readonly key?: string
  readonly runs?: ReadonlyMap<string, number>
  readonly lap: string
}

/**
 * Keeps the chip's clock current: the soonest schedule of the session on screen sets the hand; a run that fires (the same
 * schedule's run count going up between two looks at the same session) laps it once. Writes on `root`; call inside `setup`.
 */
export function createChipClock(tick: MinuteTick, source: Accessor<{ readonly key: string; readonly items: readonly Item[] } | undefined>, root: HTMLElement = document.documentElement): void {
  const now = useMinute(
    tick,
    () => (source()?.items.length ?? 0) > 0,
    () => soonestDue(source()?.items ?? []),
  )
  const pose = createMemo(() => soonestPose(source()?.items ?? [], now()), REST, { equals: SAME })
  // The lap letter flips for each look at the same session in which a run count went up.
  const looked = createMemo<Looked>(
    (before) => {
      const value = source()
      if (!value) return { lap: before.lap }
      const runs = new Map(value.items.map((item) => [item.id, item.runs ?? 0]))
      const fire = before.key === value.key && before.runs !== undefined && anyFired(before.runs, runs)
      return { key: value.key, runs, lap: fire ? lapAfter(before.lap) : before.lap }
    },
    { lap: "" },
  )
  createKeyed(pose, (value) => {
    root.dataset.chipClock = value.state
    root.style.setProperty("--clock-turn", `${value.turn}deg`)
  })
  createKeyed(
    () => looked().lap,
    (lap) => {
      if (lap) root.dataset.chipClockLap = lap
    },
  )
  onCleanup(() => {
    delete root.dataset.chipClock
    delete root.dataset.chipClockLap
    root.style.removeProperty("--clock-turn")
  })
}

export interface ClockGaugeIconProps {
  /** The plugin's shared timer; a clock without one (or `still`) never refreshes. */
  tick?: MinuteTick
  /** The schedule this clock shows; absent is the rest pose. */
  input?: ClockInput
  /** Always at rest and in the surrounding colour (the timeline row, which is about a run that already happened). */
  still?: boolean
}

/** The clock for a row: `input`'s own time to next run as a gauge, a lap when its run count goes up. Needs `clockGaugeIconCss` in the document. */
export function ClockGaugeIcon(props: ClockGaugeIconProps) {
  const now = useMinute(
    props.still ? undefined : props.tick,
    () => props.input?.nextRun !== undefined && props.input.paused !== true,
    () => (props.input?.nextRun === undefined ? undefined : props.input.nextRun - MINUTE),
  )
  const pose = createMemo(() => (props.still ? REST : clockPose(props.input, now())), REST, { equals: SAME })
  const lap = createMemo<{ runs?: number; lap: string }>(
    (before) => {
      const runs = props.input?.runs
      return { runs, lap: !props.still && fired(before.runs, runs) ? lapAfter(before.lap) : before.lap }
    },
    { lap: "" },
  )
  return (
    <span data-slot="drawn-icon" data-icon="clock-gauge" data-state={props.still ? "still" : pose().state} data-lap={lap().lap || undefined} style={{ "--clock-turn": `${pose().turn}deg` }} aria-hidden="true">
      <span data-part="face" />
      <span data-part="hand" />
    </span>
  )
}

const svg = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='#000' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`

/** The same circle and 1px stroke as the host's other drawn icons (r6), with the fixed hour hand (8 to 5.5) at 12; the minute hand (8 to 4) is its own mask. */
export const clockMasks = {
  face: svg("<circle cx='8' cy='8' r='6'/><path d='M8 8V5.5'/>"),
  hand: svg("<path d='M8 8V4'/>"),
} as const

const EASE = "cubic-bezier(0.25, 0.7, 0.3, 1)"
const MOVE_MS = 360
const TICK_MS = 480
const LAP_MS = 700
const LAP_EASE = "cubic-bezier(0.45, 0, 0.55, 1)"
const INK = "--clock-ink"
const FACE = "--clock-face"

/** The stencil of one layer: the glyph in its ink colour (the face's never changes, the hand's eases when the clock changes state). */
const layer = (size: number, mask: string, ink: string) =>
  `content: ""; display: block; flex: none; width: ${size}px; height: ${size}px; background-color: var(${ink}); -webkit-mask: ${mask} center / 100% 100% no-repeat; mask: ${mask} center / 100% 100% no-repeat; transition: background-color ${MOVE_MS}ms ${EASE}; pointer-events: none;`

const handMotion = `transform: rotate(var(--clock-turn, 0deg)); transition: transform ${MOVE_MS}ms ${EASE}, background-color ${MOVE_MS}ms ${EASE};`
const reduced = (selector: string) => `:root[data-motion="reduce"] ${selector}`
const STILL = "animation: none !important; transition: none !important;"

interface Target {
  /** The element that carries the ink and the state, whatever the state. */
  all: string
  /** The same element in a state, or with a lap letter. */
  state(state: string): string
  lap(lap: string): string
  face(host: string): string
  hand(host: string): string
  size: number
  /** Extra declarations per layer (the chip positions the hand over the face). */
  faceCss?: string
  handCss?: string
  /** Extra declarations for the element itself. */
  allCss?: string
}

const rules = (t: Target) => {
  const hands = [t.hand(t.all), t.hand(t.state("due")), t.hand(t.lap("a")), t.hand(t.lap("b"))]
  return `
${t.all} { ${FACE}: var(--v2-icon-icon-muted); ${INK}: var(--v2-icon-icon-muted); ${t.allCss ?? ""} }
${t.face(t.all)} { ${layer(t.size, clockMasks.face, FACE)} ${t.faceCss ?? ""} }
${t.hand(t.all)} { ${layer(t.size, clockMasks.hand, INK)} ${handMotion} ${t.handCss ?? ""} }
${t.state("live")}, ${t.state("due")} { ${INK}: var(--v2-icon-icon-base); }
${t.state("rest")} { ${INK}: var(--v2-icon-icon-muted); }
${t.hand(t.state("due"))} { animation: clock-tick ${TICK_MS}ms ${EASE}; }
${t.hand(t.lap("a"))} { animation: clock-lap-a ${LAP_MS}ms ${LAP_EASE}; }
${t.hand(t.lap("b"))} { animation: clock-lap-b ${LAP_MS}ms ${LAP_EASE}; }
@media (prefers-reduced-motion: reduce) { ${hands.join(", ")}, ${t.face(t.all)} { ${STILL} } }
${hands.map(reduced).join(", ")}, ${reduced(t.face(t.all))} { ${STILL} }
`
}

const ROW = '[data-slot="drawn-icon"][data-icon="clock-gauge"]'

/** Timeline of the hand, all `transform`: the due tick is a small nudge past 12 and back (a clock's tick: 13 degrees, under 1px at the tip); a lap is one full turn from 12 that ends on the new gauge position (`a` and `b` alternate so a second lap restarts the animation). */
export const clockKeyframes = `@keyframes clock-tick { 0% { transform: rotate(5deg); } 35% { transform: rotate(-8deg); } 100% { transform: rotate(0deg); } }
@keyframes clock-lap-a { from { transform: rotate(0deg); } to { transform: rotate(calc(var(--clock-turn, 0deg) + 360deg)); } }
@keyframes clock-lap-b { from { transform: rotate(0deg); } to { transform: rotate(calc(var(--clock-turn, 0deg) + 360deg)); } }`

/** The row clock: a 16px box, the face and the hand stacked in it. `still` takes the surrounding colour. */
export const clockGaugeIconCss = `${clockKeyframes}
${rules({
  all: ROW,
  state: (state) => `${ROW}[data-state="${state}"]`,
  lap: (lap) => `${ROW}[data-lap="${lap}"]`,
  face: (host) => `${host} > [data-part="face"]`,
  hand: (host) => `${host} > [data-part="hand"]`,
  size: 16,
  faceCss: "position: absolute; inset: 0;",
  handCss: "position: absolute; inset: 0;",
  allCss: "position: relative; display: inline-block; flex: none; width: 16px; height: 16px;",
})}
${ROW}[data-state="still"] { ${FACE}: currentColor; ${INK}: currentColor; }
`

const PILL = `[data-slot="session-plugin-pill"]:has(use[href$="icon-${CLOCK_PLACEHOLDER}"])`

/**
 * The capsule of a pill that names `CLOCK_PLACEHOLDER`: the catalog svg is hidden and `::before` draws the face in the slot the
 * svg had (14px, in flow, so the capsule and its label do not move); `::after` is the hand, laid over it at the capsule's start
 * padding (10px).
 */
export const clockGaugeChipCss = `
${PILL} > svg { display: none; }
${rules({
  all: PILL,
  state: (state) => `:root[data-chip-clock="${state}"] ${PILL}`,
  lap: (lap) => `:root[data-chip-clock-lap="${lap}"] ${PILL}`,
  face: (host) => `${host}::before`,
  hand: (host) => `${host}::after`,
  size: 14,
  handCss: "position: absolute; inset-block: 0; inset-inline-start: 10px; margin: auto 0;",
  allCss: "position: relative;",
})}`
