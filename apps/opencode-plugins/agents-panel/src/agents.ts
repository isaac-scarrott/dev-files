import type { MountedSession } from "@opencode/plugin/gui"

export type AgentRow = {
  key: string
  type: "subagent" | "shell"
  /** The child session of a subagent; opens it and interrupts it. */
  sessionID?: string
  label: string
  started: number
}

// Lists are undefined before their first sync despite their declarations, so every read tolerates a cold store.
type Sessions = {
  list?: () => readonly { id: string; parentID?: string; title?: string; time?: { created?: number; busy?: number } }[] | undefined
  family?: (id: string) => readonly string[] | undefined
  status?: (id: string) => string | undefined
}

// A child session is titled "<description> (@agent subagent)" until the call names it.
const description = (title: string) => title.replace(/\s*\(@[^)\s]+ subagent\)\s*$/, "")

/**
 * What runs under a session now. Like the app's own list, a subagent runs exactly while its session, or one below it,
 * is running; shells come from the session's background tasks. Shell start times are not exposed, so the caller
 * supplies the first time it saw each one.
 */
export function runningAgents(session: MountedSession, shellStarted: (id: string) => number): AgentRow[] {
  const sessions = session.server.data.session as unknown as Sessions
  const infos = new Map((sessions.list?.() ?? []).map((info) => [info.id, info]))
  const ids = new Set([...(sessions.family?.(session.id) ?? []), ...infos.keys()])

  const descends = (id: string) => {
    const seen = new Set<string>()
    let parent = infos.get(id)?.parentID
    while (parent && !seen.has(parent)) {
      if (parent === session.id) return true
      seen.add(parent)
      parent = infos.get(parent)?.parentID
    }
    return false
  }

  const subagents = [...ids].flatMap((id): AgentRow[] => {
    const info = infos.get(id)
    if (!info || id === session.id || !descends(id) || sessions.status?.(id) !== "running") return []
    return [
      {
        key: id,
        type: "subagent",
        sessionID: id,
        label: description(info.title ?? id),
        started: info.time?.busy ?? info.time?.created ?? shellStarted(id),
      },
    ]
  })

  const shells = (session.background ?? []).flatMap((task): AgentRow[] =>
    task.type === "shell"
      ? [{ key: task.id, type: "shell", label: task.label, started: shellStarted(task.id) }]
      : [],
  )

  return [...subagents.sort((a, b) => a.started - b.started), ...shells]
}

// 12s, 1m 05s, 1h 02m: the host's format, with the trailing unit padded so ticking keeps the same digit count.
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, "0")
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${pad(total % 60)}s`
  return `${Math.floor(total / 3600)}h ${pad(Math.floor(total / 60) % 60)}m`
}
