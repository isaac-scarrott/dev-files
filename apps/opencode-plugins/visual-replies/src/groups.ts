/** The host folds finished tool calls into a collapsed "Used N Execute" row whose id list stays in the DOM while closed. */
export const groupSelector = '[data-component="collapsed-tool-group"][data-timeline-part-ids]'

const triggerSelector = ':scope > [data-component="collapsible"] > [data-slot="collapsible-trigger"]'

export interface GroupScan {
  /** Ids inside collapsed groups that no page is known for yet. */
  unknown: string[]
}

/**
 * Opens each collapsed tool group that holds a published page, once per page id. The click is the host's own, so its
 * expand motion and open state apply; a group the reader closes again stays closed because its ids are in `opened`.
 */
export function openPublishedGroups(doc: Document, known: ReadonlySet<string>, opened: Set<string>): GroupScan {
  const unknown: string[] = []
  for (const group of doc.querySelectorAll(groupSelector)) {
    const ids = group.getAttribute("data-timeline-part-ids")!.split(",").filter(Boolean)
    const published = ids.filter((id) => known.has(id))
    unknown.push(...ids.filter((id) => !known.has(id)))
    if (!published.some((id) => !opened.has(id))) continue
    const trigger = group.querySelector<HTMLElement>(triggerSelector)
    if (!trigger) continue
    for (const id of published) opened.add(id)
    if (trigger.getAttribute("aria-expanded") === "false") trigger.click()
  }
  return { unknown }
}
