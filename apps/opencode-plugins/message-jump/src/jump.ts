export const SCROLL_SLOT = "[data-slot='session-timeline-scroll']"
export const USER_ROW = "[data-timeline-row='UserMessage']"
export const USER_TEXT = "[data-slot='user-message-text']"

// The app's own "at the bottom" check uses a few pixels of slack; match it so the pill does not
// flicker while the timeline settles.
export const AWAY_FROM_BOTTOM = 16

export type ScrollMetrics = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export type Row = {
  element: HTMLElement
  top: number
  bottom: number
}

export function awayFromBottom(metrics: ScrollMetrics, threshold = AWAY_FROM_BOTTOM) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight > threshold
}

// The user message whose end has left the top of the reading area: the one a jump would bring back.
// Rows mount above and below it, so take the last one that still sits above `edge`.
export function nearestAbove(rows: readonly Row[], edge: number) {
  let found: Row | undefined

  for (const row of rows) if (row.bottom <= edge) found = row

  return found
}

export function snippet(element: HTMLElement, limit = 90) {
  const text = (element.querySelector(USER_TEXT)?.textContent ?? element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()

  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`
}

// Virtualized rows that are still measuring report an empty box; they are not candidates.
export function userRows(container: HTMLElement): Row[] {
  return [...container.querySelectorAll<HTMLElement>(USER_ROW)].flatMap((element) => {
    const rect = element.getBoundingClientRect()

    return rect.bottom - rect.top > 0 ? [{ element, top: rect.top, bottom: rect.bottom }] : []
  })
}
