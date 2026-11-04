import { homedir } from "node:os"
import { join } from "node:path"

export interface Options {
  /** Records and handoff files older than this are dropped. */
  retentionDays: number
  /** Most records kept; the oldest go first. */
  maxRecords: number
  /** Tell the session (a queued notice, no turn) about jobs lost to a restart. */
  notice: boolean
  /** Write the handoff file. */
  file: boolean
  /** Publish an info notification to the alerts hub. */
  notify: boolean
  /** Where handoff files go. Not documented for users: tests and the harness set it. */
  dir: string
}

export const defaultDir = () => join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "opencode", "shell-handoff")

const int = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback)

export function parseOptions(raw: unknown): Options {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    retentionDays: int(o.retentionDays, 7, 1, 365),
    maxRecords: int(o.maxRecords, 200, 1, 5000),
    notice: bool(o.notice, true),
    file: bool(o.file, true),
    notify: bool(o.notify, true),
    dir: typeof o.dir === "string" && o.dir.length > 0 ? o.dir : defaultDir(),
  }
}
