// Time for a chip's rows: remaining spans at minute granularity, and the one delay after which a displayed span changes.

export const MINUTE = 60_000

/** "1m", "12m", "1h 5m", "2h", "2d 3h": what is left, rounded up to the minute, so the last minute still reads "1m". */
export function span(ms: number): string {
  if (ms <= 0) return "0m"
  const minutes = Math.ceil(ms / MINUTE)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  const rest = minutes % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
  return `${rest}m`
}

/**
 * Milliseconds until the first of these deadlines changes what `span` says about it, or undefined when none is ahead.
 * `span` rounds up, so a span changes just after the remaining time crosses a whole minute.
 */
export function nextChange(deadlines: readonly number[], now: number): number | undefined {
  let soonest: number | undefined
  for (const deadline of deadlines) {
    const left = deadline - now
    if (left <= 0) continue
    const wait = (left % MINUTE || MINUTE) + 20
    if (soonest === undefined || wait < soonest) soonest = wait
  }
  return soonest
}
