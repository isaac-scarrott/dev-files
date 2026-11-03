import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** One use of a provider secret. Names only: no value, no token, no session. */
export type AuditEntry = {
  time: string
  session: string
  /** What asked: `get` (value to the running code) or `fill` (value to a page, never to code). */
  via: "get" | "fill"
  account: string
  accountLabel: string
  item?: string
  field: string
  name: string
  origin?: string
  outcome: "allowed" | "always" | "rule" | "denied" | "error"
}

const KEEP = 50

export const defaultAuditFile = () => join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opencode", "blindfold", "audit.jsonl")

/** The last entries stay in memory for the settings page; each is also appended to a JSONL file (mode 0600) unless `file` is false. */
export function audit(file: string | false) {
  const recent: AuditEntry[] = []
  let ready: Promise<unknown> | undefined
  return {
    add(entry: AuditEntry) {
      recent.push(entry)
      if (recent.length > KEEP) recent.shift()
      if (file === false) return
      // The file is a convenience: a failed write must never fail the use it describes.
      ready ??= mkdir(dirname(file), { recursive: true, mode: 0o700 })
      void ready.then(() => appendFile(file, JSON.stringify(entry) + "\n", { mode: 0o600 })).catch(() => undefined)
    },
    recent: () => recent.slice().reverse(),
  }
}
