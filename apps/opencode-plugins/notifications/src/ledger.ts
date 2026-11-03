import type { Notification, NotifyKind, NotifySeverity } from "../../native-ui/src/notify-contract"

/** A notification that points at a session and is still waiting for the user to look at it. */
export interface Entry {
  readonly source: string
  readonly key: string
  readonly kind: NotifyKind
  readonly severity: NotifySeverity
  readonly title: string
  readonly server: string
  readonly session: string
  readonly at: number
  readonly persistent: boolean
  /** Made from the host's own events: the host already draws its dot or attention mark, so no mark of ours. */
  readonly host: boolean
}

export interface SessionRef {
  readonly server: string
  readonly session: string
}

export const RANK: Record<NotifyKind, number> = { "needs-you": 0, error: 1, done: 2, info: 3 }

/** Go to next visits these; `info` marks but never pulls the user anywhere. */
export type JumpKind = "needs-you" | "error" | "done"
export interface Candidate extends SessionRef {
  readonly kind: JumpKind
  readonly at: number
}

/** The most entries held; a flood drops the oldest transient ones first. */
export const MAX_ENTRIES = 500
/** The most plugin-sourced entries kept in storage (the store only holds inert keys; the cap bounds what a deleted session leaves). */
export const MAX_STORED = 200

export const sessionKey = (ref: SessionRef) => `${ref.server}\u0000${ref.session}`
export const entryId = (source: string, key: string) => `${source}\u0000${key}`

/**
 * What the hub holds for go-to-next, the titlebar count and the tab marks: one entry per `(source, key)`, whether or not a
 * toast was shown for it. Created in `setup`; `onChange` runs after every change that alters what is held.
 */
export class Ledger {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly onChange: () => void) {}

  put(n: Notification, host: boolean): void {
    if (!n.target) return
    const entry: Entry = { source: n.source, key: n.key, kind: n.kind, severity: n.severity, title: n.title, server: n.target.server, session: n.target.session, at: n.at, persistent: n.persistent, host }
    const id = entryId(n.source, n.key)
    this.entries.delete(id)
    this.entries.set(id, entry)
    if (this.entries.size > MAX_ENTRIES) this.trim()
    this.onChange()
  }

  remove(source: string, key: string): boolean {
    const removed = this.entries.delete(entryId(source, key))
    if (removed) this.onChange()
    return removed
  }

  /** The user looked at the session: everything waiting on it is seen, except a request that still needs an answer. */
  clearSession(ref: SessionRef): number {
    let count = 0
    for (const [id, entry] of this.entries) {
      if (entry.persistent || entry.server !== ref.server || entry.session !== ref.session) continue
      this.entries.delete(id)
      count++
    }
    if (count) this.onChange()
    return count
  }

  list(): Entry[] {
    return [...this.entries.values()]
  }

  /** Replaces what is held with entries read from storage (plugin-sourced only; a stored entry is never persistent). */
  load(stored: readonly Pick<Entry, "source" | "key" | "kind" | "severity" | "title" | "server" | "session" | "at">[]): void {
    for (const item of stored) {
      const id = entryId(item.source, item.key)
      if (!this.entries.has(id)) this.entries.set(id, { ...item, persistent: false, host: false })
    }
    this.onChange()
  }

  /** The plugin-sourced, non-persistent entries that survive a reload, newest last. */
  stored(): Entry[] {
    return this.list()
      .filter((entry) => !entry.host && !entry.persistent)
      .slice(-MAX_STORED)
  }

  private trim(): void {
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= MAX_ENTRIES) return
      if (!entry.persistent) this.entries.delete(id)
    }
  }
}

/** Sessions with a `needs-you` or `error` waiting: what the titlebar counts. */
export function urgentCount(entries: readonly Entry[]): number {
  const sessions = new Set<string>()
  for (const entry of entries) if (entry.kind === "needs-you" || entry.kind === "error") sessions.add(sessionKey(entry))
  return sessions.size
}

/** The entry a tab shows: plugin-sourced, its kind's Mark switch on, the highest kind, the newest of those. */
export function markEntry(entries: readonly Entry[], ref: SessionRef, enabled: (kind: NotifyKind) => boolean): Entry | undefined {
  let best: Entry | undefined
  for (const entry of entries) {
    if (entry.host || entry.server !== ref.server || entry.session !== ref.session || !enabled(entry.kind)) continue
    if (!best || RANK[entry.kind] < RANK[best.kind] || (RANK[entry.kind] === RANK[best.kind] && entry.at > best.at)) best = entry
  }
  return best
}

/** The marks of every session at once, in one pass: `sessionKey` → entry. */
export function markEntries(entries: readonly Entry[], enabled: (kind: NotifyKind) => boolean): Map<string, Entry> {
  const marks = new Map<string, Entry>()
  for (const entry of entries) {
    if (entry.host || !enabled(entry.kind)) continue
    const id = sessionKey(entry)
    const best = marks.get(id)
    if (!best || RANK[entry.kind] < RANK[best.kind] || (RANK[entry.kind] === RANK[best.kind] && entry.at > best.at)) marks.set(id, entry)
  }
  return marks
}

const isJump = (kind: NotifyKind): kind is JumpKind => kind !== "info"

/**
 * The order go-to-next walks: one stop per session at its highest kind (needs-you, then error, then done), the oldest
 * first within a kind, so what has waited longest comes first.
 */
export function order(candidates: readonly Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const id = sessionKey(candidate)
    const current = best.get(id)
    if (!current || RANK[candidate.kind] < RANK[current.kind] || (RANK[candidate.kind] === RANK[current.kind] && candidate.at < current.at)) best.set(id, candidate)
  }
  return [...best.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.at - b.at || sessionKey(a).localeCompare(sessionKey(b)))
}

/** The ledger's entries as stops, `info` left out. */
export const stops = (entries: readonly Entry[]): Candidate[] =>
  entries.flatMap((entry) => (isJump(entry.kind) ? [{ server: entry.server, session: entry.session, kind: entry.kind, at: entry.at }] : []))

/**
 * The next stop: never the session on screen, and after the last one visited, so repeated presses walk the whole list
 * (two waiting requests do not bounce between themselves while a third waits). `previous` is the order the last press saw:
 * a stop that was cleared by visiting it still marks where the walk is. Undefined when there is nowhere to go.
 */
export function pickNext(ordered: readonly Candidate[], current?: SessionRef, last?: SessionRef, previous: readonly SessionRef[] = ordered): Candidate | undefined {
  const usable = new Map(ordered.filter((candidate) => !current || sessionKey(candidate) !== sessionKey(current)).map((candidate) => [sessionKey(candidate), candidate]))
  if (usable.size === 0) return undefined
  const walk = previous.map(sessionKey)
  const after = last ? walk.indexOf(sessionKey(last)) : -1
  if (after === -1) return [...usable.values()][0]
  for (const key of [...walk.slice(after + 1), ...walk.slice(0, after + 1)]) {
    const found = usable.get(key)
    if (found) return found
  }
  return [...usable.values()][0]
}
