import { createComponent, createSignal } from "solid-js"
import type { ProjectAvatarStyle } from "../../native-ui/src"
import { SessionTabRow, TabRowAction, sessionTabRowClass } from "../../native-ui/src"
import type { Avatar } from "./avatar"
import type { Host } from "./host"
import { openMenu, type MenuLine } from "./menu"

// activeAt: last activity, shown by sidebar-repos at the row's end (Archived rows); project: the second line (the repo name); until: the trailing detail on it (time until wake); detail: the hover title.
export interface GroupRow { key: string; title: string; project: string; until?: string; activeAt?: number; detail: string; action: string; avatar: Avatar; active?: boolean; run(): void; open?(): void; menu?: MenuLine[] }
export interface Timers { set(fn: () => void, ms: number): number; clear(id: number): void }
const LEAVE_MS = 160
const SCROLLER = '[data-slot="vertical-tabs-scroll"]'
// more: the button below the rows; busy while its page loads.
export interface GroupState { rows: GroupRow[]; status?: string; count?: number | string; more?: { label: string; busy?: boolean; run(): void } }
export interface Hooks { toggled?(kind: "snoozed" | "archived", open: boolean): void }

function group(doc: Document, host: Host, name: string, schedule: (fn: () => void) => number, timers: Timers, toggled: (open: boolean) => void) {
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
  const clip = doc.createElement("div")
  clip.dataset.saClip = ""
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
  const toggle = () => header.querySelector("button")
  toggle()?.setAttribute("aria-controls", content.id)
  expand(false)
  header.onkeydown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      expand(event.key === "ArrowRight")
    }
  }
  clip.append(content)
  panel.append(clip)
  section.append(header, panel)
  type Row = { el: HTMLElement; link: HTMLElement; set(item: GroupRow): void; dispose(): void; leaving?: number }
  const rows = new Map<string, Row>()
  let populated = false
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
      get active() { return current().active },
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
    dispose() {
      disposeHeader()
      disposeMoreIcon()
      for (const row of rows.values()) { if (row.leaving !== undefined) timers.clear(row.leaving); row.dispose() }
    },
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
      // Row motion only while the group is open and after its first content; never on startup or count updates.
      const animate = open && populated
      const drop = (key: string, row: Row) => { row.dispose(); row.el.remove(); rows.delete(key) }
      for (const [key, row] of rows) {
        if (keys.has(key) || row.leaving !== undefined) continue
        if (!animate) { drop(key, row); continue }
        row.el.toggleAttribute("data-leaving", true)
        row.leaving = timers.set(() => drop(key, row), LEAVE_MS)
      }
      let cursor: ChildNode | null = status.nextSibling
      state.rows.forEach((item) => {
        let row = rows.get(item.key)
        if (row?.leaving !== undefined) { timers.clear(row.leaving); row.leaving = undefined; row.el.removeAttribute("data-leaving") }
        if (!row) {
          row = createRow(item)
          rows.set(item.key, row)
          if (animate) {
            row.el.toggleAttribute("data-entering", true)
            const el = row.el
            schedule(() => el.removeAttribute("data-entering"))
          }
        }
        row.set(item)
        const active = item.activeAt === undefined ? "" : `\nLast active ${new Date(item.activeAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" })}`
        const tip = `${item.title}\n${item.detail}${active}`
        if (row.link.title !== tip) row.link.title = tip
        while (cursor && [...rows.values()].some((r) => r.el === cursor && r.leaving !== undefined)) cursor = cursor.nextSibling
        if (cursor === row.el) cursor = cursor.nextSibling
        else content.insertBefore(row.el, cursor)
      })
      moreRun = state.more?.run
      moreBusy = !!state.more?.busy
      moreSlot.hidden = !state.more
      const moreTextNow = moreBusy ? "Loading…" : state.more?.label ?? ""
      if (moreText.textContent !== moreTextNow) moreText.textContent = moreTextNow
      moreButton.toggleAttribute("aria-busy", moreBusy)
      populated = populated || state.rows.length > 0 || state.count !== undefined
    },
  }
}

export function createSidebar(doc: Document, host: Host, schedule: (fn: () => void) => number, cancel: (id: number) => void, timers: Timers = {
  set: (fn, ms) => doc.defaultView!.setTimeout(fn, ms) as unknown as number,
  clear: (id) => doc.defaultView!.clearTimeout(id),
}, hooks: Hooks = {}) {
  const root = doc.createElement("div")
  root.dataset.snoozeArchive = ""
  root.title = "All listed servers · top-level sessions. Snooze is device-local."
  let parent: HTMLElement | undefined
  const snoozed = group(doc, host, "Snoozed", schedule, timers, (open) => hooks.toggled?.("snoozed", open))
  const archived = group(doc, host, "Archived", schedule, timers, (open) => hooks.toggled?.("archived", open))
  root.append(snoozed.section, archived.section)
  const attach = () => {
    const next = doc.querySelector<HTMLElement>(`[data-slot="vertical-tabs"] > ${SCROLLER}`) ?? undefined
    if (parent !== next) parent?.removeAttribute("data-sa-host")
    parent = next
    if (next) {
      next.setAttribute("data-sa-host", "")
      if (root.parentElement !== next) next.append(root)
    } else root.remove()
  }
  let frame: number | undefined
  const observer = new doc.defaultView!.MutationObserver((records) => {
    if (!records.some((r) => {
      if (root.contains(r.target)) return false
      if (r.type === "attributes") return (r.target as Element).matches(`[data-slot="vertical-tabs"], ${SCROLLER}, [data-slot="titlebar-tabs"]`)
      return [...r.addedNodes, ...r.removedNodes].some((node) =>
        node.nodeType === 1 && node !== root && ((node as Element).matches(SCROLLER) || (node as Element).querySelector(SCROLLER)))
    })) return
    if (frame === undefined) frame = schedule(() => { frame = undefined; attach() })
  })
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-slot"] })
  attach()
  return {
    update(snooze: GroupState, archive: GroupState) { snoozed.update(snooze); archived.update(archive); attach() },
    // The Archived group steps aside (kept mounted, so it returns without a rebuild) while the host has its own archive UI.
    archiveUi(host: boolean) {
      archived.section.hidden = host
      root.dataset.saArchive = host ? "theirs" : "ours"
    },
    dispose() { snoozed.dispose(); archived.dispose(); observer.disconnect(); if (frame !== undefined) cancel(frame); root.remove(); parent?.removeAttribute("data-sa-host") },
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
.sa-chevron { transition: transform 200ms cubic-bezier(0.23,1,0.32,1); }
.sa-toggle[aria-expanded="true"] .sa-chevron { transform: rotate(90deg); }
[data-sa-panel] { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition: grid-template-rows 200ms cubic-bezier(0.23,1,0.32,1), opacity 150ms cubic-bezier(0.23,1,0.32,1), visibility 0s linear 200ms; }
[data-sa-panel][data-open] { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition: grid-template-rows 200ms cubic-bezier(0.23,1,0.32,1), opacity 180ms cubic-bezier(0.23,1,0.32,1), visibility 0s; }
[data-sa-clip] { min-height: 0; overflow: hidden; }
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
[data-sa-row] { transition: opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
[data-sa-row][data-entering], [data-sa-row][data-leaving] { opacity: 0; transform: translateY(-4px); }
[data-sa-row][data-leaving] { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .sa-chevron { transition: none; }
  [data-sa-panel], [data-sa-panel][data-open] { transition: opacity 150ms linear, visibility 0s; }
  [data-sa-row] { transition: opacity 160ms linear; }
  [data-sa-row][data-entering], [data-sa-row][data-leaving] { transform: none; }
}
`
