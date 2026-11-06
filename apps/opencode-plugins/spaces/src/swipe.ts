// Trackpad swipes over the sidebar switch spaces, and swiping past the last one reveals and fills a plus, as in Arc.
// The machine is pure so it can be tested without a trackpad: hand it wheel deltas, it says what to do.

export type Phase = "idle" | "x" | "y" | "cool"

export interface SwipeState {
  phase: Phase
  /** Accumulated horizontal travel of the current gesture, in pixels. */
  dx: number
  /** Where the last event landed, so a pause can end the gesture. */
  at: number
  /** The plus is showing: the user has swiped past the last space. */
  revealed: boolean
}

export type SwipeAction =
  | { type: "none" }
  | { type: "progress"; offset: number; revealed: boolean }
  | { type: "switch"; direction: 1 | -1 }
  | { type: "create" }

export interface SwipeOptions {
  /** The active space is the last one, so there is nowhere further to go: swiping on offers a new one. */
  atEnd: boolean
  /** Travel that changes space. */
  threshold?: number
  /** Travel past the end that shows the plus. */
  reveal?: number
  /** Travel past the end that creates the space. */
  create?: number
  /** A gap this long ends the gesture: a momentum tail never pauses that long. */
  gap?: number
  /** Kept for callers that set it; a gesture is now latched until it pauses, which is stricter than a timeout. */
  cooldown?: number
}

const DEFAULTS = { threshold: 80, reveal: 48, create: 132, gap: 140, cooldown: 320 }

export const idleSwipe = (): SwipeState => ({ phase: "idle", dx: 0, at: 0, revealed: false })

export function swipe(state: SwipeState, event: { dx: number; dy: number; at: number }, options: SwipeOptions): { state: SwipeState; action: SwipeAction } {
  const limits = { ...DEFAULTS, ...options }
  const paused = state.at !== 0 && event.at - state.at > limits.gap
  // A pause ends the gesture; a momentum tail never pauses that long.
  let current: SwipeState = paused ? { ...idleSwipe(), at: 0 } : state

  // One change per gesture: while the finger (and its momentum) keeps sending events, nothing more happens. Only a pause
  // longer than `gap` ends the gesture and arms another change.
  if (current.phase === "cool") {
    if (!paused) return { state: { ...current, at: event.at }, action: { type: "none" } }
    current = { ...idleSwipe(), at: current.at }
  }

  if (current.phase === "idle") {
    if (Math.abs(event.dx) < 2 && Math.abs(event.dy) < 2) return { state: { ...current, at: event.at }, action: { type: "none" } }
    const phase: Phase = Math.abs(event.dx) > Math.abs(event.dy) ? "x" : "y"
    current = { phase, dx: 0, at: event.at, revealed: false }
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
    return { state: base, action: { type: "progress", offset: dx, revealed: false } }
  }

  // At the last space, swiping on (rightward, positive) is the way to a new one.
  if (dx >= limits.create) return { state: { ...base, phase: "cool", dx: 0, revealed: false }, action: { type: "create" } }
  if (dx >= limits.reveal) return { state: { ...base, revealed: true }, action: { type: "progress", offset: dx, revealed: true } }
  if (dx > 0) return { state: { ...base, revealed: false }, action: { type: "progress", offset: dx, revealed: false } }
  if (dx <= -limits.threshold) return { state: { ...base, phase: "cool", dx: 0, revealed: false }, action: { type: "switch", direction: -1 } }
  return { state: base, action: { type: "progress", offset: dx, revealed: false } }
}

/** What the machine should do when the gesture ends without reaching a threshold. */
export function release(state: SwipeState): SwipeState {
  return { phase: "idle", dx: 0, at: state.at, revealed: false }
}
