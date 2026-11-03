export const wrapperSelector = '[data-component="tool-part-wrapper"][data-timeline-part-id]'
/** The host folds finished and running tool calls into one "Used N ..." row whose part ids stay in the DOM while it is closed. */
export const groupSelector = '[data-component="collapsed-tool-group"][data-timeline-part-ids]'
export const timelineSelector = '[data-slot="session-timeline-scroll"]'
const contentSelector = '[data-slot="session-turn-assistant-content"]'

/** `Node.DOCUMENT_POSITION_FOLLOWING`, spelled out so this runs without a global `Node`. */
const FOLLOWING = 4
const shown = (el: Element) => el.getClientRects().length > 0

/** The timeline on screen. Cached timelines of other sessions stay mounted but hidden, so visibility picks the routed one. */
export function visibleTimeline(doc: Document): Element | undefined {
  return [...doc.querySelectorAll(timelineSelector)].find(shown)
}

/**
 * The host marks the running turn's content `aria-hidden` while it works. A card inside it would be unreachable by
 * assistive technology, so it goes after the outermost hidden ancestor instead, in the same column.
 */
function outsideHidden(el: Element, timeline: Element): Element {
  let top = el
  for (let node = el.parentElement; node && node !== timeline; node = node.parentElement) {
    if (node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")) top = node
  }
  return top
}

export type Anchor = { after: Element; kind: "row" | "group" | "latest" | "end" }

/**
 * Where a request's card goes: after the tool row of the call that asked (by tool part id, first id wins), or after the
 * folded group that holds it, else after the newest tool row or group on screen, else the end of the newest assistant
 * message. The host has no timeline extension point (host-architecture §8), so this is DOM next to its row, never inside it.
 */
export function findAnchor(doc: Document, partIDs: readonly string[], fallback: boolean): Anchor | undefined {
  const timeline = visibleTimeline(doc)
  if (!timeline) return undefined
  const wrappers = [...timeline.querySelectorAll(wrapperSelector)]
  const groups = [...timeline.querySelectorAll(groupSelector)]
  for (const id of partIDs) {
    const wrapper = wrappers.find((el) => el.getAttribute("data-timeline-part-id") === id)
    if (wrapper) return { after: outsideHidden(wrapper, timeline), kind: "row" }
    const group = groups.find((el) => el.getAttribute("data-timeline-part-ids")!.split(",").includes(id))
    if (group) return { after: outsideHidden(group, timeline), kind: "group" }
  }
  // Only an open card must be seen somewhere; an answered row belongs next to its own call or nowhere.
  if (!fallback) return undefined
  const latest = [...wrappers, ...groups].sort((a, b) => (a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1)).at(-1)
  if (latest) return { after: outsideHidden(latest, timeline), kind: "latest" }
  const content = [...timeline.querySelectorAll(contentSelector)].at(-1)
  return content ? { after: outsideHidden(content, timeline), kind: "end" } : undefined
}

/** Puts `host` where the anchor says, moving only when it is not there already. Returns whether it is placed. */
export function place(host: HTMLElement, anchor: Anchor | undefined): boolean {
  if (!anchor) return false
  host.setAttribute("data-anchor", anchor.kind)
  if (host.previousElementSibling !== anchor.after) anchor.after.after(host)
  return true
}
