export interface Snooze {
  server: string
  id: string
  title: string
  at: number
  until: number
  updated: number
  busy: number
}

export const sessionKey = (server: string, id: string) => `${server}\n${id}`

// A prompt the user typed: composer, queued or steering send, slash command. The composer stamps `payload.metadata.displayText`
// (OpenCode 2.2.5, read off real sends: also on slash commands, where it is the "/command args" line). Peer messages, monitor
// and scheduler wakes are user-typed inbox items too, but they stamp their own keys and no `displayText`, and a client that
// calls the prompt API directly stamps nothing. Only the composer's stamp counts, so a sender we do not know is not the user.
export function isUserSend(item: { type?: string; payload?: object } | undefined) {
  const metadata = (item?.payload as { metadata?: Record<string, unknown> } | undefined)?.metadata
  return item?.type === "user" && typeof metadata?.displayText === "string"
}

export interface Observation {
  attention: boolean
  updated: number
  busy: number
  idle: number
  archived: boolean
}

export function wakeReason(snooze: Snooze, state: Observation, now: number): string | undefined {
  if (state.archived) return "archived"
  if (state.attention) return "attention"
  if (state.busy > snooze.busy) return "new work"
  if (state.idle > snooze.at) return "completed"
  if (now >= snooze.until) return "scheduled"
}
