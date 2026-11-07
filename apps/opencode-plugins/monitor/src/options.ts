import os from "node:os"
import path from "node:path"

export interface Options {
  /** Running monitors at once, across all sessions: a safety cap for the shared service. */
  readonly maxMonitors: number
  /** Running monitors at once for one session. */
  readonly maxPerSession: number
  /** Auto-stop after this long unless the tool is given another ttlMinutes. */
  readonly ttlMinutes: number
  readonly maxEventsPerHour: number
  readonly minRearmMinutes: number
  readonly maxLinesPerWake: number
  readonly maxLineChars: number
  /** Bytes of unsent output held per monitor; lines past it are dropped and counted. */
  readonly maxBufferBytes: number
  readonly killGraceSeconds: number
  readonly logDir: string
}

export const DEFAULTS: Options = {
  maxMonitors: 40,
  maxPerSession: 5,
  ttlMinutes: 1440,
  maxEventsPerHour: 200,
  minRearmMinutes: 1,
  maxLinesPerWake: 50,
  maxLineChars: 2000,
  maxBufferBytes: 65_536,
  killGraceSeconds: 5,
  logDir: path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "opencode", "monitor"),
}

function integer(raw: Readonly<Record<string, unknown>>, key: Exclude<keyof Options, "logDir">): number {
  const value = raw[key]
  if (value === undefined) return DEFAULTS[key]
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error(`monitor option ${key} must be a positive integer`)
  return value
}

export function parseOptions(raw: Readonly<Record<string, unknown>> = {}): Options {
  const logDir = raw.logDir ?? DEFAULTS.logDir
  if (typeof logDir !== "string" || logDir === "") throw new Error("monitor option logDir must be a path")
  return {
    maxMonitors: integer(raw, "maxMonitors"),
    maxPerSession: integer(raw, "maxPerSession"),
    ttlMinutes: integer(raw, "ttlMinutes"),
    maxEventsPerHour: integer(raw, "maxEventsPerHour"),
    minRearmMinutes: integer(raw, "minRearmMinutes"),
    maxLinesPerWake: integer(raw, "maxLinesPerWake"),
    maxLineChars: integer(raw, "maxLineChars"),
    maxBufferBytes: integer(raw, "maxBufferBytes"),
    killGraceSeconds: integer(raw, "killGraceSeconds"),
    logDir,
  }
}
