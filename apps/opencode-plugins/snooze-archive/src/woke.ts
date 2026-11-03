import type { Target } from "./actions"
import type { DomHub } from "./hub"
import { activeSink } from "../../native-ui/src/notify-contract"
import { createTabMarks } from "../../native-ui/src/tab-marks"

export const WOKE_LABEL = "Woke from snooze"
// Entries are only inert keys; the cap bounds a store that a deleted-while-closed session can never prune.
const MAX_WOKE = 200

export const isWoke = (list: readonly Target[], server: string, id: string) => list.some((item) => item.server === server && item.id === id)
export const withWoke = (list: readonly Target[], server: string, id: string): Target[] =>
  [...list.filter((item) => item.server !== server || item.id !== id), { server, id }].slice(-MAX_WOKE)
export const withoutWoke = (list: readonly Target[], server: string, id: string): Target[] =>
  list.filter((item) => item.server !== server || item.id !== id)

// A woken session shows the clock in the trailing status slot of its vertical tab, ahead of the busy ring and the unread
// dot. A pending approval or question (`data-status="attention"`) still wins: it needs an answer, the clock only a look.
// The mark is native-ui's shared tab mark (`createTabMarks`, the clock glyph in the host's `--v2-orange-800`): positioning,
// the hover swap for the close button and the title fade are its. While the clock shows it owns the slot: sidebar-repos'
// last-activity label is hidden and the title fade falls back to the host's 30px, as for any status mark; the fade comes
// from the sidebar-repos link mask, which lists `data-notify`.
//
// With the `notifications` plugin installed the wake is published to it (`gui.ts`) and it draws the mark, so this one stays
// away: a session never shows two. Without it the clock is ours, as before.
export const OWNER = "snooze-archive"

export function createWokeMarks(doc: Document, hub: DomHub, target: (key: string) => Target | undefined, woke: (target: Target) => boolean) {
  return createTabMarks({
    doc,
    hub,
    owner: OWNER,
    mark: (key) => {
      const session = target(key)
      return session && woke(session) && !activeSink() ? { kind: "info", severity: "info", label: WOKE_LABEL, glyph: "clock" } : undefined
    },
  })
}
