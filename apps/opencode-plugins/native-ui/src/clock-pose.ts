// The schedule clock as a gauge. The minute hand is the time left until a schedule fires: 12 o'clock is "now", it moves clockwise
// 5 degrees per minute left, and 60 minutes or more rest at the far position (10 o'clock, 300 degrees), so even the far
// position leaves a gap before 12 and a paused hand (12) never reads as a full hour. The hour hand does not move: it is a short
// fixed stroke at 12 baked into the face (a gauge has one reading, and a second moving hand would be noise).
//
// Pure functions only; the DOM side is `clock-gauge.tsx`.

import { MINUTE } from "./chip-time"

/** Time left that fills the dial. */
export const GAUGE_MINUTES = 60
/** The minute hand's travel at full scale. */
export const GAUGE_SWEEP = 300
export const DEGREES_PER_MINUTE = GAUGE_SWEEP / GAUGE_MINUTES

/** What the clock needs to know about one schedule. */
export interface ClockInput {
  /** When it next fires (ms). */
  readonly nextRun?: number
  /** Paused, by the user or by the loop guard: alive but not counting down. */
  readonly paused?: boolean
  /** Runs so far; an increase is a run that fired. */
  readonly runs?: number
}

export type ClockState = "live" | "due" | "rest"

export interface ClockPose {
  readonly state: ClockState
  /** Minute hand angle, degrees clockwise from 12. */
  readonly turn: number
}

export const REST: ClockPose = { state: "rest", turn: 0 }

/** The minute hand for a time left: whole minutes, rounded down, clamped to the dial. Under a minute is 12 o'clock. */
export function gaugeTurn(left: number): number {
  const minutes = Math.floor(Math.max(0, left) / MINUTE)
  return Math.min(minutes, GAUGE_MINUTES) * DEGREES_PER_MINUTE
}

/** A schedule's own pose: paused or without a next run rests at 12; under a minute left is `due` (12, with the one soft tick); otherwise `live` at its gauge position. */
export function clockPose(input: ClockInput | undefined, now: number): ClockPose {
  if (!input || input.paused || input.nextRun === undefined) return REST
  const left = input.nextRun - now
  return left < MINUTE ? { state: "due", turn: 0 } : { state: "live", turn: gaugeTurn(left) }
}

function soonestOf(inputs: readonly ClockInput[]): ClockInput | undefined {
  let soonest: ClockInput | undefined
  for (const input of inputs) {
    if (input.paused || input.nextRun === undefined) continue
    if (!soonest || input.nextRun < soonest.nextRun!) soonest = input
  }
  return soonest
}

/** The schedule the chip shows: the one that fires first among those counting down; all paused (or none) rests. */
export function soonestPose(inputs: readonly ClockInput[], now: number): ClockPose {
  return clockPose(soonestOf(inputs), now)
}

/** The moment the chip's clock turns due: a minute before its schedule fires. */
export function soonestDue(inputs: readonly ClockInput[]): number | undefined {
  const run = soonestOf(inputs)?.nextRun
  return run === undefined ? undefined : run - MINUTE
}

/** Whether the run count went up: a schedule fired since the last look. A first look (nothing before) is not a fire. */
export function fired(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && after > before
}

/** Whether any schedule present in both lists fired between them. */
export function anyFired(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>): boolean {
  for (const [id, runs] of after) if (fired(before.get(id), runs)) return true
  return false
}
