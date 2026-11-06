import type { Availability } from "./usage.js"

export interface Waiting {
  readonly sessionID: string
  /** When the failure was recorded, epoch ms. */
  readonly stalledAt: number
  /** Never resume before this: stall + margin + backoff for earlier failed resumes. */
  readonly notBefore: number
  /** Next time to look at this session, epoch ms. */
  dueAt: number
  readonly kind?: string
  /** What the error said, epoch ms. */
  readonly resetsAt?: number
  /** Checks where the reset had passed but no fresh reading could confirm it. */
  unverified: number
  /** The time last announced in the timeline. */
  announcedAt?: number
  announcements: number
}

export type Decision =
  | { readonly action: "resume"; readonly verified: boolean }
  | { readonly action: "wait"; readonly at: number; readonly unverified?: boolean }

export const UNVERIFIED_LIMIT = 2

/**
 * Pure. Decides whether a waiting session may resume now or when to look again. `nextPoll` is the earliest moment a
 * fresh usage reading can exist, so a check is never scheduled before it could learn anything.
 */
export function decide(w: Waiting, a: Availability, now: number, marginMs: number, nextPoll: number): Decision {
  const raw = decideUnbounded(w, a, now, marginMs, nextPoll)
  if (raw.action === "resume") return now < w.notBefore ? { action: "wait", at: w.notBefore } : raw
  return raw.at < w.notBefore ? { ...raw, at: w.notBefore } : raw
}

function decideUnbounded(w: Waiting, a: Availability, now: number, marginMs: number, nextPoll: number): Decision {
  // An overage rejection is the extra-usage allowance, which the 5h/7d windows do not describe: trust only the error.
  if (w.kind === "overage") {
    if (w.resetsAt !== undefined && now < w.resetsAt + marginMs) return { action: "wait", at: w.resetsAt + marginMs }
    return { action: "resume", verified: false }
  }

  if (a.free) return { action: "resume", verified: true }

  const upcoming = [w.resetsAt, a.earliestReset].filter((t): t is number => t !== undefined && t + marginMs > now)
  if (upcoming.length > 0) return { action: "wait", at: Math.max(Math.min(...upcoming) + marginMs, nextPoll) }

  if (w.resetsAt !== undefined) {
    // The error's reset has passed and no reading could be refreshed to say otherwise.
    if (w.unverified + 1 >= UNVERIFIED_LIMIT) return { action: "resume", verified: false }
    return { action: "wait", at: nextPoll, unverified: true }
  }
  return { action: "wait", at: nextPoll }
}
