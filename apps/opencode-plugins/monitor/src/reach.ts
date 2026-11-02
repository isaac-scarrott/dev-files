/**
 * Which sessions a monitor may wake: the caller, its parent, and its own tree. This is the `tree` scope of
 * orchestrator-tools' `send_message` (scope.ts `reachable` plus the parent that `list_peers` shows), copied because
 * plugins are separate packages; keep the two in step.
 */
export interface SessionLike {
  readonly id: string
  readonly parentID?: string
  readonly metadata?: Record<string, unknown>
}

export interface SessionReader {
  get(input: { sessionID: string }): Promise<SessionLike>
}

const MARKER_KEY = "orchestrator"
const MAX_HOPS = 32

/** Id of the session that created `info` through orchestrator-tools, when it was started as an independent session. */
function creator(info: SessionLike): string | undefined {
  const value = info.metadata?.[MARKER_KEY]
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const id = (value as Record<string, unknown>).creator
  return typeof id === "string" ? id : undefined
}

async function ancestors(sessions: SessionReader, info: SessionLike): Promise<SessionLike[]> {
  const chain: SessionLike[] = []
  const seen = new Set<string>([info.id])
  let current = info
  while (current.parentID && chain.length < MAX_HOPS && !seen.has(current.parentID)) {
    let parent: SessionLike
    try {
      parent = await sessions.get({ sessionID: current.parentID })
    } catch {
      break
    }
    chain.push(parent)
    seen.add(parent.id)
    current = parent
  }
  return chain
}

export async function mayWake(sessions: SessionReader, caller: SessionLike, target: SessionLike): Promise<boolean> {
  if (target.id === caller.id || target.id === caller.parentID) return true
  if (creator(target) === caller.id) return true
  if (caller.parentID !== undefined && target.parentID === caller.parentID) return true
  if (target.parentID === undefined) return false
  const chain = await ancestors(sessions, target)
  return chain.some((a) => a.id === caller.id || creator(a) === caller.id)
}
