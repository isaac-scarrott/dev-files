import { createComponent } from "solid-js"
import type { IconName } from "@opencode/plugin/gui"
import type { Host } from "./host"

export type ActionName = "snooze" | "archive" | "delete"
export interface Target { server: string; id: string }
export interface Handlers { run(action: ActionName, target: Target): void }

const labels: Record<ActionName, string> = { snooze: "Snooze…", archive: "Archive", delete: "Delete…" }
// The catalog has no clock or moon; the bell is the closest to "remind me later".
const icons: Record<ActionName, IconName> = { snooze: "notifications", archive: "archive", delete: "outline-trash" }

export function createActions(doc: Document, host: Host, kind: "header" | "tab", target: () => Target | undefined, title: () => string, handlers: Handlers, disabled: () => boolean = () => false) {
  const el = doc.createElement("div")
  el.dataset.saActions = kind
  el.setAttribute("role", "group")
  el.setAttribute("aria-label", "Session actions")
  // The row is a link: keep presses from navigating, renaming or closing.
  el.onpointerdown = (event) => event.stopPropagation()
  el.ondblclick = (event) => event.stopPropagation()
  const dispose = host.mount(el, () => (["snooze", "archive", "delete"] as const).map((action) =>
    createComponent(host.ui.Tooltip, {
      value: labels[action],
      get children() {
        return createComponent(host.ui.IconButton, {
          icon: icons[action],
          size: "small",
          get label() { return `${labels[action]} ${title()}`.trim() },
          get disabled() { return disabled() },
          onClick(event) {
            event.preventDefault()
            event.stopPropagation()
            const t = target()
            if (t && !disabled()) handlers.run(action, t)
          },
        })
      },
    })))
  return { el, dispose }
}

export const actionsCss = `
[data-sa-actions] { display: inline-flex; align-items: center; gap: 2px; }
[data-sa-actions="header"] { margin-inline-start: 6px; app-region: no-drag; }
[data-sa-actions="tab"] { position: absolute; inset-block: 0; inset-inline-end: 30px; margin: auto 0; height: 22px; opacity: 0; transform: translateX(4px); pointer-events: none; transition: opacity 150ms cubic-bezier(0.23,1,0.32,1), transform 150ms cubic-bezier(0.23,1,0.32,1); background: var(--v2-background-bg-layer-01, transparent); border-radius: 6px; z-index: 2; }
[data-sa-tab-host] { position: relative; }
[data-sa-tab-host]:hover > [data-sa-actions="tab"], [data-sa-tab-host]:focus-within > [data-sa-actions="tab"] { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { [data-sa-actions="tab"] { transition: opacity 150ms linear; transform: none; } }
`
