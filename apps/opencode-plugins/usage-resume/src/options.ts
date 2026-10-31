import os from "node:os"
import path from "node:path"

export interface Options {
  /** Text sent to a stalled session when usage is back. */
  readonly prompt: string
  /** Wait after the computed reset before checking and resuming. */
  readonly marginMs: number
  /** How often due sessions are looked at. Timers are not trusted across sleep, so this is a polling interval. */
  readonly tickMs: number
  /** Resumes per session before giving up, counted until the session completes a run. */
  readonly maxAttempts: number
  /** Extra wait after the first resume fails again, doubled for each further one. */
  readonly retryBackoffMs: number
  /** Stalls older than this are dropped. */
  readonly maxWaitMs: number
  /** Pause between resuming two sessions. */
  readonly staggerMs: number
  readonly authDir: string
  /** Empty disables sharing the notch app's readings. */
  readonly snapshotPath: string
  /** Post a timeline notice when a session starts waiting. */
  readonly notices: boolean
  /** Also resume subagent sessions (those with a parent). */
  readonly includeChildren: boolean
}

export const DEFAULTS: Options = {
  prompt: "Continue.",
  marginMs: 60_000,
  tickMs: 30_000,
  maxAttempts: 3,
  retryBackoffMs: 5 * 60_000,
  maxWaitMs: 8 * 86_400_000,
  staggerMs: 1_000,
  authDir: path.join(os.homedir(), ".cli-proxy-api"),
  snapshotPath: path.join(os.homedir(), "Library", "Caches", "NotchUsage", "snapshot.json"),
  notices: true,
  includeChildren: false,
}

const NAME = "usage-resume option"

function seconds(raw: Readonly<Record<string, unknown>>, key: string, fallbackMs: number, min: number): number {
  const value = raw[key]
  if (value === undefined) return fallbackMs
  if (typeof value !== "number" || !Number.isFinite(value) || value < min) throw new Error(`${NAME} ${key} must be a number of at least ${min}`)
  return value * 1000
}

function text(raw: Readonly<Record<string, unknown>>, key: string, fallback: string, allowEmpty: boolean): string {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new Error(`${NAME} ${key} must be a${allowEmpty ? "" : " non-empty"} string`)
  return value
}

function flag(raw: Readonly<Record<string, unknown>>, key: string, fallback: boolean): boolean {
  const value = raw[key]
  if (value === undefined) return fallback
  if (typeof value !== "boolean") throw new Error(`${NAME} ${key} must be a boolean`)
  return value
}

/** Durations are given in seconds (`marginSeconds`, `tickSeconds`, …) and held in ms. */
export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  const attempts = raw.maxAttempts
  if (attempts !== undefined && (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 1)) {
    throw new Error(`${NAME} maxAttempts must be a positive integer`)
  }
  return {
    prompt: text(raw, "prompt", DEFAULTS.prompt, false),
    marginMs: seconds(raw, "marginSeconds", DEFAULTS.marginMs, 0),
    tickMs: seconds(raw, "tickSeconds", DEFAULTS.tickMs, 1),
    maxAttempts: (attempts as number | undefined) ?? DEFAULTS.maxAttempts,
    retryBackoffMs: seconds(raw, "retryBackoffSeconds", DEFAULTS.retryBackoffMs, 0),
    maxWaitMs: seconds(raw, "maxWaitHours", DEFAULTS.maxWaitMs / 3600, 1) * 3600,
    staggerMs: seconds(raw, "staggerSeconds", DEFAULTS.staggerMs, 0),
    authDir: text(raw, "authDir", DEFAULTS.authDir, false),
    snapshotPath: text(raw, "snapshotPath", DEFAULTS.snapshotPath, true),
    notices: flag(raw, "notices", DEFAULTS.notices),
    includeChildren: flag(raw, "includeChildren", DEFAULTS.includeChildren),
  }
}
