// The model picker's results pane. The host's dialog stays alive: its shell, search field, buttons, flyout, footer,
// selection and favorites all keep running on the host's own state. Only its results list is hidden, and this pane
// shows the same rows in a different order: provider sections only (Favorites above them), with the models the host
// moved into Recent or Favorites listed under their provider as well. Rows are clones of the host's rows (re-cloned
// when a host row changes, one clone per place it appears); the pointer and the arrow keys drive the host's real rows,
// so highlight, flyout and selection stay the host's.
import { layout, presses, providerOf, step, type HostModel, type Rank } from "./layout"

const RESULTS = '[data-slot="search-list-results"]'
const SECTION = '[data-slot="search-list-section"]'
const HEADER = '[data-slot="search-list-header"]'
const ROW = '[data-slot="search-list-row"]'
const INPUT = '[data-slot="text-input-v2-input"]'
const NAME = '[data-slot="model-dialog-name"]'
const EMPTY = '[data-slot="search-list-empty"]'
const FAINT = "span.text-v2-text-text-faint"

export interface PaneEnv {
  /** USD per million output tokens by `providerID:modelID`; read on every layout. */
  price(): ReadonlyMap<string, number>
  /** Stand-in prices for models the catalog leaves unpriced. */
  rank?: Rank
}

export interface Pane {
  /** Lays the pane out again, as after the prices changed. */
  refresh(): void
  dispose(): void
}

interface Snapshot {
  rows: Map<string, { el: HTMLElement; section: string }>
  /** Host order of the rows: the order the host's own arrow keys walk. */
  order: string[]
  headers: Map<string, HTMLElement>
  models: HostModel[]
  /** Provider labels the host rows carry in Favorites and Recent, for providers with no section of their own. */
  labels: Map<string, string>
  results: HTMLElement
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? ""

function snapshot(hostBody: HTMLElement): Snapshot | undefined {
  const results = hostBody.querySelector<HTMLElement>(RESULTS)
  if (!results) return undefined
  const listed = results.querySelectorAll(ROW).length
  const prefix = `${results.id}-section-`
  const snap: Snapshot = { rows: new Map(), order: [], headers: new Map(), models: [], labels: new Map(), results }
  for (const section of results.querySelectorAll<HTMLElement>(SECTION)) {
    const header = section.querySelector<HTMLElement>(HEADER)
    const id = header?.id.startsWith(prefix) ? header.id.slice(prefix.length) : (header?.id ?? "")
    if (header) snap.headers.set(id, header)
    for (const row of section.querySelectorAll<HTMLElement>(ROW)) {
      const key = row.dataset.optionKey
      if (!key || snap.rows.has(key)) continue
      snap.rows.set(key, { el: row, section: id })
      snap.order.push(key)
      const name = text(row.querySelector(`${NAME} > span.truncate`))
      snap.models.push({ key, name, section: id })
      const label = row.querySelector(`${NAME} > ${FAINT}`)
      if (label && !snap.labels.has(providerOf(key))) snap.labels.set(providerOf(key), text(label))
    }
  }
  // The structure is the one this pane reads only if every row the host lists was read, and an empty list is
  // either empty or says so. Anything else is markup this code does not know: the caller steps aside.
  if (snap.rows.size === 0 ? listed > 0 || (results.childElementCount > 0 && !hostBody.querySelector(EMPTY)) : snap.rows.size < listed) return undefined
  return snap
}

const strip = (el: HTMLElement) => {
  el.removeAttribute("id")
  for (const node of el.querySelectorAll("[id]")) node.removeAttribute("id")
}

function cloneRow(host: HTMLElement, plain: boolean) {
  const row = host.cloneNode(true) as HTMLElement
  strip(row)
  row.setAttribute("data-mp-row", "")
  // Under its own provider's header the provider name is repeated, so it goes: true for a Recent row, and for a
  // favorite listed in its provider section (its copy in Favorites keeps the label, as the host shows it).
  if (plain) row.querySelector(`${NAME} > ${FAINT}`)?.remove()
  return row
}

const place = (parent: Element, wanted: readonly Node[]) => {
  wanted.forEach((node, index) => {
    if (parent.childNodes[index] !== node) parent.insertBefore(node, parent.childNodes[index] ?? null)
  })
  while (parent.childNodes.length > wanted.length) parent.lastChild!.remove()
}

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const round = (value: number) => Math.round(value * 1000) / 1000

// The host's own fade of the section headers while scrolling, applied to the pane's headers (see the host's
// `fadeHeaders`): every header sticks, the next one slides over the stuck one, and the stuck label fades out over 16px.
function fadeHeaders(scroll: HTMLElement) {
  const origin = scroll.getBoundingClientRect().top
  const headers = [...scroll.querySelectorAll<HTMLElement>(HEADER)]
  const tops = headers.map((header) => header.getBoundingClientRect().top - origin)
  const stuck = tops.reduce((last, top, index) => (top < 0.5 ? index : last), -1)
  const labelOf = (header: HTMLElement | undefined) => header?.querySelector<HTMLElement>('[data-slot="model-dialog-header-label"]') ?? undefined
  const labels = headers.map((header, index) => {
    const label = labelOf(header)
    const next = tops[index + 1]
    const nextLabel = labelOf(headers[index + 1])
    if (!label || next === undefined || !nextLabel) return { label, opacity: 1 }
    return { label, opacity: clamp((next + nextLabel.offsetTop - label.offsetTop - label.offsetHeight) / 16) }
  })
  const header = headers[stuck]
  const row = header?.nextElementSibling
  const hidden = header && row ? header.offsetHeight + 4 - (row.getBoundingClientRect().top - origin) : 0
  for (const item of labels) item.label?.style.setProperty("opacity", String(round(item.opacity)))
  headers.forEach((item, index) => item.toggleAttribute("data-stuck", index === stuck))
  header?.style.setProperty("--model-dialog-header-fade", String(round(clamp(hidden / 16))))
  scroll.style.setProperty("--search-list-fade-bottom", String(round(clamp((scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop) / 15))))
}

export function attach(dialog: HTMLElement, env: PaneEnv): Pane | undefined {
  const list = dialog.querySelector<HTMLElement>('[data-component="search-list"]')
  const hostBody = list?.querySelector<HTMLElement>(':scope > [data-slot="search-list-body"]:not([data-mp-pane])')
  const input = list?.querySelector<HTMLInputElement>(INPUT)
  if (!list || !hostBody || !input) return undefined
  const host = { body: hostBody, input }

  const body = document.createElement("div")
  body.setAttribute("data-slot", "search-list-body")
  body.setAttribute("data-mp-pane", "")
  const scroll = document.createElement("div")
  scroll.setAttribute("data-slot", "search-list-scroll")
  scroll.setAttribute("data-scrollable", "")
  scroll.style.cssText = "--search-list-fade-offset: 0px; --search-list-fade-top: 1; --search-list-fade-bottom: 1;"
  const fade = document.createElement("div")
  fade.setAttribute("data-slot", "search-list-fade")
  fade.setAttribute("aria-hidden", "true")
  const results = document.createElement("div")
  results.setAttribute("data-slot", "search-list-results")
  results.setAttribute("role", "listbox")
  scroll.append(fade, results)
  body.append(scroll)

  let snap: Snapshot | undefined
  const sections = new Map<string, HTMLElement>()
  const headers = new Map<string, { el: HTMLElement; sig: string }>()
  /** One clone per place a model is shown: Favorites and its provider section both hold one for a favorite. */
  interface Clone {
    el: HTMLElement
    sig: string
    host: HTMLElement
    key: string
  }
  const rows = new Map<string, Clone>()
  const cloned = new WeakMap<HTMLElement, Clone>()
  const placement = (section: string, key: string) => `${section}\u0000${key}`
  const clonesOf = (key: string) => [...rows.values()].filter((row) => row.key === key)
  /** The pane row the highlight last settled on: which copy of a model listed twice to move away from, and which one the
   *  host's flyout should sit beside. */
  let anchor: HTMLElement | undefined
  const patched = new Set<HTMLElement>()
  let queued = false
  let disposed = false
  let pendingFirst = true
  /** The row to bring into view after the next render: the first clone of `key` past `after`, the way `direction` moves. */
  let pendingScroll: { key: string; after: number; direction: 1 | -1 } | undefined
  let syncing = false
  let frame: number | undefined

  const hostActive = () => {
    if (!snap) return undefined
    for (const [key, row] of snap.rows) if (row.el.hasAttribute("data-active")) return key
    return snap.order[0]
  }

  // Moves the host's highlight with its own arrow-key handler, so its state, flyout and `keyboard` flag follow.
  const moveHostTo = (target: string) => {
    if (!snap || !snap.rows.has(target)) return
    const { key, count } = presses(snap.order, hostActive(), target)
    syncing = true
    try {
      for (let i = 0; i < count; i++) host.input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
    } finally {
      syncing = false
    }
  }

  const providerName = (id: string) => text(snap?.headers.get(id)?.querySelector('[data-slot="model-dialog-header-label"]')) || snap?.labels.get(id) || id

  // The host's list is hidden only while this pane shows a list built from a snapshot of it. A host list the
  // snapshot cannot read (markup changed) is never hidden, or is shown again, and the pane waits for a readable one.
  let engaged = false
  const engage = () => {
    if (engaged) return
    engaged = true
    host.body.before(body)
    host.body.setAttribute("data-mp-hidden", "")
  }
  const disengage = () => {
    engaged = false
    body.remove()
    host.body.removeAttribute("data-mp-hidden")
    for (const el of patched) delete (el as { getBoundingClientRect?: unknown }).getBoundingClientRect
    patched.clear()
    pendingFirst = true
    pendingScroll = undefined
  }

  const sync = () => {
    if (disposed) return
    if (!dialog.isConnected) return dispose()
    try {
      render()
    } catch (error) {
      console.error("model-picker: stepping aside", error)
      disengage()
    }
  }

  const render = () => {
    snap = snapshot(host.body)
    if (!snap) return disengage()
    const model = snap
    const order = layout({ models: model.models, price: env.price(), providerName, rank: env.rank })
    const sectionNodes: Node[] = []
    const seenRows = new Set<string>()
    for (const section of order) {
      const headerId = `mp-section-${section.id}`
      const hostHeader = model.headers.get(section.id)
      let header = headers.get(section.id)
      const label = providerName(section.id)
      const sig = hostHeader ? hostHeader.innerHTML : label
      if (!header || header.sig !== sig) {
        const el = hostHeader ? (hostHeader.cloneNode(true) as HTMLElement) : document.createElement("div")
        if (!hostHeader) {
          el.setAttribute("data-slot", "search-list-header")
          el.innerHTML = `<span data-slot="model-dialog-header-label" class="flex min-w-0 items-center gap-1.5"><span class="min-w-0 truncate"></span></span>`
          el.querySelector("span.truncate")!.textContent = label
        }
        strip(el)
        el.id = headerId
        header = { el, sig }
        headers.set(section.id, header)
      }
      let sectionEl = sections.get(section.id)
      if (!sectionEl) {
        sectionEl = document.createElement("div")
        sectionEl.setAttribute("data-slot", "search-list-section")
        sectionEl.setAttribute("role", "group")
        sectionEl.setAttribute("aria-labelledby", headerId)
        sections.set(section.id, sectionEl)
      }
      const rowNodes: Node[] = []
      for (const key of section.keys) {
        const host = model.rows.get(key)!
        // The copy under its own provider header loses the provider label; the Favorites copy keeps it.
        const plain = host.section === "recent" || section.id === providerOf(key)
        const raw = host.el.outerHTML + (plain ? "|plain" : "")
        const id = placement(section.id, key)
        let row = rows.get(id)
        if (!row || row.sig !== raw) {
          row = { el: cloneRow(host.el, plain), sig: raw, host: host.el, key }
          rows.set(id, row)
          cloned.set(row.el, row)
        }
        row.host = host.el
        seenRows.add(id)
        rowNodes.push(row.el)
        if (!patched.has(host.el)) {
          // The host places its flyout beside the row it is given: give it this pane's row's box, and the copy that is
          // lit when the model is listed twice.
          host.el.getBoundingClientRect = () => {
            const copies = clonesOf(key).map((copy) => copy.el)
            const shown =
              anchor && copies.includes(anchor) ? anchor : (copies.find((copy) => copy.hasAttribute("data-active")) ?? copies[0])
            return shown ? shown.getBoundingClientRect() : Element.prototype.getBoundingClientRect.call(host.el)
          }
          patched.add(host.el)
        }
      }
      place(sectionEl, [header.el, ...rowNodes])
      sectionNodes.push(sectionEl)
    }
    for (const key of [...rows.keys()]) if (!seenRows.has(key)) rows.delete(key)
    for (const id of [...sections.keys()]) if (!order.some((section) => section.id === id)) (sections.delete(id), headers.delete(id))
    // The host's empty-search note, when it lists nothing.
    const empty = host.body.querySelector<HTMLElement>(EMPTY)
    if (order.length === 0 && empty) {
      const copy = empty.cloneNode(true) as HTMLElement
      strip(copy)
      sectionNodes.push(copy)
    }
    results.setAttribute("aria-label", model.results.getAttribute("aria-label") ?? "")
    place(results, sectionNodes)

    const ours = [...results.querySelectorAll<HTMLElement>("[data-mp-row]")].map((row) => row.dataset.optionKey!)
    // Every model the host lists is shown; a favorite is simply shown twice.
    if (new Set(ours).size < model.rows.size) return disengage()
    engage()
    if (pendingFirst && ours.length > 0) {
      pendingFirst = false
      pendingScroll = undefined
      scroll.scrollTo?.({ top: 0 })
      if (ours[0] !== hostActive()) moveHostTo(ours[0]!)
    }
    if (pendingScroll) {
      const { key, after, direction } = pendingScroll
      pendingScroll = undefined
      const list = [...results.querySelectorAll<HTMLElement>("[data-mp-row]")]
      const copies = list.map((row, index) => ({ row, index })).filter((entry) => entry.row.dataset.optionKey === key)
      // Moving down takes the first copy past the row we came from, up takes the last copy before it: a favorite listed
      // under its provider too is walked where the arrow is going, not back up to the top.
      const target =
        direction === 1
          ? (copies.find((entry) => entry.index > after) ?? copies[0])
          : ([...copies].reverse().find((entry) => entry.index < after) ?? copies[copies.length - 1])
      if (target !== undefined) {
        anchor = target.row
        if (target.index === 0) scroll.scrollTo?.({ top: 0 })
        else target.row.scrollIntoView?.({ block: "nearest" })
      }
    }
    if (frame === undefined) frame = requestAnimationFrame(() => ((frame = undefined), !disposed && fadeHeaders(scroll)))
  }

  const schedule = () => {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => ((queued = false), sync()))
  }

  const hostRow = (event: Event) => {
    const row = (event.target as Element | null)?.closest<HTMLElement>("[data-mp-row]")
    const clone = row ? cloned.get(row) : undefined
    return clone ? { ours: row!, host: clone.host } : undefined
  }
  const onClick = (event: MouseEvent) => {
    const hit = hostRow(event)
    if (!hit) return
    anchor = hit.ours
    hit.host.click()
  }
  const onMove = (event: MouseEvent) => {
    const hit = hostRow(event)
    const target = hit?.host
    if (!hit || !target) return
    anchor = hit.ours
    const { clientX, clientY, screenX, screenY, movementX, movementY, buttons, shiftKey, ctrlKey, altKey, metaKey } = event
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, screenX, screenY, movementX, movementY, buttons, shiftKey, ctrlKey, altKey, metaKey }))
  }
  const onLeave = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.matches?.("[data-mp-row]")) return
    const host = cloned.get(target)?.host
    host?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, view: window, clientX: event.clientX, clientY: event.clientY, relatedTarget: event.relatedTarget as EventTarget | null }))
  }
  body.addEventListener("click", onClick)
  body.addEventListener("mousemove", onMove)
  body.addEventListener("mouseleave", onLeave, true)
  scroll.addEventListener("scroll", () => fadeHeaders(scroll), { passive: true })

  const onKeyDown = (event: KeyboardEvent) => {
    if (syncing || event.target !== host.input || event.isComposing) return
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    const list = [...results.querySelectorAll<HTMLElement>("[data-mp-row]")]
    if (list.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const active = list.find((row) => row.hasAttribute("data-active"))?.dataset.optionKey
    // A favorite is listed in Favorites and under its provider: the arrow walks each model once.
    const keys = [...new Set(list.map((row) => row.dataset.optionKey!))]
    const direction = event.key === "ArrowDown" ? 1 : -1
    const next = step(keys, active, direction)
    if (!next) return
    // Where the highlight really is: a model shown twice is lit in both places, and the copy we last landed on is the one
    // the next press should move away from.
    const lit = list.findIndex((row) => row.hasAttribute("data-active"))
    const from = anchor && list.includes(anchor) && anchor.dataset.optionKey === active ? list.indexOf(anchor) : lit
    pendingScroll = { key: next, after: from, direction }
    moveHostTo(next)
    schedule()
  }
  dialog.addEventListener("keydown", onKeyDown, true)
  // The host filters its rows in its own input handler, which runs after this one: look at them on the next task.
  let typed: ReturnType<typeof setTimeout> | undefined
  const onInput = () => {
    clearTimeout(typed)
    typed = setTimeout(() => {
      pendingFirst = true
      schedule()
    }, 0)
  }
  host.input.addEventListener("input", onInput)

  const observer = new MutationObserver(schedule)
  observer.observe(host.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-active", "aria-current", "aria-selected", "data-option-key"] })
  sync()

  function dispose() {
    if (disposed) return
    disposed = true
    observer.disconnect()
    dialog.removeEventListener("keydown", onKeyDown, true)
    host.input.removeEventListener("input", onInput)
    clearTimeout(typed)
    if (frame !== undefined) cancelAnimationFrame(frame)
    disengage()
  }

  return { refresh: schedule, dispose }
}
