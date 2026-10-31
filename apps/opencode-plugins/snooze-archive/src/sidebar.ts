export interface GroupRow { key: string; title: string; detail: string; action: string; run(): void }
export interface GroupState { rows: GroupRow[]; status?: string; count?: number }

function group(doc: Document, name: string) {
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
  const content = doc.createElement("div")
  content.dataset.saContents = ""
  content.id = `snooze-archive-${name.toLowerCase()}`
  content.setAttribute("role", "region")
  content.setAttribute("aria-label", name)
  toggle.setAttribute("aria-controls", content.id)
  const expand = (open: boolean) => {
    content.hidden = !open
    toggle.setAttribute("aria-expanded", String(open))
  }
  expand(false)
  toggle.onclick = () => expand(content.hidden)
  toggle.onkeydown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault()
      expand(event.key === "ArrowRight")
    }
  }
  section.append(toggle, content)
  const rows = new Map<string, { el: HTMLElement; button: HTMLButtonElement; title: HTMLElement; detail: HTMLElement }>()
  const status = doc.createElement("p")
  status.setAttribute("role", "status")
  content.append(status)
  return {
    section,
    update(state: GroupState) {
      const text = state.count === undefined ? "—" : String(state.count)
      if (count.textContent !== text) count.textContent = text
      toggle.title = state.status ?? `${state.rows.length} ${name.toLowerCase()}`
      const statusText = state.status ?? (state.rows.length ? "" : `No ${name.toLowerCase()} sessions`)
      if (status.textContent !== statusText) status.textContent = statusText
      status.hidden = !statusText
      const keys = new Set(state.rows.map((row) => row.key))
      for (const [key, row] of rows) if (!keys.has(key)) { row.el.remove(); rows.delete(key) }
      state.rows.forEach((item, index) => {
        let row = rows.get(item.key)
        if (!row) {
          const el = doc.createElement("div")
          el.dataset.saRow = item.key
          const title = doc.createElement("span")
          const detail = doc.createElement("small")
          const text = doc.createElement("div")
          text.append(title, detail)
          const button = doc.createElement("button")
          button.type = "button"
          el.append(text, button)
          row = { el, title, detail, button }
          rows.set(item.key, row)
        }
        if (row.title.textContent !== item.title) row.title.textContent = item.title
        if (row.detail.textContent !== item.detail) row.detail.textContent = item.detail
        row.el.title = `${item.title}\n${item.detail}`
        row.button.textContent = item.action
        row.button.setAttribute("aria-label", `${item.action} ${item.title}`)
        row.button.onclick = item.run
        if (content.children[index + 1] !== row.el) content.insertBefore(row.el, content.children[index + 1] ?? null)
      })
    },
  }
}

export function createSidebar(doc: Document, schedule: (fn: () => void) => number, cancel: (id: number) => void) {
  const root = doc.createElement("div")
  root.dataset.snoozeArchive = ""
  root.title = "All listed servers · top-level sessions. Snooze is device-local."
  const snoozed = group(doc, "Snoozed")
  const archived = group(doc, "Archived")
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
    dispose() { observer.disconnect(); if (frame !== undefined) cancel(frame); root.remove(); parent?.removeAttribute("data-sa-host") },
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
[data-sa-chevron] { font-size: 18px; line-height: 1; transition: transform 140ms cubic-bezier(0.23,1,0.32,1); }
[data-sa-toggle][aria-expanded="true"] [data-sa-chevron] { transform: rotate(90deg); }
[data-sa-contents] { max-height: min(24vh, 220px); overflow-y: auto; overscroll-behavior: contain; padding: 2px 4px; }
[data-sa-contents][hidden] { display: none; }
[data-sa-contents] p { margin: 6px; font-size: 11px; }
[data-sa-row] { display: flex; align-items: center; gap: 6px; min-height: 38px; padding: 4px 6px; }
[data-sa-row] > div { flex: 1; min-width: 0; }
[data-sa-row] span, [data-sa-row] small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
[data-sa-row] small { font-size: 10px; color: var(--v2-text-text-faint); }
[data-sa-row] button { padding: 4px; font-size: 10px; }
@media (prefers-reduced-motion: reduce) { [data-sa-chevron] { transition: none; } }
`
