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

export function presets(now: Date): { label: string; until: number }[] {
  const calendar = (days: number, hour: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() + days)
    date.setHours(hour, 0, 0, 0)
    return date.getTime()
  }
  const evening = calendar(0, 18)
  return [
    { label: "In 1 hour", until: +now + 3_600_000 },
    { label: "In 3 hours", until: +now + 10_800_000 },
    ...(evening > +now ? [{ label: "This evening · 18:00", until: evening }] : []),
    { label: "Tomorrow · 09:00", until: calendar(1, 9) },
    { label: "Next Monday · 09:00", until: calendar((1 - now.getDay() + 7) % 7 || 7, 9) },
  ]
}

export function customTime(text: string, now: Date): number | undefined {
  const duration = /^\s*(\d+(?:\.\d+)?)\s*(m|h|d)\s*$/.exec(text)
  if (duration) {
    const value = +now + Number(duration[1]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 }[duration[2]] ?? 0)
    return Number.isFinite(value) && value > +now ? value : undefined
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return
  const date = new Date(text)
  const pad = (n: number) => String(n).padStart(2, "0")
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (local === text && +date > +now) return +date
}
