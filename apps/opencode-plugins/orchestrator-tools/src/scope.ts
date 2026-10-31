import type { Host, SessionInfo } from "./host.js"

const MAX_HOPS = 32

export const METADATA_KEY = "orchestrator"

export interface Marker {
  readonly creator: string
  readonly mode: "child" | "independent"
  readonly depth: number
}

export function marker(info: SessionInfo): Marker | undefined {
  const value = info.metadata?.[METADATA_KEY]
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const creator = (value as Record<string, unknown>).creator
  return typeof creator === "string" ? (value as unknown as Marker) : undefined
}

export function running(info: SessionInfo): boolean {
  const { busy, idle } = info.time
  return busy !== undefined && (idle === undefined || busy > idle)
}

export interface SessionSummary {
  readonly id: string
  readonly title?: string
  readonly parentID?: string
  readonly agent?: string
  readonly model?: string
  readonly directory: string
  readonly state: "running" | "idle"
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  readonly created: number
  readonly updated: number
}

export function describe(info: SessionInfo): SessionSummary {
  return {
    id: info.id,
    title: info.title,
    parentID: info.parentID,
    agent: info.agent,
    model: info.model ? `${info.model.providerID}/${info.model.id}` : undefined,
    directory: info.location.directory,
    state: running(info) ? "running" : "idle",
    outcome: info.outcome,
    created: info.time.created,
    updated: info.time.updated,
  }
}

/** Parent, grandparent, … of a session. Stops at a missing parent or a cycle. */
export async function ancestors(host: Host, info: SessionInfo): Promise<SessionInfo[]> {
  const chain: SessionInfo[] = []
  const seen = new Set<string>([info.id])
  let current = info
  while (current.parentID && chain.length < MAX_HOPS && !seen.has(current.parentID)) {
    let parent: SessionInfo
    try {
      parent = await host.session.get({ sessionID: current.parentID })
    } catch {
      break
    }
    chain.push(parent)
    seen.add(parent.id)
    current = parent
  }
  return chain
}

export async function reachable(host: Host, caller: SessionInfo, target: SessionInfo, scope: "tree" | "project"): Promise<boolean> {
  if (target.id === caller.id) return true
  if (marker(target)?.creator === caller.id) return true
  if (caller.parentID !== undefined && target.parentID === caller.parentID) return true
  if (target.parentID !== undefined) {
    const chain = await ancestors(host, target)
    if (chain.some((a) => a.id === caller.id || marker(a)?.creator === caller.id)) return true
  }
  return scope === "project" && target.projectID === caller.projectID
}
