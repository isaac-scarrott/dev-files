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
