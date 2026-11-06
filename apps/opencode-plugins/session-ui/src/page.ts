export const FIRST_PAGE = 10
export const NEXT_PAGE = 25

// Rows still hidden behind the button: `loaded` are in memory, `more` says unloaded ones exist (their number is unknown).
export function moreStep(shown: number, loaded: number, more: boolean) {
  if (more) return NEXT_PAGE
  return Math.min(NEXT_PAGE, Math.max(0, loaded - shown))
}
export const moreLabel = (step: number) => `Show ${step} more`

// The first `limit` of several servers' lists, newest update first. Each list keeps its own order; ties go to the earlier list.
export function firstOf<T extends { time: { updated: number } }>(lists: { id: string; rows: T[] }[], limit: number) {
  const heads = lists.map(() => 0)
  const out: { server: string; row: T }[] = []
  while (out.length < limit) {
    let best = -1
    lists.forEach((list, i) => {
      const row = list.rows[heads[i]]
      if (row && (best < 0 || row.time.updated > lists[best].rows[heads[best]].time.updated)) best = i
    })
    if (best < 0) break
    out.push({ server: lists[best].id, row: lists[best].rows[heads[best]++] })
  }
  return out
}
