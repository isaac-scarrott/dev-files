import { attachTabRowAction } from "../../native-ui/src"
import type { Host } from "./host"

export type ActionName = "snooze" | "archive" | "delete"
export interface Target { server: string; id: string }
export interface Handlers { run(action: ActionName, target: Target): void }

export const labels: Record<ActionName, string> = { snooze: "Snooze…", archive: "Archive", delete: "Delete…" }

// Archive replaces the app's close X through native-ui's row action in replace mode: the host's own IconButton in a
// slot placed and revealed like the X, with the X hidden. Snooze and Delete live in the context menu.
export function createActions(host: Host, tab: HTMLElement, target: () => Target | undefined, label: string, handlers: Handlers) {
  const dispose = attachTabRowAction(tab, host, {
    icon: "archive", replace: true, label,
    onClick() { const t = target(); if (t) handlers.run("archive", t) },
  })
  const el = tab.querySelector<HTMLElement>(":scope > [data-slot=tab-row-action]")
  el?.setAttribute("data-sa-actions", "tab")
  return { tab, dispose }
}

export const actionsCss = `
[data-sa-archived-tab] { display: none; }
`
