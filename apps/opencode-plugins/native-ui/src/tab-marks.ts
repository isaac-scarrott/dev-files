import { onCleanup } from "solid-js"
import type { DomHub } from "./dom-hub"
import { elementsChangedBut } from "./dom-hub"

// A mark in the trailing status slot of a vertical tab, for an event that starts no turn (a snooze woke, a monitor
// ended, a schedule failed). Generalised from snooze-archive/src/woke.ts: same slot, same hover swap with the close
// button, same title fade; the glyph and colour follow the severity. Host events (done, error, a pending request) already
// show the host's own dot or attention mark, so they never get one of these.
//
// The mark is a sibling of the host's `tab-status` (which is aria-hidden) so it can carry a label. A pending approval or
// question (`data-status="attention"`) and the open tab (nothing to point at) keep the host's own look.

export type TabMarkSeverity = "info" | "success" | "warning" | "error"

export interface TabMarkSpec {
  readonly severity: TabMarkSeverity
  /** The accessible name of the mark. */
  readonly label: string
  /** A drawing of its own instead of the severity's: snooze-archive's clock. It keeps its own colour. */
  readonly glyph?: "clock"
}

/** What the plugin injects, for the hub's own-write filter. */
export const TAB_MARK_OWN = "[data-notify-mark]"

const NS = "http://www.w3.org/2000/svg"

// 16px grid, 1px round stroke, the catalog's style. Nearest catalog neighbours: `circle-exclamation`, `warning`.
const GLYPHS: Record<TabMarkSeverity, readonly string[]> = {
  info: ["M8 7.5v3.5", "M8 5h.01"],
  success: ["M5.5 8.25l1.75 1.75L10.75 6"],
  warning: ["M8 5.25v3.5", "M8 10.75h.01"],
  error: ["M8 4.75v4", "M8 10.75h.01"],
}

const CLOCK_HANDS = ["M8 4.5V8l2.5 1.5"]

const FACE: Record<TabMarkSeverity, string> = {
  info: "circle",
  success: "circle",
  warning: "triangle",
  error: "circle",
}

function node(doc: Document, tag: string, attributes: Record<string, string>) {
  const element = doc.createElementNS(NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

export function tabMarkNode(doc: Document, spec: TabMarkSpec, owner = ""): HTMLElement {
  const mark = doc.createElement("span")
  mark.dataset.notifyMark = ""
  mark.dataset.notifyOwner = owner
  mark.dataset.severity = spec.severity
  if (spec.glyph) mark.dataset.glyph = spec.glyph
  mark.setAttribute("role", "img")
  mark.setAttribute("aria-label", spec.label)
  const svg = node(doc, "svg", { viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" })
  svg.append(spec.glyph === "clock" || FACE[spec.severity] === "circle" ? node(doc, "circle", { cx: "8", cy: "8", r: "6" }) : node(doc, "path", { d: "M8 2.5l6 10.5H2z" }))
  for (const d of spec.glyph === "clock" ? CLOCK_HANDS : GLYPHS[spec.severity]) svg.append(node(doc, "path", { d }))
  mark.append(svg)
  return mark
}

export interface TabMarksOptions {
  readonly doc: Document
  readonly hub: DomHub
  /** The mark for a vertical tab, by the host's tab key; undefined when it has none. Read on every sync. */
  readonly mark: (tabKey: string) => TabMarkSpec | undefined
  /** False while the plugin has no mark to show: sidebar changes then wake nothing. Defaults to always. */
  readonly active?: () => boolean
  /**
   * Who draws these marks. Two plugins can run in one sidebar (a plugin's own mark while no hub is installed, the hub's
   * otherwise): a mark of another owner is never touched, so neither removes the other's.
   */
  readonly owner?: string
}

const same = (mark: Element, spec: TabMarkSpec) =>
  (mark as HTMLElement).dataset.severity === spec.severity && (mark as HTMLElement).dataset.glyph === spec.glyph && mark.getAttribute("aria-label") === spec.label

/**
 * Keeps the marks of the vertical tabs in step with `mark`. Must run inside the plugin's owner: every mark is removed on
 * cleanup. `sync` re-reads `mark` for every tab; call it when what `mark` reads changes (the hub also calls it when the
 * sidebar's rows change).
 */
export function createTabMarks(options: TabMarksOptions) {
  const { doc, hub } = options
  const owner = options.owner ?? ""
  const marked = new Set<HTMLElement>()
  const ours = (mark: Element | null) => mark !== null && (mark as HTMLElement).dataset.notifyOwner === owner
  const clear = (tab: HTMLElement) => {
    const mark = tab.querySelector(TAB_MARK_OWN)
    if (ours(mark)) {
      mark!.remove()
      tab.removeAttribute("data-notify")
    }
    marked.delete(tab)
  }
  onCleanup(() => {
    for (const tab of [...marked]) clear(tab)
  })
  const sync = () => {
    const live = new Set<HTMLElement>()
    for (const host of hub.sidebar()?.querySelectorAll<HTMLElement>('[data-slot="vertical-tabs"] [data-tab-key]') ?? []) {
      const key = host.dataset.tabKey
      const spec = key ? options.mark(key) : undefined
      const tab = host.querySelector<HTMLElement>("[data-titlebar-tab]")
      const close = tab?.querySelector<HTMLElement>('[data-slot="tab-close"]')
      if (!tab || !close || !spec) continue
      const existing = close.querySelector(TAB_MARK_OWN)
      if (existing && !ours(existing)) continue
      live.add(tab)
      if (existing && !same(existing, spec)) existing.remove()
      if (!close.querySelector(TAB_MARK_OWN)) close.querySelector('[data-slot="tab-status"]')?.after(tabMarkNode(doc, spec, owner))
      if (!tab.hasAttribute("data-notify")) tab.setAttribute("data-notify", "")
      marked.add(tab)
    }
    for (const tab of marked) if (!live.has(tab)) clear(tab)
  }
  const own = elementsChangedBut(TAB_MARK_OWN)
  const wanted = (record: MutationRecord) => (options.active?.() ?? true) || marked.size > 0
  hub.watch((record) => wanted(record) && (record.type === "attributes" ? record.attributeName === "data-tab-key" : own(record)), sync)
  sync()
  return { sync }
}

const SHOWN = ':not([data-status="attention"], [data-active="true"])'

// Positioning, the hover swap and the title fade are the clock's (snooze-archive): the 20px slot box at the row's end.
export const tabMarkCss = `
[data-titlebar-tab] [data-notify-mark] { position: absolute; inset-block: 0; inset-inline-end: 0; display: none; place-items: center; width: 20px; height: 20px; margin-block: auto; pointer-events: none; color: var(--v2-state-fg-info); }
[data-titlebar-tab] [data-notify-mark][data-severity="success"] { color: var(--v2-state-fg-success, var(--v2-text-text-muted)); }
[data-titlebar-tab] [data-notify-mark][data-severity="warning"] { color: var(--v2-state-fg-warning); }
[data-titlebar-tab] [data-notify-mark][data-severity="error"] { color: var(--v2-state-fg-danger); }
[data-titlebar-tab] [data-notify-mark][data-glyph="clock"] { color: var(--v2-orange-800); }
[data-titlebar-tab][data-notify]${SHOWN} [data-notify-mark] { display: grid; }
[data-titlebar-tab][data-notify]${SHOWN} [data-slot="tab-status"] { display: none; }
[data-titlebar-tab]:is(:hover, :has(:focus-visible)) [data-notify-mark] { opacity: 0; }
[data-titlebar-tab][data-orientation="vertical"][data-notify]${SHOWN} [data-sidebar-time] { display: none; }
[data-titlebar-tab][data-orientation="vertical"][data-notify]${SHOWN}:not(:hover):not(:has(:focus-visible)) { --sidebar-fade: 30px; }
`
