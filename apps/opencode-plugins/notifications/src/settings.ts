import { Schema } from "effect"
import type { NotifyKind } from "../../native-ui/src/notify-contract"

// A store of its own per channel family: a field added to a stored struct fails to decode and drops what was saved.
// Marks (M3) get theirs.
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
