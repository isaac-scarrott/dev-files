import os from "node:os"
import path from "node:path"

export interface Options {
  /** Most schedules held at once, across all sessions. */
  readonly maxSchedules: number
  /** Shortest allowed gap between runs of a recurring task, in seconds. */
  readonly minIntervalSeconds: number
  /** A task that fires more than this many times within `loopWindowMinutes` is paused. */
  readonly loopMaxFires: number
  readonly loopWindowMinutes: number
  /** How often due tasks are looked at. Also the longest a sleeping machine waits to catch up after waking. */
  readonly tickSeconds: number
  /** A run later than this is reported to the session as late. */
  readonly lateSeconds: number
  /** Which sessions a task may target by title or ref: the caller's tree, its project, or every session. */
  readonly scope: "tree" | "project" | "all"
  /** Log file location. */
  readonly logDir: string
}

export function defaultLogDir(): string {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  return path.join(base, "opencode", "scheduler")
}

export const DEFAULTS: Options = {
  maxSchedules: 50,
  minIntervalSeconds: 60,
  loopMaxFires: 10,
  loopWindowMinutes: 60,
  tickSeconds: 30,
  lateSeconds: 90,
  scope: "tree",
  logDir: defaultLogDir(),
}

function integer(raw: Readonly<Record<string, unknown>>, key: Exclude<keyof Options, "scope" | "logDir">): number {
  const value = raw[key]
  if (value === undefined) return DEFAULTS[key]
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error(`scheduler option ${key} must be a positive integer`)
  return value
}

export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  const scope = raw.scope ?? DEFAULTS.scope
  if (scope !== "tree" && scope !== "project" && scope !== "all") throw new Error('scheduler option scope must be "tree", "project" or "all"')
  const logDir = raw.logDir ?? DEFAULTS.logDir
  if (typeof logDir !== "string" || !logDir) throw new Error("scheduler option logDir must be a path")
  return {
    maxSchedules: integer(raw, "maxSchedules"),
    minIntervalSeconds: integer(raw, "minIntervalSeconds"),
    loopMaxFires: integer(raw, "loopMaxFires"),
    loopWindowMinutes: integer(raw, "loopWindowMinutes"),
    tickSeconds: integer(raw, "tickSeconds"),
    lateSeconds: integer(raw, "lateSeconds"),
    scope,
    logDir,
  }
}
