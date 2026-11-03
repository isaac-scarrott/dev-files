import { onCleanup } from "solid-js"
import { KIND_GLYPH, type NotifyKind } from "./notify-contract"
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
  /** Which glyph: the kind's, the same one its toast and the titlebar pill draw. */
  readonly kind: NotifyKind
  /** The colour. */
  readonly severity: TabMarkSeverity
  /** The accessible name of the mark. */
  readonly label: string
  /** A drawing of its own instead of the severity's: snooze-archive's clock. It keeps its own colour. */
  readonly glyph?: "clock"
}

/** What the plugin injects, for the hub's own-write filter. */
export const TAB_MARK_OWN = "[data-notify-mark]"

const NS = "http://www.w3.org/2000/svg"

// The mark draws the host's own artwork for the kind: a `<use>` of the app's icon sprite, the way the toast's glyph does, so
// the two are the same drawing. 14px is the host's small icon and the size of its busy ring in this slot. The clock is
// snooze-archive's own drawing and keeps its colour.
const CLOCK = ["M8 4.5V8l2.5 1.5"]
const SIZE = "14"

function node(doc: Document, tag: string, attributes: Record<string, string>) {
  const element = doc.createElementNS(NS, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

/** The sprite symbol the host's `Icon` draws for a name: the new artwork while the "New icons" experiment is on and has it. */
export function iconSymbol(doc: Document, name: string): string {
  const next = `opencode-v2-icon-new-${name}`
  const experiment = doc.querySelector('svg[data-slot="icon-svg"] use[href*="icon-new-"]') !== null
  return experiment && doc.getElementById(next) ? next : `opencode-v2-icon-${name}`
}

export function tabMarkNode(doc: Document, spec: TabMarkSpec, owner = ""): HTMLElement {
  const mark = doc.createElement("span")
  mark.dataset.notifyMark = ""
  mark.dataset.notifyOwner = owner
  mark.dataset.severity = spec.severity
  if (spec.glyph) mark.dataset.glyph = spec.glyph
  mark.setAttribute("role", "img")
  mark.setAttribute("aria-label", spec.label)
  if (spec.glyph === "clock") {
    const svg = node(doc, "svg", { viewBox: "0 0 16 16", width: SIZE, height: SIZE, fill: "none", stroke: "currentColor", "stroke-width": "1", "stroke-linecap": "round", "stroke-linejoin": "round" })
    svg.append(node(doc, "circle", { cx: "8", cy: "8", r: "6" }))
    for (const d of CLOCK) svg.append(node(doc, "path", { d }))
    mark.append(svg)
    return mark
  }
  const symbol = iconSymbol(doc, KIND_GLYPH[spec.kind])
  mark.dataset.icon = symbol
  const svg = node(doc, "svg", { width: SIZE, height: SIZE, viewBox: doc.getElementById(symbol)?.getAttribute("viewBox") ?? "0 0 20 20", fill: "none" })
  svg.append(node(doc, "use", { href: `#${symbol}` }))
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
  (mark as HTMLElement).dataset.severity === spec.severity && (spec.glyph === "clock" || (mark as HTMLElement).dataset.icon === iconSymbol(mark.ownerDocument, KIND_GLYPH[spec.kind])) && (mark as HTMLElement).dataset.glyph === spec.glyph && mark.getAttribute("aria-label") === spec.label

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
