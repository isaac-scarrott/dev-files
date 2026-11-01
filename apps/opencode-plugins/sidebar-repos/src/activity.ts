const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

// Compact age with no "ago": now, 5m, 2h, 3d, 2w, 4mo, 2y. A timestamp slightly in the future (clock skew) reads "now".
export function formatAge(at: number, now: number) {
  const age = Math.max(0, now - at)
  if (age < MINUTE) return "now"
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`
  if (age < DAY) return `${Math.floor(age / HOUR)}h`
  if (age < WEEK) return `${Math.floor(age / DAY)}d`
  if (age < MONTH) return `${Math.floor(age / WEEK)}w`
  if (age < 365 * DAY) return `${Math.floor(age / MONTH)}mo`
  return `${Math.floor(age / (365 * DAY))}y`
}

// "Fri, 31 Oct 2026, 22:16:04 GMT+1": local date and time with the zone.
export function fullTime(at: number, locale?: string) {
  return new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "long" })
}

interface Timed {
  type?: string
  time?: { created?: number; completed?: number }
}

// The newest user or assistant message wins; other entries (agent/model switches, idle markers) are not conversation.
// Messages are chronological, so the scan from the end stops at the first hit. Without any, the session's own update time.
export function lastActivity(messages: readonly Timed[] | undefined, updated: number | undefined) {
  for (let index = (messages?.length ?? 0) - 1; index >= 0; index--) {
    const message = messages![index]
    if (message.type !== "user" && message.type !== "assistant") continue
    const at = message.time?.completed ?? message.time?.created
    if (at !== undefined && Number.isFinite(at)) return at
  }
  return updated !== undefined && Number.isFinite(updated) ? updated : undefined
}

export const TICK_MS = 30_000

export interface TickerEnv {
  setInterval(fn: () => void, ms: number): number
  clearInterval(id: number): void
  visible(): boolean
}

// One timer for every row. It runs only while the window is visible; `wake` (focus, visibilitychange) refreshes at once.
export function createTicker(env: TickerEnv, onTick: () => void) {
  let id: number | undefined
  const stop = () => {
    if (id === undefined) return
    env.clearInterval(id)
    id = undefined
  }
  const sync = () => {
    if (!env.visible()) return stop()
    if (id === undefined) id = env.setInterval(onTick, TICK_MS)
  }
  sync()
  return {
    wake() {
      sync()
      if (env.visible()) onTick()
    },
    dispose: stop,
  }
}
