export type ActionName = "snooze" | "archive" | "delete"
export interface Target { server: string; id: string }
export interface Handlers { run(action: ActionName, target: Target): void }

const labels: Record<ActionName, string> = { snooze: "Snooze…", archive: "Archive", delete: "Delete…" }
const icons: Record<ActionName, string> = {
  snooze: "M12 7v5l3 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  archive: "M4 7h16M5 7v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M4 4h16v3H4zM10 12h4",
  delete: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5",
}
const NS = "http://www.w3.org/2000/svg"

function button(doc: Document, action: ActionName) {
  const el = doc.createElement("button")
  el.type = "button"
  el.dataset.saAction = action
  el.title = labels[action]
  const svg = doc.createElementNS(NS, "svg")
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24", width: "14", height: "14", fill: "none", stroke: "currentColor",
    "stroke-width": "1.75", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  })) svg.setAttribute(name, value)
  const path = doc.createElementNS(NS, "path")
  path.setAttribute("d", icons[action])
  svg.append(path)
  el.append(svg)
  return el
}

export function refreshLabels(el: HTMLElement, title: string) {
  for (const b of el.querySelectorAll<HTMLElement>("[data-sa-action]")) {
    const label = `${labels[b.dataset.saAction as ActionName]} ${title}`.trim()
    if (b.getAttribute("aria-label") !== label) b.setAttribute("aria-label", label)
  }
}

export function createActions(doc: Document, kind: "header" | "tab", target: () => Target | undefined, title: () => string, handlers: Handlers, disabled: () => boolean = () => false) {
  const el = doc.createElement("div")
  el.dataset.saActions = kind
  el.setAttribute("role", "group")
  el.setAttribute("aria-label", "Session actions")
  for (const action of ["snooze", "archive", "delete"] as const) {
    const b = button(doc, action)
    b.onclick = (event) => {
      // The row is a link: keep the click from navigating, renaming or closing.
      event.preventDefault()
      event.stopPropagation()
      const t = target()
      if (t && !disabled()) handlers.run(action, t)
    }
    b.onpointerdown = (event) => event.stopPropagation()
    b.ondblclick = (event) => event.stopPropagation()
    el.append(b)
  }
  refreshLabels(el, title())
  return el
}

export const actionsCss = `
[data-sa-actions] { display: inline-flex; align-items: center; gap: 2px; }
[data-sa-actions] button { display: inline-grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--v2-text-text-muted); cursor: pointer; }
[data-sa-actions] button:hover { background: var(--v2-background-bg-layer-02); color: var(--v2-text-text-base); }
[data-sa-actions] button[data-sa-action="delete"]:hover { color: var(--v2-text-text-critical, #e5484d); }
[data-sa-actions] button:focus-visible { outline: 2px solid var(--v2-border-border-focus); outline-offset: -2px; }
[data-sa-actions="header"] { margin-inline-start: 6px; app-region: no-drag; }
[data-sa-actions="tab"] { position: absolute; inset-block: 0; inset-inline-end: 30px; margin: auto 0; height: 22px; opacity: 0; transform: translateX(4px); pointer-events: none; transition: opacity 150ms cubic-bezier(0.23,1,0.32,1), transform 150ms cubic-bezier(0.23,1,0.32,1); background: var(--v2-background-bg-layer-01, transparent); border-radius: 6px; z-index: 2; }
[data-sa-tab-host] { position: relative; }
[data-sa-tab-host]:hover > [data-sa-actions="tab"], [data-sa-tab-host]:focus-within > [data-sa-actions="tab"] { opacity: 1; transform: none; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { [data-sa-actions="tab"] { transition: opacity 150ms linear; transform: none; } }
`
