import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

/** One JSON line in `log.jsonl`: what happened, to what, and when. */
export interface LogEntry {
  readonly event: string
  readonly [field: string]: unknown
}

const MAX_FIELD_CHARS = 300

function oneLine(text: string, limit = MAX_FIELD_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

/** A command line and a path are data from anywhere: flattened and cut before either reach a log line. */
export function logField(text: string): string {
  return oneLine(text)
}

/**
 * Every action goes to `log.jsonl` in the plugin's data directory and to stderr, in the monitor's style. The plugin API
 * has no logger, and this one is where Isaac reviews three days of `dryRun` before it kills anything.
 */
export function createLog(dir: string, now: () => number): (entry: LogEntry) => void {
  const file = path.join(dir, "log.jsonl")
  let ready: Promise<unknown> = mkdir(dir, { recursive: true, mode: 0o700 }).catch(() => {})
  return (entry) => {
    const line = JSON.stringify({ at: now(), ...entry })
    process.stderr.write(`[session-procs] ${line}\n`)
    ready = ready.then(() => appendFile(file, `${line}\n`, { mode: 0o600 })).catch(() => {})
  }
}
