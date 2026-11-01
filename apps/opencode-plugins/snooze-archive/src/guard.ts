import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"

// Our Archived group and Archive actions step aside once OpenCode ships its own archive UI. Everything that decides it lives
// here: the option, the signals, and the one place that reads the host's DOM.

export type ArchiveOption = "auto" | "ours" | "theirs"
export type Reason = "command" | "menu" | "home" | "sidebar"
export type Signals = Record<Reason, boolean>

export const parseArchiveOption = (value: unknown): ArchiveOption => value === "ours" || value === "theirs" ? value : "auto"

export const reasonsOf = (signals: Signals): Reason[] => (Object.keys(signals) as Reason[]).filter((reason) => signals[reason])

// `ours` and `theirs` ignore what is detected; `auto` yields to any host archive UI.
export const standsDown = (option: ArchiveOption, signals: Signals) =>
  option === "theirs" || (option === "auto" && reasonsOf(signals).length > 0)

// The host's command ids are not a stable API and no registry lists them: `ctx.commands` only runs one and `ctx.keybinds`
// only answers for an id it is asked about. The host's session commands are `session.<verb>` (session.delete, session.rename),
// so a bound `session.archive` is the one a host archive command would take. Unbound, it is not seen; the menu and the
// sidebar below cover that.
export const HOST_COMMANDS = ["session.archive", "session.unarchive"]

// Markers read from the 2.2.5 host source. Its vertical sidebar has no archived group, so the sidebar marker is the shape a
// group would take under the host's own `data-slot` / `data-component` naming, scoped to the vertical sidebar so the
// experimental Inbox layout (which lists archived rows in `sidebar-inbox`, and has its own Archive menu item) is not a trigger.
export const SIDEBAR = '[data-slot="vertical-tabs-sidebar"]'
export const SIDEBAR_ARCHIVED = '[data-slot*="archived" i], [data-component*="archived" i]'
// Home's row Archive button; 2.2.5 compiles it out (`SHOW_HOME_SESSION_ARCHIVE = false`).
export const HOME_ARCHIVE = '[data-action="home-session-archive"]'
export const HOME_ROW = '[data-component="home-session-row-container"]'
const OURS = "[data-snooze-archive], [data-sa-actions], [data-sa-menu], [data-sa-sub], [data-sa-popup]"

const hostOnly = (nodes: Iterable<Element>) => [...nodes].some((el) => !el.closest(OURS))

// The one DOM probe for a group in the vertical sidebar.
export function probeSidebar(doc: Document) {
  const sidebar = doc.querySelector(SIDEBAR)
  return !!sidebar && hostOnly(sidebar.querySelectorAll(SIDEBAR_ARCHIVED))
}

// Home is mounted only on its route: undefined while no row shows, so the last reading stands until Home is seen again.
export function probeHome(doc: Document): boolean | undefined {
  if (hostOnly(doc.querySelectorAll(HOME_ARCHIVE))) return true
  return doc.querySelector(HOME_ROW) ? false : undefined
}

// A native session menu with its own Archive/Unarchive item. Marked by attribute, else by the item's whole label.
export function hasNativeArchive(menu: ParentNode) {
  for (const item of menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
    if (item.closest(OURS)) continue
    const marks = `${item.dataset.action ?? ""} ${item.dataset.slot ?? ""} ${item.dataset.value ?? ""}`
    if (/archive/i.test(marks) || /^(un)?archive$/i.test(item.textContent?.trim() ?? "")) return true
  }
  return false
}

export interface GuardDeps {
  doc: Document
  option: ArchiveOption
  // Reactive: whether the command id has a keybind.
  keybound(id: string): boolean
  // Reactive: the router path; Home mounting is looked at after it changes.
  path(): string
  schedule(fn: () => void): number
  cancel(id: number): void
}

// Must run inside the plugin's owner. `standDown()` and `reasons()` are reactive.
export function createGuard(deps: GuardDeps) {
  const [seen, setSeen] = createSignal<Omit<Signals, "command">>({ menu: false, home: false, sidebar: false })
  const patch = (key: keyof Omit<Signals, "command">, value: boolean) => setSeen((prev) => prev[key] === value ? prev : { ...prev, [key]: value })
  const command = createMemo(() => deps.option === "auto" && HOST_COMMANDS.some(deps.keybound))
  const signals = createMemo((): Signals => ({ command: command(), ...seen() }))
  const reasons = createMemo(() => reasonsOf(signals()))
  const standDown = createMemo(() => standsDown(deps.option, signals()))
  let recheck = () => {}

  if (deps.option === "auto") {
    // Called bare: the browser's requestAnimationFrame throws "Illegal invocation" with any other `this`.
    const { schedule, cancel } = deps
    const probe = () => {
      patch("sidebar", probeSidebar(deps.doc))
      const home = probeHome(deps.doc)
      if (home !== undefined) patch("home", home)
    }
    let frame: number | undefined
    const queue = () => { if (frame === undefined) frame = schedule(() => { frame = undefined; probe() }) }
    // Only a change under the vertical sidebar can add its group (ancestor walk, no subtree query), so a streaming timeline
    // never wakes this. A sidebar that mounts later is caught by `recheck`, which the sidebar's own update calls.
    const inSidebar = (el: Element) => !!el.closest(SIDEBAR) && !el.closest(OURS)
    const observer = new deps.doc.defaultView!.MutationObserver((records) => {
      if (records.some((r) => r.target.nodeType === 1 && inSidebar(r.target as Element))) queue()
    })
    observer.observe(deps.doc.body, { childList: true, subtree: true })
    createEffect(() => { deps.path(); queue() })
    probe()
    onCleanup(() => { observer.disconnect(); if (frame !== undefined) cancel(frame) })
    recheck = queue
  }

  return {
    standDown, reasons,
    recheck: () => recheck(),
    // A session menu was opened and looked at: it has a native Archive item or it does not.
    menu(native: boolean) { if (deps.option === "auto") patch("menu", native) },
  }
}
