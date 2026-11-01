import { openPublishedGroups } from "./groups"
import type { Frames, View } from "./frames"
import { rowLabel, type Placement } from "./ids"

export const wrapperSelector = '[data-component="tool-part-wrapper"][data-timeline-part-id]'
const HOST = "data-visual-reply"
const ROW = "data-visual-reply-update"
const OVERLAY = "data-visual-reply-overlay"

/** What a card shows: the artifact's current page, or the page its tool call carried when the artifact is gone. */
export interface PageData {
  title: string
  html: string
}

export interface AttachOptions {
  doc: Document
  frames: Frames
  /** Tool parts the session scan placed something under, and every finished part it examined. */
  scan: () => { placements: ReadonlyMap<string, readonly Placement[]>; settled: ReadonlySet<string> }
  load: (placement: Placement) => Promise<PageData | undefined>
  failedLabel: () => string
  /** The word on an update row, in the app's language. */
  updatedLabel: () => string
  /** Title of an artifact the scan listed, for update rows that carry none. */
  titleOf: (artifactID: string) => string | undefined
  /** Called with tool part ids on screen that are neither placed nor finished. */
  unknown?: (callIDs: string[]) => void
  schedule?: (run: () => void) => void
  /** Mounts the zoom/panel/expand/close buttons into `container` and returns their disposer. */
  mountControls: (container: HTMLElement, actions: ControlActions) => () => void
  openPanel: (artifactID: string) => void
}

export interface ControlActions {
  surface: "inline" | "overlay"
  title: string
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  /** Expands the inline card, or closes the overlay. */
  primary: () => void
  /** Opens the same artifact in the side panel; absent when the call's artifact id is unknown. */
  panel?: () => void
}

interface Item {
  key: string
  placement: Placement
  host: HTMLElement
  body?: HTMLElement
  titleEl?: HTMLElement
  disposeControls?: () => void
  view?: View
  loading: boolean
}

interface Entry {
  wrapper: Element
  items: Item[]
}

const pageCacheSize = 40
/** A part still running when asked is asked again after 1s, 2s, 4s ... up to this many times, so a finished one is found. */
const maxAsks = 6
const eligible = (entry: { count: number; at: number } | undefined, at: number) =>
  !entry || (entry.count < maxAsks && at - entry.at >= 1000 * 2 ** (entry.count - 1))

/**
 * Inserts a card under the tool row of each artifact the agent created and a compact row under each update. The host
 * has no timeline extension point (host-architecture §8), so this is DOM next to the host's row, never inside it.
 */
export function createAttacher(options: AttachOptions) {
  const { doc, frames } = options
  const schedule = options.schedule ?? ((run) => void requestAnimationFrame(run))
  const entries = new Map<Element, Entry>()
  const pages = new Map<string, PageData>()
  const asked = new Map<string, { count: number; at: number }>()
  const openedGroups = new Set<string>()
  let overlay: { root: HTMLElement; view: View; disposeControls: () => void; keydown: (event: KeyboardEvent) => void } | undefined
  let disposed = false
  let pending = false

  const pageKey = (placement: Placement) => placement.artifactID ?? placement.callID

  function remember(key: string, page: PageData) {
    pages.delete(key)
    pages.set(key, page)
    for (const stale of pages.keys()) {
      if (pages.size <= pageCacheSize) break
      if (![...entries.values()].some((entry) => entry.items.some((item) => pageKey(item.placement) === stale))) pages.delete(stale)
    }
  }

  const controlsFor = (container: HTMLElement, placement: Placement, surface: ControlActions["surface"]) => {
    const group = pageKey(placement)
    return options.mountControls(container, {
      surface,
      title: pages.get(group)?.title ?? "",
      zoomIn: () => frames.zoomStep(group, 1),
      zoomOut: () => frames.zoomStep(group, -1),
      zoomReset: () => frames.zoomReset(group),
      primary: () => (surface === "inline" ? openOverlay(placement) : closeOverlay()),
      panel: placement.artifactID ? () => options.openPanel(placement.artifactID!) : undefined,
    })
  }

  function closeOverlay() {
    if (!overlay) return
    doc.removeEventListener("keydown", overlay.keydown, true)
    overlay.disposeControls()
    frames.retire(overlay.view)
    overlay.root.remove()
    overlay = undefined
  }

  function openOverlay(placement: Placement) {
    const page = pages.get(pageKey(placement))
    if (!page) return
    closeOverlay()
    const root = doc.createElement("div")
    root.setAttribute(OVERLAY, placement.callID)
    root.setAttribute("role", "dialog")
    root.setAttribute("aria-modal", "true")
    root.setAttribute("aria-label", page.title)
    const head = doc.createElement("div")
    head.setAttribute("data-slot", "head")
    const title = doc.createElement("span")
    title.setAttribute("data-slot", "title")
    title.textContent = page.title
    const slot = doc.createElement("div")
    slot.setAttribute("data-slot", "controls")
    head.append(title, slot)
    const disposeControls = controlsFor(slot, placement, "overlay")
    const view = frames.create({ group: pageKey(placement), html: page.html, surface: "overlay", title: page.title })
    root.append(head, view.frame)
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      closeOverlay()
    }
    doc.addEventListener("keydown", keydown, true)
    doc.body.append(root)
    overlay = { root, view, disposeControls, keydown }
  }

  function div(slot?: string) {
    const node = doc.createElement("div")
    if (slot) node.setAttribute("data-slot", slot)
    return node
  }

  function buildCard(item: Item) {
    const head = div("head")
    const title = doc.createElement("span")
    title.setAttribute("data-slot", "title")
    title.textContent = item.placement.title ?? pages.get(pageKey(item.placement))?.title ?? ""
    const slot = div("controls")
    head.append(title, slot)
    const body = div("body")
    item.host.append(head, body)
    item.body = body
    item.titleEl = title
    item.disposeControls = controlsFor(slot, item.placement, "inline")
  }

  /** The host's own tool-row markup (`BasicTool` trigger), so its CSS styles the row: no copy of its rules here. */
  function buildRow(item: Item) {
    const label = rowLabel(item.placement, { title: options.titleOf(item.placement.artifactID ?? "") ?? "" })
    // The same two wrappers the host puts around a tool row, so its layout rules apply (no part id: this is not a part).
    item.host.setAttribute("data-component", "tool-part-wrapper")
    const collapsible = div()
    collapsible.setAttribute("data-component", "collapsible")
    collapsible.setAttribute("data-variant", "normal")
    collapsible.classList.add("tool-collapsible")
    item.host.append(collapsible)
    const button = doc.createElement("button")
    button.type = "button"
    button.setAttribute("data-slot", "collapsible-trigger")
    const trigger = div()
    trigger.setAttribute("data-component", "tool-trigger")
    const content = div("basic-tool-tool-trigger-content")
    const info = div("basic-tool-tool-info")
    const structured = div("basic-tool-tool-info-structured")
    const main = div("basic-tool-tool-info-main")
    const title = doc.createElement("span")
    title.setAttribute("data-slot", "basic-tool-tool-title")
    title.textContent = options.updatedLabel()
    const arg = doc.createElement("span")
    arg.setAttribute("data-slot", "basic-tool-tool-arg")
    arg.textContent = label
    main.append(title, arg)
    structured.append(main)
    info.append(structured)
    content.append(info)
    trigger.append(content)
    button.append(trigger)
    collapsible.append(button)
    const id = item.placement.artifactID
    if (id) button.addEventListener("click", () => options.openPanel(id))
    else button.disabled = true
  }

  function fill(item: Item, page: PageData) {
    if (!item.body || !item.titleEl) return
    item.titleEl.textContent = page.title
    if (item.view) frames.retire(item.view)
    item.body.replaceChildren()
    item.view = frames.create({ group: pageKey(item.placement), html: page.html, surface: "inline", title: page.title })
    item.body.append(item.view.frame)
  }

  function fail(item: Item) {
    item.body?.replaceChildren()
    const note = div("error")
    note.textContent = options.failedLabel()
    item.body?.append(note)
  }

  function request(item: Item) {
    const key = pageKey(item.placement)
    const cached = pages.get(key)
    if (cached) return fill(item, cached)
    item.loading = true
    void options
      .load(item.placement)
      .then((loaded) => {
        if (disposed || !item.host.isConnected) return
        if (!loaded) return fail(item)
        remember(key, loaded)
        fill(item, loaded)
      })
      .catch(() => item && !disposed && fail(item))
      .finally(() => {
        item.loading = false
      })
  }

  function mountItem(wrapper: Element, entry: Entry, placement: Placement, index: number, after: Element) {
    const item: Item = { key: `${placement.callID}#${index}`, placement, host: div(), loading: false }
    item.host.setAttribute(placement.kind === "card" ? HOST : ROW, item.key)
    if (placement.kind === "card") buildCard(item)
    else buildRow(item)
    after.after(item.host)
    entry.items.push(item)
    if (placement.kind === "card") request(item)
    return item.host
  }

  function unmount(wrapper: Element) {
    const entry = entries.get(wrapper)
    if (!entry) return
    for (const item of entry.items) {
      item.disposeControls?.()
      if (item.view) frames.retire(item.view)
      item.host.remove()
    }
    entries.delete(wrapper)
  }

  const intact = (entry: Entry, placements: readonly Placement[]) =>
    entry.items.length === placements.length &&
    entry.items.every((item, index) => {
      const placement = placements[index]!
      const previous = index === 0 ? entry.wrapper : entry.items[index - 1]!.host
      return item.host.isConnected && item.host.previousElementSibling === previous && item.placement.artifactID === placement.artifactID && item.placement.kind === placement.kind
    })

  function run() {
    pending = false
    if (disposed) return
    const { placements, settled } = options.scan()
    const seen = new Set<Element>()
    const fresh = new Set<string>()
    const resolved = { has: (id: string) => placements.has(id) }
    const finished = { has: (id: string) => placements.has(id) || settled.has(id) }
    const at = Date.now()
    for (const callID of openPublishedGroups(doc, resolved, openedGroups, finished).unknown) if (eligible(asked.get(callID), at)) fresh.add(callID)
    for (const wrapper of doc.querySelectorAll(wrapperSelector)) {
      const callID = wrapper.getAttribute("data-timeline-part-id")!
      const found = placements.get(callID)
      if (!found) {
        if (!finished.has(callID) && eligible(asked.get(callID), at)) fresh.add(callID)
        continue
      }
      seen.add(wrapper)
      const entry = entries.get(wrapper)
      if (entry && intact(entry, found)) continue
      if (entry) unmount(wrapper)
      const next: Entry = { wrapper, items: [] }
      entries.set(wrapper, next)
      let anchor: Element = wrapper
      found.forEach((placement, index) => {
        anchor = mountItem(wrapper, next, placement, index, anchor)
      })
    }
    for (const wrapper of [...entries.keys()]) if (!seen.has(wrapper)) unmount(wrapper)
    for (const host of doc.querySelectorAll(`[${HOST}],[${ROW}]`)) {
      if (![...entries.values()].some((entry) => entry.items.some((item) => item.host === host))) host.remove()
    }
    if (fresh.size) {
      for (const callID of fresh) asked.set(callID, { count: (asked.get(callID)?.count ?? 0) + 1, at })
      options.unknown?.([...fresh])
    }
  }

  const ours = (node: Node) => node instanceof Element && (node.hasAttribute(HOST) || node.hasAttribute(ROW) || node.hasAttribute(OVERLAY))
  const observer = new (doc.defaultView as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver((mutations) => {
    if (mutations.every((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].every(ours))) return
    ask()
  })

  function ask() {
    if (pending || disposed) return
    pending = true
    schedule(run)
  }

  for (const stale of doc.querySelectorAll(`[${HOST}],[${ROW}],[${OVERLAY}]`)) stale.remove()
  observer.observe(doc.body, { childList: true, subtree: true })
  ask()

  return {
    scan: ask,
    /** The artifact changed: reload every live card that shows it, in place. */
    async refresh(artifactID: string) {
      pages.delete(artifactID)
      for (const entry of entries.values()) {
        for (const item of entry.items) {
          if (item.placement.kind !== "card" || item.placement.artifactID !== artifactID || !item.view) continue
          const loaded = await options.load(item.placement).catch(() => undefined)
          if (disposed || !loaded || !item.view) continue
          remember(artifactID, loaded)
          item.titleEl && (item.titleEl.textContent = loaded.title)
          frames.reload(item.view, loaded.html)
        }
      }
    },
    count: () => [...entries.values()].reduce((total, entry) => total + entry.items.length, 0),
    dispose() {
      disposed = true
      observer.disconnect()
      closeOverlay()
      for (const wrapper of [...entries.keys()]) unmount(wrapper)
      for (const stale of doc.querySelectorAll(`[${HOST}],[${ROW}],[${OVERLAY}]`)) stale.remove()
      entries.clear()
    },
  }
}
