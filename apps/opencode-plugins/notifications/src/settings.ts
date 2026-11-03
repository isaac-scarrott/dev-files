import { Schema } from "effect"
import type { NotifyKind } from "../../native-ui/src/notify-contract"

// A store of its own per channel family: a field added to a stored struct fails to decode and drops what was saved.
// The marks (`MarksSchema`) and the pending entries (`PendingSchema`) each have theirs.
export const SettingsSchema = Schema.Struct({
  /** Whether the kind raises a toast. */
  toast: Schema.Struct({ "needs-you": Schema.Boolean, error: Schema.Boolean, done: Schema.Boolean, info: Schema.Boolean }),
  /** Whether `done` and `info` still toast for the session the user is looking at (the focus rule hides them). */
  onScreen: Schema.Struct({ done: Schema.Boolean, info: Schema.Boolean }),
  /** Source ids (plugin ids) whose notifications are dropped. */
  muted: Schema.Array(Schema.String),
})

export type Settings = typeof SettingsSchema.Type

export const defaultSettings: Settings = {
  toast: { "needs-you": true, error: true, done: true, info: false },
  onScreen: { done: false, info: false },
  muted: [],
}

/** The kinds the focus rule never suppresses: the user has to see them. */
export const ALWAYS_SHOWN: ReadonlySet<NotifyKind> = new Set<NotifyKind>(["needs-you", "error"])

/** Whether a plugin-sourced notification of the kind draws a mark on its session's tab. */
export const MarksSchema = Schema.Struct({ "needs-you": Schema.Boolean, error: Schema.Boolean, done: Schema.Boolean, info: Schema.Boolean })

export type Marks = typeof MarksSchema.Type

export const defaultMarks: Marks = { "needs-you": true, error: true, done: true, info: true }

/** What a plugin's notification leaves waiting on a session; kept so a reload keeps the marks. */
export const PendingSchema = Schema.Struct({
  entries: Schema.Array(
    Schema.Struct({
      source: Schema.String,
      key: Schema.String,
      kind: Schema.Literals(["needs-you", "error", "done", "info"]),
      severity: Schema.Literals(["info", "success", "warning", "error"]),
      title: Schema.String,
      server: Schema.String,
      session: Schema.String,
      at: Schema.Number,
    }),
  ),
})

export type Pending = typeof PendingSchema.Type

export const defaultPending: Pending = { entries: [] }
