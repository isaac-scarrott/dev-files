import { createComponent, createMemo, createSignal, type JSX } from "solid-js"
import type { Avatar } from "./avatar"
import type { Host } from "./host"

export interface GroupRow { key: string; title: string; detail: string; action: string; avatar: Avatar; run(): void; secondary?: { label: string; run(): void } }
export interface Timers { set(fn: () => void, ms: number): number; clear(id: number): void }
const LEAVE_MS = 160
export interface GroupState { rows: GroupRow[]; status?: string; count?: number }

// Verbatim from the app's session tab (TabNavItem), so its own CSS styles the row.
const ROW_CLASS = "group relative flex h-7 w-full min-w-0 select-none flex-row items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[6px] px-1.5 [container-type:inline-size]"
const LINK_CLASS = "flex h-full min-w-0 flex-1 flex-row items-center gap-1.5 text-[13px] font-medium text-v2-text-text-faint [-webkit-user-drag:none]"
const AVATAR_SLOT_CLASS = "flex size-4 shrink-0 items-center justify-center"
const TITLE_CLASS = "min-w-0 flex-1 outline-none leading-4 overflow-hidden text-clip whitespace-nowrap"

function avatarNode(doc: Document, avatar: Avatar) {
  const root = doc.createElement("div")
  root.dataset.component = "project-avatar-v2"
  const surface = doc.createElement("div")
  surface.dataset.slot = "project-avatar-surface"
  surface.dataset.variant = avatar.variant
  if (avatar.src) {
    surface.dataset.hasImage = ""
    const img = doc.createElement("img")
    img.src = avatar.src
    img.draggable = false
    img.dataset.slot = "project-avatar-image"
    surface.append(img)
  } else surface.textContent = avatar.letter
  root.append(surface)
  return root
}

function group(doc: Document, host: Host, name: string, schedule: (fn: () => void) => number, timers: Timers) {
  const section = doc.createElement("section")
  const header = doc.createElement("div")
  header.dataset.saToggle = ""
  const label = doc.createElement("span")
  label.textContent = name
  const count = doc.createElement("span")
  count.dataset.saCount = ""
  const panel = doc.createElement("div")
  panel.dataset.saPanel = ""
  const clip = doc.createElement("div")
  clip.dataset.saClip = ""
  const content = doc.createElement("div")
  content.dataset.saContents = ""
  content.id = `snooze-archive-${name.toLowerCase()}`
  content.setAttribute("role", "region")
  content.setAttribute("aria-label", name)
  let open = false
  const expand = (next: boolean) => {
    open = next
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
  type Row = { el: HTMLElement; set(item: GroupRow): void; title: HTMLElement; detail: HTMLElement; avatarSlot: HTMLElement; avatar?: string; dispose(): void; leaving?: number }
  const rows = new Map<string, Row>()
  let populated = false
  const status = doc.createElement("p")
  status.setAttribute("role", "status")
  content.append(status)
  const createRow = (item: GroupRow): Row => {
    const el = doc.createElement("div")
    el.dataset.saRow = item.key
    // Same hooks as a session tab: the app styles on [data-titlebar-tab]. No data-tab-key, so the tab strip,
    // tab actions and the sidebar-repos badge (which key on it) never treat this row as a live tab.
    el.setAttribute("data-titlebar-tab", "")
    el.dataset.slot = "titlebar-tab-item"
    el.dataset.orientation = "vertical"
    el.className = ROW_CLASS
    const link = doc.createElement("a")
    link.dataset.slot = "tab-link"
    link.setAttribute("data-titlebar-tab-link", "")
    link.href = "#"
    link.draggable = false
    // The close-slot buttons are the keyboard path; the link only extends the click target.
    link.tabIndex = -1
    link.className = LINK_CLASS
    const avatarSlot = doc.createElement("span")
    avatarSlot.dataset.slot = "project-avatar-slot"
    avatarSlot.className = AVATAR_SLOT_CLASS
    const title = doc.createElement("span")
    title.dataset.slot = "tab-title"
    title.setAttribute("data-titlebar-tab-title", "")
    title.dir = "auto"
    title.className = TITLE_CLASS
    const detail = doc.createElement("span")
    detail.dataset.slot = "tab-project"
    link.append(avatarSlot, title, detail)
    const close = doc.createElement("div")
    close.dataset.slot = "tab-close"
    el.append(link, close)
    const [current, set] = createSignal(item)
    const secondary = createMemo(() => current().secondary?.label)
    link.onclick = (event) => { event.preventDefault(); current().run() }
    const act = (run: () => void) => (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); run() }
    const dispose = host.mount(close, () => [
      createComponent(host.ui.Tooltip, {
        get value() { return current().action },
        get children() {
          return createComponent(host.ui.IconButton, {
            icon: "outline-undo", size: "small",
            get label() { return `${current().action} ${current().title}` },
            onClick: act(() => current().run()),
          })
        },
      }),
      // A function child is inserted reactively; the label memo keeps the button from remounting on every update.
      (() => secondary() ? createComponent(host.ui.Tooltip, {
        get value() { return secondary()! },
        get children() {
          return createComponent(host.ui.IconButton, {
            icon: "outline-trash", size: "small",
            get label() { return `${current().secondary?.label} ${current().title}` },
            onClick: act(() => current().secondary?.run()),
          })
        },
      }) : undefined) as unknown as JSX.Element,
    ])
    return { el, set, title, detail, avatarSlot, dispose }
  }
  return {
    section,
    dispose() {
      disposeHeader()
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
        if (row.title.textContent !== item.title) row.title.textContent = item.title
        if (row.detail.textContent !== item.detail) row.detail.textContent = item.detail
        const link = row.el.firstElementChild as HTMLElement
        link.title = `${item.title}\n${item.detail}`
        const avatarKey = JSON.stringify(item.avatar)
        if (row.avatar !== avatarKey) { row.avatar = avatarKey; row.avatarSlot.replaceChildren(avatarNode(doc, item.avatar)) }
        while (cursor && [...rows.values()].some((r) => r.el === cursor && r.leaving !== undefined)) cursor = cursor.nextSibling
        if (cursor === row.el) cursor = cursor.nextSibling
        else content.insertBefore(row.el, cursor)
      })
      populated = populated || state.rows.length > 0 || state.count !== undefined
    },
  }
}

export function createSidebar(doc: Document, host: Host, schedule: (fn: () => void) => number, cancel: (id: number) => void, timers: Timers = {
  set: (fn, ms) => doc.defaultView!.setTimeout(fn, ms) as unknown as number,
  clear: (id) => doc.defaultView!.clearTimeout(id),
}) {
  const root = doc.createElement("div")
  root.dataset.snoozeArchive = ""
  root.title = "All listed servers · top-level sessions. Snooze is device-local."
  const snoozed = group(doc, host, "Snoozed", schedule, timers)
  const archived = group(doc, host, "Archived", schedule, timers)
  root.append(snoozed.section, archived.section)
  let parent: HTMLElement | undefined
  const attach = () => {
    const strip = doc.querySelector<HTMLElement>('[data-slot="vertical-tabs"]')
    const next = strip?.parentElement ?? undefined
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
      if (r.type === "attributes") return (r.target as Element).matches('[data-slot="vertical-tabs"], [data-slot="titlebar-tabs"]')
      return [...r.addedNodes, ...r.removedNodes].some((node) =>
        node.nodeType === 1 && node !== root && ((node as Element).matches('[data-slot="vertical-tabs"]') || (node as Element).querySelector('[data-slot="vertical-tabs"]')))
    })) return
    if (frame === undefined) frame = schedule(() => { frame = undefined; attach() })
  })
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-slot"] })
  attach()
  return {
    update(snooze: GroupState, archive: GroupState) { snoozed.update(snooze); archived.update(archive); attach() },
    dispose() { snoozed.dispose(); archived.dispose(); observer.disconnect(); if (frame !== undefined) cancel(frame); root.remove(); parent?.removeAttribute("data-sa-host") },
  }
}

export const css = `
[data-sa-host] > [data-slot="vertical-tabs"] { flex: 1; min-height: 0; }
[data-sa-host] > [data-slot="vertical-tabs"] > [data-slot="vertical-tabs-scroll"] { max-height: 100%; }
[data-snooze-archive] { flex: 0 0 auto; margin-top: auto; padding: 8px 0 0; app-region: no-drag; }
.sa-toggle { width: 100%; justify-content: flex-start; }
[data-sa-count] { margin-inline-start: auto; font-variant-numeric: tabular-nums; color: var(--v2-text-text-faint); }
.sa-chevron { transition: transform 200ms cubic-bezier(0.23,1,0.32,1); }
.sa-toggle[aria-expanded="true"] .sa-chevron { transform: rotate(90deg); }
[data-sa-panel] { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition: grid-template-rows 200ms cubic-bezier(0.23,1,0.32,1), opacity 150ms cubic-bezier(0.23,1,0.32,1), visibility 0s linear 200ms; }
[data-sa-panel][data-open] { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition: grid-template-rows 200ms cubic-bezier(0.23,1,0.32,1), opacity 180ms cubic-bezier(0.23,1,0.32,1), visibility 0s; }
[data-sa-clip] { min-height: 0; overflow: hidden; }
[data-sa-contents] { max-height: min(24vh, 220px); overflow-y: auto; overscroll-behavior: contain; padding: 2px 0; }
[data-sa-contents] p { margin: 6px; font-size: 11px; color: var(--v2-text-text-muted); }
[data-sa-row] { transition: opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
[data-sa-row][data-entering], [data-sa-row][data-leaving] { opacity: 0; transform: translateY(-4px); }
[data-sa-row][data-leaving] { pointer-events: none; }
[data-sa-row] [data-slot="tab-close"] { width: auto; gap: 2px; opacity: 0; }
[data-sa-row]:is(:hover, :focus-within) [data-slot="tab-close"] { opacity: 1; }
@media (hover: none) { [data-sa-row] [data-slot="tab-close"] { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .sa-chevron { transition: none; }
  [data-sa-panel], [data-sa-panel][data-open] { transition: opacity 150ms linear, visibility 0s; }
  [data-sa-row] { transition: opacity 160ms linear; }
  [data-sa-row][data-entering], [data-sa-row][data-leaving] { transform: none; }
}
`
