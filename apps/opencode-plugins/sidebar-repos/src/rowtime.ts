import { formatAge, fullTime } from "./activity"

// The contract with other plugins: a vertical row carrying `data-sidebar-active-at="<epoch ms>"` gets the time of its
// last activity at the row's end. Live rows get the attribute from here (by tab key); snooze-archive sets it on its
// Archived rows. A row with a status indicator shows none.
export const ACTIVE_AT = "data-sidebar-active-at"
const ROW = "[data-titlebar-tab][data-orientation='vertical']"
const INDICATOR = "[data-status='busy'], [data-status='attention'], [data-status='unread'], [data-sidebar-attention]"

export const hasIndicator = (row: Element) => row.matches(INDICATOR)

const activeAt = (row: Element) => {
  const value = Number(row.getAttribute(ACTIVE_AT))
  return row.hasAttribute(ACTIVE_AT) && Number.isFinite(value) ? value : undefined
}

// Live rows only: copy the plugin-side store's last-activity time onto the row. Rows of other plugins (no tab key)
// own their attribute.
export function stampActivity(document: Document, at: ReadonlyMap<string, number>) {
  for (const row of document.querySelectorAll<HTMLElement>(ROW)) {
    const key = row.closest("[data-tab-key]")?.getAttribute("data-tab-key")
    if (key === null || key === undefined) continue
    const value = at.get(key)
    if (value === undefined) row.removeAttribute(ACTIVE_AT)
    else if (row.getAttribute(ACTIVE_AT) !== String(value)) row.setAttribute(ACTIVE_AT, String(value))
  }
}

// Tooltip addition for a row's repo badge, which is hoverable where the time (under the row's own hover affordances) is not.
export const lastActiveTitle = (row: Element | null) => {
  const at = row ? activeAt(row) : undefined
  return at === undefined ? undefined : `Last active ${fullTime(at)}`
}

// Writes the time into the row's close slot, in the status mark's place. `measure` returns the text width in px; the row
// keeps it in --sidebar-time-width so the end fade can stop short of the text.
export function renderTimes(document: Document, now: number, measure: (text: string) => number) {
  for (const row of document.querySelectorAll<HTMLElement>(ROW)) {
    const at = activeAt(row)
    const slot = row.querySelector<HTMLElement>(":scope > [data-slot='tab-close']")
    const existing = slot?.querySelector<HTMLElement>(":scope > [data-sidebar-time]")
    if (!slot || at === undefined || hasIndicator(row)) {
      existing?.remove()
      row.removeAttribute("data-sidebar-time-shown")
      row.style.removeProperty("--sidebar-time-width")
      continue
    }
    const node = existing ?? document.createElement("span")
    if (!existing) {
      node.setAttribute("data-sidebar-time", "")
      node.setAttribute("aria-hidden", "true")
      slot.prepend(node)
    }
    const text = formatAge(at, now)
    if (node.textContent !== text) node.textContent = text
    // The tooltip depends on `at` alone; formatting it for every row on every refresh was most of a refresh.
    if (node.getAttribute("data-at") !== String(at)) {
      node.setAttribute("data-at", String(at))
      node.title = fullTime(at)
    }
    if (!row.hasAttribute("data-sidebar-time-shown")) row.setAttribute("data-sidebar-time-shown", "")
    const width = `${Math.ceil(measure(text))}px`
    if (row.style.getPropertyValue("--sidebar-time-width") !== width) row.style.setProperty("--sidebar-time-width", width)
  }
}

export function removeTimes(document: Document) {
  document.querySelectorAll("[data-sidebar-time]").forEach((node) => node.remove())
  document.querySelectorAll("[data-sidebar-time-shown]").forEach((row) => {
    row.removeAttribute("data-sidebar-time-shown")
    ;(row as HTMLElement).style.removeProperty("--sidebar-time-width")
  })
  document.querySelectorAll(`[data-tab-key] ${ROW}`).forEach((row) => row.removeAttribute(ACTIVE_AT))
}
