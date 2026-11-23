import os from "node:os"
import path from "node:path"

export interface Options {
  /** Off: no adoption, no scanning, no guard. Also off while `~/.config/opencode/session-procs.off` exists. */
  readonly enabled: boolean
  /** Log and report what would be killed, kill nothing. The kill guard still refuses: refusing is safe. */
  readonly dryRun: boolean
  readonly scanSeconds: number
  /** A sub-agent session idle this long, with no monitor, has the leftovers of its exited shells ended. Top-level sessions are never idle-reaped. */
  readonly subagentIdleMinutes: number
  /** Percent of one CPU that counts as runaway: 90 is 90% of a core, measured across the group. */
  readonly runawayCpu: number
  /** A tracked group over `runawayCpu` for this long gets one notice, once. */
  readonly runawayMinutes: number
  /** An orphaned group over `runawayCpu` for this long is ended while its session is not busy. */
  readonly orphanKillMinutes: number
  /** SIGTERM, then SIGKILL after this long. */
  readonly killGraceSeconds: number
  /** Refuse pkill / killall / `pgrep … | xargs kill` when the pattern matches processes this session does not own. */
  readonly guardKill: boolean
  /** Where log.jsonl goes. Not documented for users: tests and the harness set it. */
  readonly dir: string
}

export const defaultDir = () => path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "opencode", "session-procs")

export const OFF_FILE = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode", "session-procs.off")

export const DEFAULTS: Options = {
  enabled: true,
  dryRun: true,
  scanSeconds: 15,
  subagentIdleMinutes: 10,
  runawayCpu: 90,
  runawayMinutes: 10,
  orphanKillMinutes: 30,
  killGraceSeconds: 5,
  guardKill: true,
  dir: defaultDir(),
}

function integer(raw: Readonly<Record<string, unknown>>, key: "scanSeconds" | "subagentIdleMinutes" | "runawayCpu" | "runawayMinutes" | "orphanKillMinutes" | "killGraceSeconds", min: number): number {
  const value = raw[key]
  if (value === undefined) return DEFAULTS[key]
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) throw new Error(`session-procs option ${key} must be an integer of at least ${min}`)
  return value
}

function flag(raw: Readonly<Record<string, unknown>>, key: "enabled" | "dryRun" | "guardKill"): boolean {
  const value = raw[key]
  if (value === undefined) return DEFAULTS[key]
  if (typeof value !== "boolean") throw new Error(`session-procs option ${key} must be true or false`)
  return value
}

export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  const dir = raw.dir ?? DEFAULTS.dir
  if (typeof dir !== "string" || dir === "") throw new Error("session-procs option dir must be a path")
  return {
    enabled: flag(raw, "enabled"),
    dryRun: flag(raw, "dryRun"),
    scanSeconds: integer(raw, "scanSeconds", 1),
    subagentIdleMinutes: integer(raw, "subagentIdleMinutes", 0),
    runawayCpu: integer(raw, "runawayCpu", 1),
    runawayMinutes: integer(raw, "runawayMinutes", 0),
    orphanKillMinutes: integer(raw, "orphanKillMinutes", 0),
    killGraceSeconds: integer(raw, "killGraceSeconds", 0),
    guardKill: flag(raw, "guardKill"),
    dir,
  }
}
