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
  /** `flow`: served under an approved sign-in (see `grant`) without a card of its own. */
  outcome: "allowed" | "always" | "rule" | "flow" | "denied" | "error"
  /** The id of the sign-in approval that created or served this use. */
  grant?: string
}

const KEEP = 50

export const defaultAuditFile = () => join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opencode", "blindfold", "audit.jsonl")

/** The last entries stay in memory for the settings page; each is also appended to a JSONL file (mode 0600) unless `file` is false. */
export function audit(file: string | false) {
  const recent: AuditEntry[] = []
  // Appends run in order, one after the other.
  let written: Promise<unknown> = Promise.resolve()
  return {
    add(entry: AuditEntry) {
      recent.push(entry)
      if (recent.length > KEEP) recent.shift()
      if (file === false) return
      // The file is a convenience: a failed write must never fail the use it describes.
      written = written
        .then(() => mkdir(dirname(file), { recursive: true, mode: 0o700 }))
        .then(() => appendFile(file, JSON.stringify(entry) + "\n", { mode: 0o600 }))
        .catch(() => undefined)
    },
    recent: () => recent.slice().reverse(),
  }
}
