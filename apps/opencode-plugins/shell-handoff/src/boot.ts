/**
 * Identifies the service process. A plugin hot reload loads this module again inside the same process, so the id is kept
 * on `globalThis` under a `Symbol.for` key and every copy of the module agrees on it; a real restart is a new process and
 * gets a new one. The pid plus the start time cannot repeat, even when the OS reuses the pid.
 */
const KEY = Symbol.for("opencode.shell-handoff.boot")

export function bootId(): string {
  const slot = globalThis as unknown as Record<symbol, string | undefined>
  const existing = slot[KEY]
  if (existing) return existing
  const id = `${process.pid}:${Math.round(Date.now() - process.uptime() * 1000)}`
  slot[KEY] = id
  return id
}

/** When the process with this boot id started, in epoch milliseconds; `undefined` for an id that is not ours. */
export function bootStart(id: string): number | undefined {
  const start = Number(id.split(":")[1])
  return Number.isFinite(start) ? start : undefined
}
