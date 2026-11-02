import type { ServerRef } from "@opencode/plugin/gui"

export type ArchivedSession = Awaited<ReturnType<ServerRef["client"]["session"]["get"]>>

// One server's archived inventory, loaded a page at a time. `more`: a next page exists; `stale`: a refresh was asked, so the
// next page fetched is the first again and replaces the rows; `gen` drops a response that a refresh has since overtaken.
export interface ArchivePage { rows: ArchivedSession[]; next?: string; more: boolean; loaded: boolean; busy: boolean; stale: boolean; gen: number; error?: string }
export const emptyPage = (): ArchivePage => ({ rows: [], more: false, loaded: false, busy: false, stale: false, gen: 0 })

export async function loadArchivePage(server: ServerRef, cursor: string | undefined, limit: number, signal: AbortSignal) {
  const page = await server.client.session.list({ archived: true, parentID: null, limit, cursor }, { signal })
  const next = page.cursor.next ?? undefined
  if (next && next === cursor) throw new Error("Archive pagination repeated a cursor")
  return { rows: page.data.filter((row) => row.time.archived !== undefined), next }
}

// A fetched page joins the loaded rows; a row that arrived by event meanwhile is kept once, at its place. The first page after a refresh replaces them.
export function appendPage(state: ArchivePage, rows: ArchivedSession[], next: string | undefined): ArchivePage {
  const base = state.stale ? [] : state.rows
  const seen = new Set(base.map((row) => row.id))
  return { ...state, rows: [...base, ...rows.filter((row) => !seen.has(row.id))], next, more: next !== undefined, loaded: true, stale: false }
}

export function dropArchived(state: ArchivePage, id: string): ArchivePage {
  return state.rows.some((row) => row.id === id) ? { ...state, rows: state.rows.filter((row) => row.id !== id) } : state
}

// A session whose archive state changed. Loaded rows are replaced in place (a rename) or dropped (restored); a newly archived
// one goes where the server's order puts it (newest update first), unless that is past the loaded tail while pages remain:
// then it arrives with the page that holds it.
export function upsertArchived(state: ArchivePage, info: ArchivedSession): ArchivePage {
  if (info.time.archived === undefined || info.parentID) return dropArchived(state, info.id)
  const at = state.rows.findIndex((row) => row.id === info.id)
  if (at >= 0) return { ...state, rows: state.rows.map((row, i) => i === at ? info : row) }
  const index = state.rows.findIndex((row) => row.time.updated < info.time.updated)
  if (index < 0 && state.more) return state
  const rows = [...state.rows]
  rows.splice(index < 0 ? rows.length : index, 0, info)
  return { ...state, rows }
}

type DedicatedCall = (input: { sessionID: string }, options: { signal: AbortSignal }) => Promise<unknown>

// The host's own call when its client has one (2.2.5 does not: only session.update({ archived })), else the update. The
// dedicated call's argument shape is unverified, so a call that fails falls back to the update; the state is verified after.
export async function writeArchived(server: ServerRef, id: string, archived: boolean, signal: AbortSignal) {
  const session = server.client.session as unknown as Record<string, unknown>
  const dedicated = session[archived ? "archive" : "unarchive"]
  if (typeof dedicated === "function") {
    try { await (dedicated as DedicatedCall).call(session, { sessionID: id }, { signal }); return "dedicated" as const } catch (cause) { if (signal.aborted) throw cause }
  }
  await server.client.session.update({ sessionID: id, archived }, { signal })
  return "update" as const
}

export async function setArchived(server: ServerRef, id: string, archived: boolean, signal: AbortSignal) {
  await writeArchived(server, id, archived, signal)
  const info = await server.client.session.get({ sessionID: id }, { signal })
  if ((info.time.archived !== undefined) !== archived) throw new Error("Server did not confirm archive state")
  return info
}

// Native permanent delete; works for archived sessions too, which are ordinary stored sessions.
export async function removeSession(server: ServerRef, id: string, signal: AbortSignal) {
  await server.client.session.remove({ sessionID: id }, { signal })
}

// Archiving bumps time.updated to the archive moment (within ms), so it is not when the thread was last active. Then the
// session's last busy/idle transition stands in for it, else its creation. A later update (activity after the archive) wins.
export function archivedActivity(time: { created: number; updated: number; busy?: number; idle?: number; archived?: number }) {
  if (time.archived === undefined || time.updated < time.archived) return time.updated
  return Math.max(time.idle ?? 0, time.busy ?? 0) || time.created
}
