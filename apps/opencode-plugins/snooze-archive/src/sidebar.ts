import { createComponent, createSignal, onCleanup } from "solid-js"
import type { ProjectAvatarStyle } from "../../native-ui/src"
import { SessionTabRow, TabRowAction, sessionTabRowClass } from "../../native-ui/src"
import type { Avatar } from "./avatar"
import type { Host } from "./host"
import type { DomHub } from "./hub"
import { openMenu, type MenuLine } from "./menu"

// activeAt: last activity, shown by sidebar-repos at the row's end (Archived rows); project: the second line (the repo name); until: the trailing detail on it (time until wake); detail: the hover title.
export interface GroupRow { key: string; title: string; project: string; until?: string; activeAt?: number; detail: string; action: string; avatar: Avatar; active?(): boolean; run(): void; open?(): void; menu?: MenuLine[] }
const SCROLLER = '[data-slot="vertical-tabs-scroll"]'
// more: the button below the rows; busy while its page loads.
export interface GroupState { rows: GroupRow[]; status?: string; count?: number | string; more?: { label: string; busy?: boolean; run(): void } }
export interface Hooks { toggled?(kind: "snoozed" | "archived", open: boolean): void }

function group(doc: Document, host: Host, name: string, toggled: (open: boolean) => void) {
  const section = doc.createElement("section")
  const header = doc.createElement("div")
  header.dataset.saToggle = ""
  const label = doc.createElement("span")
  label.textContent = name
  label.className = "sa-label"
  const count = doc.createElement("span")
  count.dataset.saCount = ""
  const panel = doc.createElement("div")
  panel.dataset.saPanel = ""
  const content = doc.createElement("div")
  content.dataset.saContents = ""
  content.id = `snooze-archive-${name.toLowerCase()}`
  content.dataset.saKind = name.toLowerCase()
  content.setAttribute("role", "region")
  content.setAttribute("aria-label", name)
  let open = false
  const expand = (next: boolean) => {
    const changed = next !== open
    open = next
    if (changed) toggled(next)
    panel.toggleAttribute("data-open", next)
    panel.toggleAttribute("inert", !next)
    toggle()?.setAttribute("aria-expanded", String(next))
  }
  const disposeHeader = host.mount(header, () => createComponent(host.ui.Button, {
    variant: "ghost-muted",
    size: "small",
    class: "sa-toggle",
    onClick: () => expand(!open),
    get children() { return [label, count, createComponent(host.ui.Icon, { name: "chevron-right", size: "small", class: "sa-chevron" })] },
  }))
  onCleanup(disposeHeader)
  const toggle = () => header.querySelector("button")
  toggle()?.setAttribute("aria-controls", content.id)
  expand(false)
  header.onkeydown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      expand(event.key === "ArrowRight")
    }
  }
  panel.append(content)
  section.append(header, panel)
  // One formatter for the group: building one per row per update is the dearest line of an update.
  const stamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" })
  type Row = { el: HTMLElement; link: HTMLElement; set(item: GroupRow): void; dispose(): void; }
  const rows = new Map<string, Row>()
  onCleanup(() => { for (const row of rows.values()) row.dispose() })
  const status = doc.createElement("p")
  status.setAttribute("role", "status")
  content.append(status)
  // The button after the last row: the sidebar's own secondary row ("New session", app/src/shell/titlebar sidebar actions) with a chevron for its icon.
  const moreSlot = doc.createElement("div")
  moreSlot.dataset.saMore = ""
  moreSlot.className = "flex w-full shrink-0"
  moreSlot.hidden = true
  const moreButton = doc.createElement("button")
  moreButton.type = "button"
  moreButton.className = "sa-more group flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-1.5 pe-2 text-[13px] leading-4 text-v2-text-text-faint hover:text-v2-text-text-base"
  const moreIcon = doc.createElement("span")
  moreIcon.className = sessionTabRowClass.avatarSlot
  const moreText = doc.createElement("span")
  moreText.className = "min-w-0 truncate"
  moreButton.append(moreIcon, moreText)
  moreSlot.append(moreButton)
  const disposeMoreIcon = host.mount(moreIcon, () => createComponent(host.ui.Icon, { name: "chevron-down", size: "normal" }))
  onCleanup(disposeMoreIcon)
  let moreRun: (() => void) | undefined
  let moreBusy = false
  moreButton.onclick = () => { if (!moreBusy) moreRun?.() }
  content.append(moreSlot)
  const createRow = (item: GroupRow): Row => {
    const [current, set] = createSignal(item)
    const container = doc.createElement("div")
    // Right-click, or the keyboard menu key from a focused button (which reports 0,0): the row's other actions.
    const showMenu = (event: MouseEvent) => {
      if (!current().menu?.length) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const keyboard = event.clientX === 0 && event.clientY === 0
      openMenu(doc, keyboard ? { x: rect.left, y: rect.bottom } : { x: event.clientX, y: event.clientY }, current().menu ?? [], { label: `${current().title} actions` })
    }
    const disposeRow = host.mount(container, () => createComponent(SessionTabRow, {
      ui: host.ui,
      get title() { return current().title },
      get avatar() { const a = current().avatar; return { fallback: a.letter, src: a.src, variant: a.variant as ProjectAvatarStyle } },
      get project() { return current().project },
      get detail() { return current().until },
      get activeAt() { return current().activeAt },
      // Read here, in the row's own tracking scope: a session switch re-marks one row instead of rebuilding the group.
      get active() { return current().active?.() },
      get onContextMenu() { return current().menu?.length ? showMenu : undefined },
      onOpen: () => { const row = current(); (row.open ?? row.run)() },
      // Replace: the action sits where the live row's X does, as these rows have no close button.
      get action() {
        return createComponent(TabRowAction, {
          ui: host.ui, icon: "outline-undo", replace: true,
          get label() { return `${current().action} ${current().title}` },
          onClick: () => current().run(),
        })
      },
    }))
    const el = container.firstElementChild as HTMLElement
    el.dataset.saRow = item.key
    // The slot's keyboard menu key arrives from the action button, outside the link that carries the handler.
    const link = el.querySelector<HTMLElement>("[data-slot=tab-link]")!
    el.addEventListener("contextmenu", (event) => { if (!link.contains(event.target as Node)) showMenu(event) })
    return { el, link, set, dispose: disposeRow }
  }
  return {
    section,
    update(state: GroupState) {
      const text = state.count === undefined ? "—" : String(state.count)
      if (count.textContent !== text) count.textContent = text
      const hint = state.status ?? `${state.rows.length} ${name.toLowerCase()}`
      const button = toggle()
      if (button && button.title !== hint) button.title = hint
      const statusText = state.status ?? (state.rows.length ? "" : `No ${name.toLowerCase()} sessions`)
      if (status.textContent !== statusText) status.textContent = statusText
      status.hidden = !statusText
      const keys = new Set(state.rows.map((row) => row.key))
      for (const [key, row] of rows) {
        if (keys.has(key)) continue
        row.dispose()
        row.el.remove()
        rows.delete(key)
      }
      let cursor: ChildNode | null = status.nextSibling
      state.rows.forEach((item) => {
        let row = rows.get(item.key)
        if (!row) {
          row = createRow(item)
          rows.set(item.key, row)
        }
        row.set(item)
        const active = item.activeAt === undefined ? "" : `\nLast active ${stamp.format(item.activeAt)}`
        const tip = `${item.title}\n${item.detail}${active}`
        if (row.link.title !== tip) row.link.title = tip
        if (cursor === row.el) cursor = cursor.nextSibling
        else content.insertBefore(row.el, cursor)
      })
      moreRun = state.more?.run
      moreBusy = !!state.more?.busy
      moreSlot.hidden = !state.more
      const moreTextNow = moreBusy ? "Loading…" : state.more?.label ?? ""
      if (moreText.textContent !== moreTextNow) moreText.textContent = moreTextNow
      moreButton.toggleAttribute("aria-busy", moreBusy)
    },
  }
}

export function createSidebar(doc: Document, host: Host, hub: DomHub, hooks: Hooks = {}) {
  const root = doc.createElement("div")
  root.dataset.snoozeArchive = ""
  root.title = "All listed servers · top-level sessions. Snooze is device-local."
  let parent: HTMLElement | undefined
  const snoozed = group(doc, host, "Snoozed", (open) => hooks.toggled?.("snoozed", open))
  const archived = group(doc, host, "Archived", (open) => hooks.toggled?.("archived", open))
  root.append(snoozed.section, archived.section)
  onCleanup(() => { root.remove(); parent?.removeAttribute("data-sa-host") })
  const attach = () => {
    const next = hub.sidebar()?.querySelector<HTMLElement>(`[data-slot="vertical-tabs"] > ${SCROLLER}`) ?? undefined
    if (parent !== next) parent?.removeAttribute("data-sa-host")
    parent = next
    if (next) {
      next.setAttribute("data-sa-host", "")
      if (root.parentElement !== next) next.append(root)
    } else root.remove()
  }
  // The scroll region came or went, or the strip it sits in changed slot.
  const strip = `[data-slot="vertical-tabs"], ${SCROLLER}, [data-slot="titlebar-tabs"]`
  hub.watch((r) => r.type === "attributes"
    ? (r.target as Element).matches(strip)
    : [...r.addedNodes, ...r.removedNodes].some((node) => node.nodeType === 1 && node !== root && ((node as Element).matches(SCROLLER) || (node as Element).querySelector(SCROLLER))), attach)
  attach()
  return {
    snoozed(state: GroupState) { snoozed.update(state); attach() },
    archived(state: GroupState) { archived.update(state); attach() },
    update(snooze: GroupState, archive: GroupState) { snoozed.update(snooze); archived.update(archive); attach() },
    // The Archived group steps aside (kept mounted, so it returns without a rebuild) while the host has its own archive UI.
    archiveUi(host: boolean) {
      archived.section.hidden = host
      root.dataset.saArchive = host ? "theirs" : "ours"
    },
    
  }
}

export const css = `
/* The groups live inside the host's scroll region, after the tab list, so live rows, Snoozed and Archived scroll as one and the host's edge fades cover all of it.
   The scroller fills the strip so the groups sit at the bottom while the list is short; the host's bottom padding moves under the tab list so the gap above them stays. */
[data-slot="vertical-tabs"]:has(> [data-sa-host]) { flex: 1; min-height: 0; }
[data-sa-host] { flex: 1 1 auto; }
[data-slot="vertical-tabs-sidebar"] [data-sa-host] { padding-block-end: 0; }
[data-sa-host] > [data-titlebar-tab-list] { padding-bottom: 16px; }
[data-snooze-archive] section[hidden] { display: none; }
[data-snooze-archive] { flex: 0 0 auto; margin-top: auto; padding: 8px 0 16px; app-region: no-drag; }
/* The host's small Button pads 9px; the rows pad 6px (px-1.5 on the tab item), so the label starts on the rows' avatar/title edge and the chevron ends on the time column's edge. */
.sa-toggle { width: 100%; justify-content: flex-start; padding-inline: 6px; }
.sa-label { display: inline-flex; align-items: center; gap: 6px; }
[data-sa-count] { margin-inline-start: auto; font-variant-numeric: tabular-nums; color: var(--v2-text-text-faint); }
/* The host's collapsibles show their content in one frame and animate only the arrow: transform .15s (the default ease), so the same here. */
.sa-chevron { transition: transform .15s; }
.sa-toggle[aria-expanded="true"] .sa-chevron { transform: rotate(90deg); }
[data-sa-panel]:not([data-open]) { display: none; }
[data-sa-contents] { display: flex; flex-direction: column; gap: 4px; padding: 2px 0; }
[data-sa-more][hidden] { display: none; }
.sa-more[aria-busy] { cursor: default; opacity: .7; }
[data-sa-contents] p { margin: 6px; font-size: 11px; color: var(--v2-text-text-muted); }
/* Snoozed: the time until wake outranks the branch. The second line is a flex row; the project part gives way with an
   ellipsis and the time never shrinks. The link's end fade (the action's reveal) would mask a time that reaches the
   edge, so while the fade is on the line stops short of it (the fade starts 46px from the link's edge, the line ends 6px inside it). */
[data-sa-kind="snoozed"] [data-sidebar-repo]:has([data-sidebar-repo-detail]) { display: flex; }
[data-sa-kind="snoozed"] [data-sidebar-repo-main] { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
[data-sa-kind="snoozed"] [data-sidebar-repo-detail] { flex: none; white-space: nowrap; }
[data-sa-kind="snoozed"] [data-titlebar-tab]:is(:hover, :has(:focus-visible)) [data-sidebar-repo] { padding-inline-end: 40px; }
/* The host sets these per tab by position (first row 0/2px, the rest 2px/0) and its link padding reads them. */
[data-sa-row] { --tab-hit-before: 2px; --tab-hit-after: 0px; }
[data-sa-row]:first-of-type { --tab-hit-before: 0px; --tab-hit-after: 2px; }
`
