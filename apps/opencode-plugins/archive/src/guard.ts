import { createKeyed } from "@opencode/plugin/gui"
import { createMemo, createSignal } from "solid-js"
import { elementsChanged, SIDEBAR, type DomHub } from "../../session-ui/src/hub"

export { SIDEBAR }

// Our Archived group and Archive actions step aside once OpenCode ships its own archive UI. Everything that decides it lives
// here: the option, the signals, and the one place that reads the host's DOM.
//
// Two decisions, not one. The Archived GROUP is a browser: it lists and restores archived sessions, so only a host archived
// group (`sidebar`) makes it redundant. A host Archive ACTION (a menu item, Home's button) archives but shows nothing
// archived, so it leaves our group in place to browse what it archived, and only makes our own Archive actions redundant.

export type ArchiveOption = "auto" | "ours" | "theirs"
export type Reason = "menu" | "home" | "sidebar"
export type Signals = Record<Reason, boolean>

export const parseArchiveOption = (value: unknown): ArchiveOption => value === "ours" || value === "theirs" ? value : "auto"

export const reasonsOf = (signals: Signals): Reason[] => (Object.keys(signals) as Reason[]).filter((reason) => signals[reason])

// `ours` and `theirs` ignore what is detected. In `auto` the group yields to a host archived group only; our Archive actions
// yield to any host archive UI.
export const groupStandsDown = (option: ArchiveOption, signals: Signals) =>
  option === "theirs" || (option === "auto" && signals.sidebar)
export const actionsStandDown = (option: ArchiveOption, signals: Signals) =>
  option === "theirs" || (option === "auto" && reasonsOf(signals).length > 0)

// There is no command signal. `ctx.keybinds.keybind(id)` answers from the registered command, else from the host's persisted
// command catalog (`command.catalog.v1`), which keeps commands of earlier OpenCode versions: an install that once ran a build
// with `session.archive` keeps answering "mod+shift+backspace" for it though 2.2.5 registers no such command, so a bound
// keybind cannot tell a live host command from a stale one. A host that really adds an archive command also adds a menu
// item, button or group, and those are read below.

// Markers read from the 2.2.5 host source. Its vertical sidebar has no archived group, so the sidebar marker is the shape a
// group would take under the host's own `data-slot` / `data-component` naming, scoped to the vertical sidebar so the
// experimental Inbox layout (which lists archived rows in `sidebar-inbox`, and has its own Archive menu item) is not a trigger.
export const SIDEBAR_ARCHIVED = '[data-slot*="archived" i], [data-component*="archived" i]'
// Home's row Archive button; 2.2.5 compiles it out (`SHOW_HOME_SESSION_ARCHIVE = false`).
export const HOME_ARCHIVE = '[data-action="home-session-archive"]'
export const HOME_ROW = '[data-component="home-session-row-container"]'
const OURS = "[data-sa-groups], [data-sa-actions], [data-sa-menu], [data-sa-popup]"

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
  // Reactive: the router path; Home mounting is looked at after it changes.
  path(): string
  hub: DomHub
}

// Must run inside the plugin's owner. `groupDown()`, `actionsDown()` and `reasons()` are reactive.
export function createGuard(deps: GuardDeps) {
  const [signals, setSignals] = createSignal<Signals>({ menu: false, home: false, sidebar: false })
  const patch = (key: Reason, value: boolean) => setSignals((prev) => prev[key] === value ? prev : { ...prev, [key]: value })
  const reasons = createMemo(() => reasonsOf(signals()))
  const groupDown = createMemo(() => groupStandsDown(deps.option, signals()))
  const actionsDown = createMemo(() => actionsStandDown(deps.option, signals()))
  let recheck = () => {}

  if (deps.option === "auto") {
    const probe = () => {
      patch("sidebar", probeSidebar(deps.doc))
      const home = probeHome(deps.doc)
      if (home !== undefined) patch("home", home)
    }
    // Only a child added or removed under the vertical sidebar can add its group, so a streaming timeline never wakes this.
    // A sidebar that mounts later is caught by the hub; a route change (Home mounting) and the sidebar's own update poke it.
    recheck = deps.hub.watch(elementsChanged, probe)
    createKeyed(deps.path, recheck)
    probe()
  }

  return {
    groupDown, actionsDown, reasons,
    recheck: () => recheck(),
    // A session menu was opened and looked at: it has a native Archive item or it does not.
    menu(native: boolean) { if (deps.option === "auto") patch("menu", native) },
  }
}
