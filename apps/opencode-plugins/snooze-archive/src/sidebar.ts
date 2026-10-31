export interface GroupRow { key: string; title: string; detail: string; action: string; run(): void; secondary?: { label: string; run(): void } }
export interface Timers { set(fn: () => void, ms: number): number; clear(id: number): void }
const LEAVE_MS = 160
export interface GroupState { rows: GroupRow[]; status?: string; count?: number }

function group(doc: Document, name: string, schedule: (fn: () => void) => number, timers: Timers) {
  const section = doc.createElement("section")
  const toggle = doc.createElement("button")
  toggle.type = "button"
  toggle.dataset.saToggle = ""
  const label = doc.createElement("span")
  label.textContent = name
  const count = doc.createElement("span")
  count.dataset.saCount = ""
  const arrow = doc.createElement("span")
  arrow.dataset.saChevron = ""
  arrow.textContent = "›"
  arrow.setAttribute("aria-hidden", "true")
  toggle.append(label, count, arrow)
  const panel = doc.createElement("div")
  panel.dataset.saPanel = ""
  const clip = doc.createElement("div")
  clip.dataset.saClip = ""
  const content = doc.createElement("div")
  content.dataset.saContents = ""
  content.id = `snooze-archive-${name.toLowerCase()}`
  content.setAttribute("role", "region")
  content.setAttribute("aria-label", name)
  toggle.setAttribute("aria-controls", content.id)
  let open = false
  const expand = (next: boolean) => {
    open = next
    panel.toggleAttribute("data-open", next)
    panel.toggleAttribute("inert", !next)
    toggle.setAttribute("aria-expanded", String(next))
  }
  expand(false)
  toggle.onclick = () => expand(!open)
  toggle.onkeydown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      expand(event.key === "ArrowRight")
    }
  }
  clip.append(content)
  panel.append(clip)
  section.append(toggle, panel)
  const rows = new Map<string, { el: HTMLElement; button: HTMLButtonElement; extra: HTMLButtonElement; title: HTMLElement; detail: HTMLElement; leaving?: number }>()
  let populated = false
  const status = doc.createElement("p")
  status.setAttribute("role", "status")
  content.append(status)
  return {
    section,
    dispose() { for (const row of rows.values()) if (row.leaving !== undefined) timers.clear(row.leaving) },
    update(state: GroupState) {
      const text = state.count === undefined ? "—" : String(state.count)
      if (count.textContent !== text) count.textContent = text
      toggle.title = state.status ?? `${state.rows.length} ${name.toLowerCase()}`
      const statusText = state.status ?? (state.rows.length ? "" : `No ${name.toLowerCase()} sessions`)
      if (status.textContent !== statusText) status.textContent = statusText
      status.hidden = !statusText
      const keys = new Set(state.rows.map((row) => row.key))
      // Row motion only while the group is open and after its first content; never on startup or count updates.
      const animate = open && populated
      for (const [key, row] of rows) {
        if (keys.has(key) || row.leaving !== undefined) continue
        if (!animate) { row.el.remove(); rows.delete(key); continue }
        row.el.toggleAttribute("data-leaving", true)
        row.leaving = timers.set(() => { row.el.remove(); rows.delete(key) }, LEAVE_MS)
      }
      let cursor: ChildNode | null = status.nextSibling
      state.rows.forEach((item) => {
        let row = rows.get(item.key)
        if (row?.leaving !== undefined) { timers.clear(row.leaving); row.leaving = undefined; row.el.removeAttribute("data-leaving") }
        if (!row) {
          const el = doc.createElement("div")
          el.dataset.saRow = item.key
          const title = doc.createElement("span")
          const detail = doc.createElement("small")
          const text = doc.createElement("div")
          text.append(title, detail)
          const button = doc.createElement("button")
          button.type = "button"
          const extra = doc.createElement("button")
          extra.type = "button"
          extra.dataset.saDanger = ""
          el.append(text, button, extra)
          row = { el, title, detail, button, extra }
          rows.set(item.key, row)
          if (animate) {
            el.toggleAttribute("data-entering", true)
            schedule(() => el.removeAttribute("data-entering"))
          }
        }
        if (row.title.textContent !== item.title) row.title.textContent = item.title
        if (row.detail.textContent !== item.detail) row.detail.textContent = item.detail
        row.el.title = `${item.title}\n${item.detail}`
        row.button.textContent = item.action
        row.button.setAttribute("aria-label", `${item.action} ${item.title}`)
        row.button.onclick = item.run
        row.extra.hidden = !item.secondary
        row.extra.textContent = item.secondary?.label ?? ""
        row.extra.setAttribute("aria-label", item.secondary ? `${item.secondary.label} ${item.title}` : "")
        row.extra.onclick = item.secondary?.run ?? null
        while (cursor && [...rows.values()].some((r) => r.el === cursor && r.leaving !== undefined)) cursor = cursor.nextSibling
        if (cursor === row.el) cursor = cursor.nextSibling
        else content.insertBefore(row.el, cursor)
      })
      populated = populated || state.rows.length > 0 || state.count !== undefined
    },
  }
}

export function createSidebar(doc: Document, schedule: (fn: () => void) => number, cancel: (id: number) => void, timers: Timers = {
  set: (fn, ms) => doc.defaultView!.setTimeout(fn, ms) as unknown as number,
  clear: (id) => doc.defaultView!.clearTimeout(id),
}) {
  const root = doc.createElement("div")
  root.dataset.snoozeArchive = ""
  root.title = "All listed servers · top-level sessions. Snooze is device-local."
  const snoozed = group(doc, "Snoozed", schedule, timers)
  const archived = group(doc, "Archived", schedule, timers)
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
[data-snooze-archive] { flex: 0 0 auto; margin-top: auto; padding: 8px 0 0; color: var(--v2-text-text-muted); font-size: 12px; app-region: no-drag; }
[data-snooze-archive] button { font: inherit; color: inherit; cursor: pointer; border: 0; background: transparent; border-radius: 5px; }
[data-snooze-archive] button:hover { background: var(--v2-background-bg-layer-02); color: var(--v2-text-text-base); }
[data-snooze-archive] button:focus-visible { outline: 2px solid var(--v2-border-border-focus); outline-offset: -2px; }
[data-sa-toggle] { display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; text-align: start; }
[data-sa-count] { margin-inline-start: auto; font-variant-numeric: tabular-nums; color: var(--v2-text-text-faint); }
[data-sa-chevron] { font-size: 18px; line-height: 1; transition: transform 200ms cubic-bezier(0.23,1,0.32,1); }
[data-sa-toggle][aria-expanded="true"] [data-sa-chevron] { transform: rotate(90deg); }
[data-sa-panel] { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition: grid-template-rows 200ms cubic-bezier(0.23,1,0.32,1), opacity 150ms cubic-bezier(0.23,1,0.32,1), visibility 0s linear 200ms; }
[data-sa-panel][data-open] { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition: grid-template-rows 200ms cubic-bezier(0.23,1,0.32,1), opacity 180ms cubic-bezier(0.23,1,0.32,1), visibility 0s; }
[data-sa-clip] { min-height: 0; overflow: hidden; }
[data-sa-contents] { max-height: min(24vh, 220px); overflow-y: auto; overscroll-behavior: contain; padding: 2px 4px; }
[data-sa-contents] p { margin: 6px; font-size: 11px; }
[data-sa-row] { display: flex; align-items: center; gap: 6px; min-height: 38px; padding: 4px 6px; transition: opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
[data-sa-row][data-entering], [data-sa-row][data-leaving] { opacity: 0; transform: translateY(-4px); }
[data-sa-row][data-leaving] { pointer-events: none; }
[data-sa-row] > div { flex: 1; min-width: 0; }
[data-sa-row] span, [data-sa-row] small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
[data-sa-row] small { font-size: 10px; color: var(--v2-text-text-faint); }
[data-sa-row] button { padding: 4px; font-size: 10px; }
[data-sa-row] button[hidden] { display: none; }
[data-snooze-archive] button[data-sa-danger]:hover { color: var(--v2-text-text-critical, #e5484d); }
@media (prefers-reduced-motion: reduce) {
  [data-sa-chevron] { transition: none; }
  [data-sa-panel], [data-sa-panel][data-open] { transition: opacity 150ms linear, visibility 0s; }
  [data-sa-row] { transition: opacity 160ms linear; }
  [data-sa-row][data-entering], [data-sa-row][data-leaving] { transform: none; }
}
`
