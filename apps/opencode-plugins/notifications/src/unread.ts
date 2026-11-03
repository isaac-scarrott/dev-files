import type { Candidate } from "./ledger"

interface SessionInfo {
  readonly id: string
  readonly parentID?: string
  readonly time?: { readonly idle?: number; readonly viewed?: number; readonly archived?: number }
}

/** The slice of a server's synced session store this reads. */
export interface UnreadData {
  session: { list(): readonly SessionInfo[] | undefined }
}

/**
 * The host's own unread dot as go-to-next stops: root sessions that went idle after the user last viewed them
 * (`time.idle > time.viewed`, the host's test), archived ones left out. Read on demand, never watched.
 */
export function unreadRoots(server: string, data: UnreadData): Candidate[] {
  const stops: Candidate[] = []
  for (const info of data.session.list() ?? []) {
    const idle = info.time?.idle
    if (info.parentID || info.time?.archived || idle === undefined || idle <= (info.time?.viewed ?? 0)) continue
    stops.push({ server, session: info.id, kind: "done", at: idle })
  }
  return stops
}
