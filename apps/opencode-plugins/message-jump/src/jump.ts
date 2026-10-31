export const SCROLL_SLOT = "[data-slot='session-timeline-scroll'] > .scroll-view__viewport[data-scrollable]"
export const USER_ROW = "[data-timeline-row='UserMessage']"
export const USER_TEXT = "[data-slot='user-message-text']"

export type Row = {
  element: HTMLElement
  top: number
  bottom: number
}

// The user message whose end has left the top of the reading area: the one a jump would bring back.
// Virtualized DOM order need not be visual order.
export function nearestAbove(rows: readonly Row[], edge: number) {
  let found: Row | undefined

  for (const row of rows) {
    if (row.bottom <= edge && (!found || row.bottom > found.bottom)) found = row
  }

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
