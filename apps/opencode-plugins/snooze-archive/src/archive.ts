import type { ServerRef } from "@opencode/plugin/gui"

export type ArchivedSession = Awaited<ReturnType<ServerRef["client"]["session"]["get"]>>

// Publish only a complete inventory. An intermediate page is not an archive count.
export async function loadArchive(server: ServerRef, signal: AbortSignal): Promise<ArchivedSession[]> {
  const rows = new Map<string, ArchivedSession>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await server.client.session.list({ archived: true, parentID: null, limit: 100, cursor }, { signal })
    for (const row of page.data) if (row.time.archived !== undefined) rows.set(row.id, row)
    cursor = page.cursor.next ?? undefined
    if (cursor && cursors.has(cursor)) throw new Error("Archive pagination repeated a cursor")
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return [...rows.values()]
}

export async function setArchived(server: ServerRef, id: string, archived: boolean, signal: AbortSignal) {
  await server.client.session.update({ sessionID: id, archived }, { signal })
  const info = await server.client.session.get({ sessionID: id }, { signal })
  if ((info.time.archived !== undefined) !== archived) throw new Error("Server did not confirm archive state")
  return info
}

// Native permanent delete; works for archived sessions too, which are ordinary stored sessions.
export async function removeSession(server: ServerRef, id: string, signal: AbortSignal) {
  await server.client.session.remove({ sessionID: id }, { signal })
}
