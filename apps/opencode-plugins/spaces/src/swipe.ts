// Trackpad swipes over the sidebar switch spaces, and swiping past the last one reveals and fills a plus, as in Arc.
// The machine is pure so it can be tested without a trackpad: hand it wheel deltas, it says what to do.

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
  /** A gap this long ends the gesture: a momentum tail never pauses that long. */
  gap?: number
  /** Kept for callers that set it; a gesture is now latched until it pauses, which is stricter than a timeout. */
  cooldown?: number
}

const DEFAULTS = { threshold: 80, reveal: 40, create: 90, gap: 320, cooldown: 320 }
/** Past the reveal point the finger drags the slot open against a rubber band, so a real pull is needed. */
const RESISTANCE = 0.5

export const idleSwipe = (): SwipeState => ({ phase: "idle", dx: 0, at: 0, revealed: false, pull: 0 })

export function swipe(state: SwipeState, event: { dx: number; dy: number; at: number }, options: SwipeOptions): { state: SwipeState; action: SwipeAction } {
  const limits = { ...DEFAULTS, ...options }
  const paused = state.at !== 0 && event.at - state.at > limits.gap
  // A pause ends the gesture; a momentum tail never pauses that long.
  let current: SwipeState = paused ? { ...idleSwipe(), at: 0 } : state

  // One change per gesture: the caller ends a gesture with `release` after a pause, and until then nothing more happens —
  // no timeout re-arms it, because a momentum tail can outlast any timeout.
  if (current.phase === "cool") return { state: { ...current, at: event.at }, action: { type: "none" } }

  if (current.phase === "idle") {
    if (Math.abs(event.dx) < 2 && Math.abs(event.dy) < 2) return { state: { ...current, at: event.at }, action: { type: "none" } }
    const phase: Phase = Math.abs(event.dx) > Math.abs(event.dy) ? "x" : "y"
    current = { phase, dx: 0, at: event.at, revealed: false, pull: 0 }
    if (phase === "y") return { state: current, action: { type: "none" } }
  } else if (current.phase === "y") {
    return { state: { ...current, at: event.at }, action: { type: "none" } }
  } else {
    current = { ...current, at: event.at }
  }

  // Horizontal from here: the caller suppresses the page's own horizontal scrolling for this gesture.
  const dx = current.dx + event.dx
  const base = { ...current, at: event.at, dx }

  if (!limits.atEnd) {
    if (Math.abs(dx) >= limits.threshold) return { state: { ...base, phase: "cool", dx: 0, revealed: false }, action: { type: "switch", direction: dx > 0 ? 1 : -1 } }
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
  if (dx <= -limits.threshold) return { state: { ...base, phase: "cool", dx: 0, revealed: false, pull: 0 }, action: { type: "switch", direction: -1 } }
  return { state: { ...base, pull: 0, revealed: false }, action: { type: "progress", offset: dx, pull: 0, revealed: false } }
}

/** What the machine should do when the gesture ends without reaching a threshold. */
export function release(state: SwipeState): SwipeState {
  return { phase: "idle", dx: 0, at: state.at, revealed: false, pull: 0 }
}
