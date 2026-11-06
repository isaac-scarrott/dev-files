// Trackpad swipes over the sidebar switch spaces, and swiping past the last one reveals and fills a plus, as in Arc.
// The machine is pure so it can be tested without a trackpad: hand it wheel deltas, it says what to do.
//
// A gesture is one stroke of the fingers plus the momentum tail macOS sends after they lift. Chromium 151 marks the
// tail's events with `WheelEvent.momentum`, so a finger event after a momentum one is a new stroke for certain. Where
// that flag is missing or never set, the gesture's edges are read off the stream itself: a momentum tail only ever
// decays, and touching the trackpad again cancels it, so a new stroke shows as the stream falling low and then
// climbing again. That, a pause, or a swing the other way, is a new gesture.

export type Phase = "idle" | "x" | "y" | "cool"

export interface SwipeState {
  phase: Phase
  /** Accumulated horizontal travel of the current gesture, in pixels. */
  dx: number
  /** Where the last event landed, so a pause can end the gesture. */
  at: number
  /** The new-space slot is showing: the user has swiped past the last space. */
  revealed: boolean
  /** 0..1: how far the slot has filled. */
  pull: number
  /** What the stream has done since the gesture's commit, read to spot the next gesture starting. */
  stream: Stream
}

/**
 * The shape of the wheel stream, in pixels per 16ms frame. Each event is read two ways, because the delivery of events
 * distorts either reading alone: Chromium merges the events that queue up while the page is busy (a switch re-renders
 * the sidebar) into one larger event, which by its delta looks like a spike; and an event delivered late (CDP input in
 * the harness lands 18-35ms apart, with the odd 60ms stall) looks, by speed over its interval, like a dip. So an event
 * counts as low only if it is low both ways, and as high only if it is high both ways.
 */
export interface Stream {
  /** The direction the gesture committed to: a swing the other way is a new gesture. */
  direction: 0 | 1 | -1
  /** The fastest the stream has run since the gesture began. */
  peak: number
  /** The previous event's level. */
  last: number
  /** The last few events' sizes and times, which speed is measured over. */
  recent: { size: number; at: number }[]
  /** Where the current climb started: the low point the stream rose from, and the peak it had fallen from. */
  trough: number
  ceiling: number
  /** How many events in a row have been higher than the one before. */
  climb: number
  /** Horizontal travel since the trough, carried into the new gesture when the climb proves to be one. */
  travel: number
  /** Horizontal travel against `direction`, in a row. */
  back: number
  backs: number
  /** A momentum event has arrived since the fingers last moved: they have lifted. */
  coasting: boolean
}

export interface WheelInput {
  dx: number
  dy: number
  at: number
  /** `WheelEvent.momentum`: the OS's inertia after the fingers lift, not the fingers. Absent where unsupported. */
  momentum?: boolean
}

export type SwipeAction =
  | { type: "none" }
  /** `pull` is 0..1: how far past the last space the finger has dragged, after the elastic resistance. */
  | { type: "progress"; offset: number; pull: number; revealed: boolean }
  | { type: "switch"; direction: 1 | -1 }
  | { type: "create" }

export interface SwipeOptions {
  /** The active space is the last one, so there is nowhere further to go: swiping on offers a new one. */
  atEnd: boolean
  /** Travel that changes space. */
  threshold?: number
  /** Travel past the end where the new space's slot starts to open. */
  reveal?: number
  /** Elastic travel past `reveal` that arms it. Filled by dragging further, against resistance. */
  create?: number
  /** A gap this long ends the gesture. */
  gap?: number
}

/**
 * A pause this long ends a gesture. macOS sends a stroke and its momentum every ~16ms (8ms at 120Hz), stamped with the
 * trackpad's own time, so a tail never pauses this long, while lifting and swiping again takes longer. The wheel binding
 * lets go of a full pull after the same pause.
 */
export const GESTURE_GAP = 150

const DEFAULTS = { threshold: 80, reveal: 40, create: 90, gap: GESTURE_GAP }
/** Past the reveal point the finger drags the slot open against a rubber band, so a real pull is needed. */
const RESISTANCE = 0.5
/** The stream has died down once it falls to this share of its peak: the stroke is over, or nearly. */
const DECAYED = 1 / 3
/** A climb is a new stroke once it has risen this many events running... */
const CLIMB_EVENTS = 2
/** ...to at least this multiple of its trough, and this many pixels above it, so jitter in a tail never counts. */
const CLIMB_RATIO = 2
const CLIMB_PIXELS = 4
/** Travel the other way that is a deliberate swing back, not a wobble: events in a row, and pixels. */
const BACK_EVENTS = 2
const BACK_PIXELS = 6

/** One frame, the interval speeds are measured in. */
const FRAME = 16
/** Speed is averaged over this many events, so one late event is a shallow plateau rather than a dip. */
const WINDOW = 3
/** The usual spacing between events is the median of this many intervals. */
const SPACING = 6

const freshStream = (level = 0, direction: 0 | 1 | -1 = 0, recent: Stream["recent"] = []): Stream => ({
  direction,
  peak: level,
  last: level,
  recent,
  trough: level,
  ceiling: level,
  climb: 0,
  travel: 0,
  back: 0,
  backs: 0,
  coasting: false,
})

/**
 * How fast the stream runs as this event lands, in pixels per frame: `low` is the larger of the two readings, `high`
 * the smaller. `burst` is the event's own delta over at most the stream's usual spacing, so a stall cannot shrink it;
 * `speed` is the travel of the last few events over the time they took, so a merge cannot swell it.
 */
function measure(recent: Stream["recent"], event: WheelInput) {
  const size = Math.hypot(event.dx, event.dy)
  const history = [...recent, { size, at: event.at }].slice(-(SPACING + 1))
  if (history.length === 1) return { low: size, high: size, recent: history }
  // The stream's usual spacing: a 60Hz or 120Hz trackpad, or the harness's slower CDP input. A stall or two cannot move it.
  const intervals = history.slice(1).map((entry, index) => Math.max(FRAME / 2, entry.at - history[index]!.at))
  const usual = [...intervals].sort((a, b) => a - b)[(intervals.length - 1) >> 1]!
  const burst = (size * FRAME) / Math.min(usual, intervals.at(-1)!)
  const window = history.slice(-(WINDOW + 1))
  const travel = window.slice(1).reduce((sum, entry) => sum + entry.size, 0)
  const speed = (travel * FRAME) / Math.max((FRAME / 2) * (window.length - 1), event.at - window[0]!.at)
  return { low: Math.max(burst, speed), high: Math.min(burst, speed), recent: history }
}

export const idleSwipe = (): SwipeState => ({ phase: "idle", dx: 0, at: 0, revealed: false, pull: 0, stream: freshStream() })

/** Follows the stream one event on, and says whether this event starts a new gesture. */
function follow(stream: Stream, event: WheelInput): { stream: Stream; fresh: boolean; travel: number } {
  // A zero-delta event carries no shape (Chromium can send one as a stroke ends); it neither climbs nor falls.
  if (Math.hypot(event.dx, event.dy) < 0.5) return { stream, fresh: false, travel: 0 }
  const { low, high, recent } = measure(stream.recent, event)

  // Where the platform says which events are inertia, it settles the question: the tail belongs to its gesture, and
  // the fingers moving again after it are a new one.
  if (event.momentum) {
    const peak = Math.max(stream.peak, high)
    return { stream: { ...stream, peak, last: high, recent, trough: low, ceiling: peak, climb: 0, travel: 0, back: 0, backs: 0, coasting: true }, fresh: false, travel: 0 }
  }
  if (stream.coasting) return { stream: freshStream(high, 0, recent), fresh: true, travel: event.dx }

  const against = stream.direction !== 0 && Math.sign(event.dx) === -stream.direction && Math.abs(event.dx) > Math.abs(event.dy)
  const back = against ? stream.back + event.dx : 0
  const backs = against ? stream.backs + 1 : 0
  if (backs >= BACK_EVENTS && Math.abs(back) >= BACK_PIXELS) return { stream: freshStream(high, 0, recent), fresh: true, travel: back }

  const rising = high > stream.last
  const trough = rising ? stream.trough : low
  const ceiling = rising ? stream.ceiling : stream.peak
  const climb = rising ? stream.climb + 1 : 0
  const travel = rising ? stream.travel + event.dx : event.dx
  const decayed = trough <= ceiling * DECAYED
  const risen = climb >= CLIMB_EVENTS && high >= Math.max(trough * CLIMB_RATIO, trough + CLIMB_PIXELS)
  if (decayed && risen) return { stream: freshStream(high, 0, recent), fresh: true, travel }
  return { stream: { ...stream, peak: Math.max(stream.peak, high), last: high, recent, trough, ceiling, climb, travel, back, backs }, fresh: false, travel: 0 }
}

export function swipe(state: SwipeState, event: WheelInput, options: SwipeOptions): { state: SwipeState; action: SwipeAction } {
  const limits = { ...DEFAULTS, ...options }
  const paused = state.at !== 0 && event.at - state.at > limits.gap
  let current: SwipeState = paused ? idleSwipe() : state

  // After a change, or while the list scrolls, nothing happens until the next gesture starts. A momentum tail is
  // swallowed however long it runs; a new stroke picks up the travel it has made so far.
  if (current.phase === "cool" || current.phase === "y") {
    const step = follow(current.stream, event)
    if (!step.fresh) return { state: { ...current, at: event.at, stream: step.stream }, action: { type: "none" } }
    const phase: Phase = Math.abs(event.dx) > Math.abs(event.dy) ? "x" : "y"
    if (phase === "y") return { state: { ...idleSwipe(), phase, at: event.at, stream: step.stream }, action: { type: "none" } }
    current = { ...idleSwipe(), phase, dx: step.travel - event.dx, at: event.at, stream: step.stream }
  } else if (current.phase === "idle") {
    // A gesture starts with the fingers: inertia arriving with nothing under way is a tail whose start we never saw.
    if (event.momentum || (Math.abs(event.dx) < 2 && Math.abs(event.dy) < 2)) return { state: { ...current, at: event.at }, action: { type: "none" } }
    const phase: Phase = Math.abs(event.dx) > Math.abs(event.dy) ? "x" : "y"
    const first = measure([], event)
    current = { ...idleSwipe(), phase, at: event.at, stream: freshStream(first.high, 0, first.recent) }
    if (phase === "y") return { state: current, action: { type: "none" } }
  } else {
    // Mid-swipe, before any change, a new stroke only adds its travel; the stream is followed for its peak.
    const step = follow(current.stream, event)
    current = { ...current, at: event.at, stream: { ...step.stream, peak: Math.max(current.stream.peak, step.stream.peak) } }
  }

  // Horizontal from here: the caller suppresses the page's own horizontal scrolling for this gesture.
  const dx = current.dx + event.dx
  const base = { ...current, at: event.at, dx }
  const commit = (direction: 1 | -1) => ({
    state: {
      ...base,
      phase: "cool" as const,
      dx: 0,
      revealed: false,
      pull: 0,
      // The peak so far carries over: a change made late in a tail is already well below it.
      stream: { ...freshStream(current.stream.last, direction, current.stream.recent), peak: Math.max(current.stream.peak, current.stream.last) },
    },
    action: { type: "switch" as const, direction },
  })

  if (!limits.atEnd) {
    if (Math.abs(dx) >= limits.threshold) return commit(dx > 0 ? 1 : -1)
    return { state: base, action: { type: "progress", offset: dx, pull: 0, revealed: false } }
  }

  // At the last space, swiping on (rightward, positive) opens the slot the new space will take. The first `reveal`
  // pixels bring it out; past that the drag is resisted, so the slot fills only under a deliberate pull.
  if (dx >= limits.reveal) {
    const elastic = (dx - limits.reveal) * RESISTANCE
    const pull = Math.min(1, elastic / limits.create)
    // Reaching the end arms the slot; letting go is what creates, so easing off backs out of it.
    const armed = pull >= 1
    return { state: { ...base, pull: armed ? 1 : pull, revealed: pull > 0 }, action: { type: "progress", offset: dx, pull: armed ? 1 : pull, revealed: pull > 0 } }
  }
  if (dx > 0) return { state: { ...base, pull: 0, revealed: false }, action: { type: "progress", offset: dx, pull: 0, revealed: false } }
  if (dx <= -limits.threshold) return commit(-1)
  return { state: { ...base, pull: 0, revealed: false }, action: { type: "progress", offset: dx, pull: 0, revealed: false } }
}

/**
 * The fingers have let go, as far as a timer can tell: nothing has arrived for `GESTURE_GAP` of wall-clock time. A slot
 * pulled full creates, and the rest of that gesture is swallowed as after a change. Anything else is left as it is: the
 * next event's own time says whether the gesture really paused, and a page too busy to deliver events for a while
 * must not split one gesture in two.
 */
export function release(state: SwipeState): { state: SwipeState; create: boolean } {
  if (state.phase !== "x" || state.pull < 1) return { state, create: false }
  const stream = { ...freshStream(state.stream.last, 1, state.stream.recent), peak: state.stream.peak }
  return { state: { ...state, phase: "cool", dx: 0, pull: 0, revealed: false, stream }, create: true }
}
