import { createComponent } from "solid-js"
import type { Host } from "./host"

export type ActionName = "snooze" | "archive" | "delete"
export interface Target { server: string; id: string }
export interface Handlers { run(action: ActionName, target: Target): void }

export const labels: Record<ActionName, string> = { snooze: "Snooze…", archive: "Archive", delete: "Delete…" }

// Archive replaces the app's close X: it is mounted inside the tab's own `tab-close` slot as the same IconButton the host
// renders for the X (small, ghost-muted, `hover-reveal relative z-10`, no tooltip, pointer/mouse down swallowed), so the slot's
// position, reveal, hover and press chrome are the host's. The X itself is hidden. Snooze and Delete live in the context menu.
export function createActions(host: Host, slot: HTMLElement, target: () => Target | undefined, title: () => string, handlers: Handlers, disabled: () => boolean = () => false) {
  const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation() }
  const holder = slot.ownerDocument.createElement("div")
  const unmount = host.mount(holder, () => createComponent(host.ui.IconButton, {
    icon: "archive",
    size: "small",
    variant: "ghost-muted",
    class: "hover-reveal relative z-10",
    get label() { return `${labels.archive} ${title()}`.trim() },
    get disabled() { return disabled() },
    onClick(event: MouseEvent) {
      swallow(event)
      const t = target()
      if (t && !disabled()) handlers.run("archive", t)
    },
  }))
  // The host's X swallows pointer and mouse down so the row neither starts a drag nor takes focus; do the same. The button
  // is moved out of the holder because the host's close rules select the slot's direct `button` child.
  const button = holder.firstElementChild as HTMLElement | null
  if (button) {
    button.setAttribute("data-sa-actions", "tab")
    button.addEventListener("pointerdown", swallow)
    button.addEventListener("mousedown", swallow)
    slot.append(button)
  }
  const dispose = () => { unmount(); button?.remove() }
  return { slot, dispose }
}

export const actionsCss = `
[data-sa-tab-host] [data-slot="tab-close"] > button:not([data-sa-actions]) { display: none; }
/* The host paints this slot with an opaque fill to hide the text under its X; the row fade already does that, and the fill shows as a block on the active row. */
[data-sa-tab-host] [data-titlebar-tab] [data-slot="tab-close"] { background: none !important; }
`
