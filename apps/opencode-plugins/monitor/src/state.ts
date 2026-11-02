/** What survives a restart besides the definition: the re-arm clock, the event counter, and when the service was last seen alive. */
export interface RunState {
  /** Last wake number sent; the next wake continues from it, so a seq is never reused across restarts. */
  readonly seq: number
  /** How many times the service restarted while this monitor existed (restored or announced lost). */
  readonly restartCount: number
  /** Last time the monitor was known alive (heartbeat, wake, clean shutdown). */
  readonly aliveAt: number
  /** Matched lines accepted as events over the monitor's whole life (all re-arms and restarts): what `maxEvents` counts. */
  readonly events: number
  readonly lastEventAt?: number
  readonly lastRearmAt?: number
  readonly nextRearmAt?: number
}

export function parseRunState(value: unknown): RunState | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const v = value as Record<string, unknown>
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined)
  const aliveAt = num(v.aliveAt)
  if (aliveAt === undefined) return undefined
  return {
    seq: Math.max(0, num(v.seq) ?? 0),
    restartCount: Math.max(0, num(v.restartCount) ?? 0),
    aliveAt,
    events: Math.max(0, Math.floor(num(v.events) ?? 0)),
    ...(num(v.lastEventAt) === undefined ? {} : { lastEventAt: num(v.lastEventAt)! }),
    ...(num(v.lastRearmAt) === undefined ? {} : { lastRearmAt: num(v.lastRearmAt)! }),
    ...(num(v.nextRearmAt) === undefined ? {} : { nextRearmAt: num(v.nextRearmAt)! }),
  }
}

/** One sentence naming the window the service was away, from the last time it was known alive. */
export function downtimeWindow(aliveAt: number | undefined, now: number): string {
  const to = new Date(now).toISOString()
  return aliveAt === undefined
    ? `It was down until ${to}; when it went down is unknown (no last-alive time was recorded).`
    : `It was down from ${new Date(aliveAt).toISOString()} to ${to}.`
}
