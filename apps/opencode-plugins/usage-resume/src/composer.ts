/** The composer's control row: the flex row inside `[data-slot=composer-controls]` that holds the model picker. */
const CONTROLS = '[data-slot="composer-controls"] > div'

export const MOUNT_ATTR = "data-usage-resume-toggle"

function shown(el: Element): boolean {
  return el.getClientRects().length > 0
}

/**
 * The row of the composer that is on screen. The app keeps composers of other sessions mounted but hidden, and a draft
 * composer shows when no session is routed, so the visible one is the routed session's.
 */
export function visibleControls(root: ParentNode): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)].find(shown)
}

/** The slot our button occupies: right after the model picker, in the same row, so it scrolls and truncates with it. */
export function placeMount(row: HTMLElement, make: () => HTMLElement): HTMLElement {
  const existing = row.querySelector<HTMLElement>(`:scope > [${MOUNT_ATTR}]`)
  if (existing) return existing
  const mount = make()
  mount.setAttribute(MOUNT_ATTR, "")
  row.append(mount)
  return mount
}
