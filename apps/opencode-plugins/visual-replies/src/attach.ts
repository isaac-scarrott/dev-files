import { buildDocument, csp, parseFrameMessage, sandbox, themeKey, zoomSteps, type Theme } from "./frame"

export const wrapperSelector = '[data-component="tool-part-wrapper"][data-timeline-part-id]'
const HOST = "data-visual-reply"
const OVERLAY = "data-visual-reply-overlay"

export interface PageData {
  title: string
  html: string
}

export interface AttachOptions {
  doc: Document
  /** Ids of tool calls known to have published a page. */
  known: () => ReadonlySet<string>
  load: (callID: string) => Promise<PageData | undefined>
  theme: () => Theme
  openExternal: (url: string) => void
  /** Called with ids on screen that no page is known for yet. */
  unknown?: (callIDs: string[]) => void
  schedule?: (run: () => void) => void
  /**
   * Mounts the zoom/expand/close buttons into `container` and returns their disposer. The caller renders the app's
   * own buttons; this file only owns the sandboxed frame and its placement.
   */
  mountControls: (container: HTMLElement, actions: ControlActions) => () => void
}

export interface ControlActions {
  /** Which surface the buttons are on: the inline card (expand) or the full-window overlay (close). */
  surface: "inline" | "overlay"
  title: string
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
  /** Expands the inline card, or closes the overlay. */
  primary: () => void
}

interface View {
  callID: string
  frame: HTMLIFrameElement
  overlay: boolean
}

interface Entry {
  wrapper: Element
  disposeControls: () => void
  host: HTMLElement
  body: HTMLElement
  view?: View
  loading: boolean
}

const pageCacheSize = 40
export function createAttacher(options: AttachOptions) {
  const { doc } = options
  const schedule = options.schedule ?? ((run) => void requestAnimationFrame(run))
  const entries = new Map<Element, Entry>()
  const pages = new Map<string, PageData>()
  const heights = new Map<string, number>()
  const zooms = new Map<string, number>()
  const askedUnknown = new Set<string>()
  let overlay: { root: HTMLElement; view: View; callID: string; keydown: (event: KeyboardEvent) => void; disposeControls: () => void } | undefined
  let theme = options.theme()
  let themeId = themeKey(theme)
  let disposed = false
  let pending = false

  const views = () => [...entries.values()].flatMap((entry) => (entry.view ? [entry.view] : [])).concat(overlay ? [overlay.view] : [])

  function post(view: View, message: Record<string, unknown>) {
    view.frame.contentWindow?.postMessage({ vr: view.callID, ...message }, "*")
  }

  function sync(view: View) {
    post(view, { type: "theme", mode: theme.mode, vars: theme.vars })
    post(view, { type: "zoom", value: zooms.get(view.callID) ?? 1 })
  }

  function makeFrame(callID: string, page: PageData, overlayView: boolean): View {
    const frame = doc.createElement("iframe")
    frame.setAttribute("sandbox", sandbox)
    frame.setAttribute("csp", csp)
    frame.setAttribute("referrerpolicy", "no-referrer")
    frame.setAttribute("loading", "eager")
    frame.title = page.title
    frame.setAttribute("data-visual-reply-frame", overlayView ? "overlay" : "inline")
    if (!overlayView) frame.style.height = `${heights.get(callID) ?? 240}px`
    frame.srcdoc = buildDocument({ id: callID, html: page.html, theme })
    return { callID, frame, overlay: overlayView }
  }

  function onMessage(event: MessageEvent) {
    const view = views().find((item) => item.frame.contentWindow && item.frame.contentWindow === event.source)
    if (!view) return
    const message = parseFrameMessage(event.data, view.callID)
    if (!message) return
    if (message.type === "ready") sync(view)
    else if (message.type === "height") {
      if (view.overlay) return
      if (Math.abs((heights.get(view.callID) ?? 0) - message.height) < 2) return
      heights.set(view.callID, message.height)
      view.frame.style.height = `${message.height}px`
    } else options.openExternal(message.url)
  }
  doc.defaultView?.addEventListener("message", onMessage)

  function setZoom(callID: string, next: number) {
    const value = Math.min(zoomSteps.at(-1)!, Math.max(zoomSteps[0], next))
    zooms.set(callID, value)
    for (const view of views()) if (view.callID === callID) post(view, { type: "zoom", value })
  }

  function stepZoom(callID: string, direction: 1 | -1) {
    const current = zooms.get(callID) ?? 1
    const index = zoomSteps.findIndex((step) => step >= current - 1e-9)
    const next = zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, index + direction))]!
    setZoom(callID, next)
  }

  function controlsFor(container: HTMLElement, callID: string, surface: ControlActions["surface"]) {
    return options.mountControls(container, {
      surface,
      title: pages.get(callID)?.title ?? "",
      zoomIn: () => stepZoom(callID, 1),
      zoomOut: () => stepZoom(callID, -1),
      zoomReset: () => setZoom(callID, 1),
      primary: () => (surface === "inline" ? openOverlay(callID) : closeOverlay()),
    })
  }

  function closeOverlay() {
    if (!overlay) return
    doc.removeEventListener("keydown", overlay.keydown, true)
    overlay.disposeControls()
    overlay.root.remove()
    overlay = undefined
  }

  function openOverlay(callID: string) {
    const page = pages.get(callID)
    if (!page) return
    closeOverlay()
    const root = doc.createElement("div")
    root.setAttribute(OVERLAY, callID)
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
    const disposeControls = controlsFor(slot, callID, "overlay")
    const view = makeFrame(callID, page, true)
    root.append(head, view.frame)
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.stopPropagation()
      closeOverlay()
    }
    doc.addEventListener("keydown", keydown, true)
    doc.body.append(root)
    overlay = { root, view, callID, keydown, disposeControls }
  }

  function remember(callID: string, page: PageData) {
    pages.delete(callID)
    pages.set(callID, page)
    const live = new Set([...entries.values()].map((entry) => entry.host.getAttribute(HOST)))
    for (const key of pages.keys()) {
      if (pages.size <= pageCacheSize) break
      if (!live.has(key)) pages.delete(key)
    }
  }

  function fill(entry: Entry, callID: string, page: PageData) {
    entry.body.replaceChildren()
    entry.view = makeFrame(callID, page, false)
    entry.body.append(entry.view.frame)
  }

  function mount(wrapper: Element, callID: string) {
    const host = doc.createElement("div")
    host.setAttribute(HOST, callID)
    const head = doc.createElement("div")
    head.setAttribute("data-slot", "head")
    const title = doc.createElement("span")
    title.setAttribute("data-slot", "title")
    title.textContent = pages.get(callID)?.title ?? ""
    const slot = doc.createElement("div")
    slot.setAttribute("data-slot", "controls")
    head.append(title, slot)
    const body = doc.createElement("div")
    body.setAttribute("data-slot", "body")
    host.append(head, body)
    wrapper.after(host)
    const entry: Entry = { wrapper, host, body, loading: false, disposeControls: controlsFor(slot, callID, "inline") }
    entries.set(wrapper, entry)
    const page = pages.get(callID)
    if (page) fill(entry, callID, page)
    else {
      entry.loading = true
      void options
        .load(callID)
        .then((loaded) => {
          if (disposed || entries.get(wrapper) !== entry) return
          if (loaded) {
            remember(callID, loaded)
            title.textContent = loaded.title
            fill(entry, callID, loaded)
          }
        })
        .catch(() => {})
        .finally(() => {
          entry.loading = false
        })
    }
  }

  function unmount(wrapper: Element) {
    entries.get(wrapper)?.disposeControls()
    entries.get(wrapper)?.host.remove()
    entries.delete(wrapper)
  }

  function run() {
    pending = false
    if (disposed) return
    const known = options.known()
    const seen = new Set<Element>()
    const fresh: string[] = []
    for (const wrapper of doc.querySelectorAll(wrapperSelector)) {
      const callID = wrapper.getAttribute("data-timeline-part-id")!
      if (!known.has(callID)) {
        if (!askedUnknown.has(callID)) fresh.push(callID)
        continue
      }
      seen.add(wrapper)
      const entry = entries.get(wrapper)
      if (entry && entry.host.isConnected && entry.host.previousElementSibling === wrapper && entry.host.getAttribute(HOST) === callID) continue
      if (entry) unmount(wrapper)
      mount(wrapper, callID)
    }
    for (const wrapper of [...entries.keys()]) if (!seen.has(wrapper)) unmount(wrapper)
    for (const host of doc.querySelectorAll(`[${HOST}]`)) {
      const owned = [...entries.values()].some((entry) => entry.host === host)
      if (!owned) host.remove()
    }
    if (fresh.length) {
      for (const callID of fresh) askedUnknown.add(callID)
      options.unknown?.(fresh)
    }
  }

  const observer = new (doc.defaultView as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver((mutations) => {
    const ours = (node: Node) => node instanceof Element && (node.hasAttribute(HOST) || node.hasAttribute(OVERLAY))
    if (mutations.every((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].every(ours))) return
    request()
  })

  function request() {
    if (pending || disposed) return
    pending = true
    schedule(run)
  }

  /** Forget that an id had no page, so the next scan asks again. */
  function recheck(callIDs?: Iterable<string>) {
    if (callIDs) for (const callID of callIDs) askedUnknown.delete(callID)
    else askedUnknown.clear()
    request()
  }

  for (const stale of doc.querySelectorAll(`[${HOST}],[${OVERLAY}]`)) stale.remove()
  observer.observe(doc.body, { childList: true, subtree: true })
  request()

  return {
    scan: request,
    recheck,
    /** Applies a changed theme to every live page. */
    refreshTheme() {
      const next = options.theme()
      const id = themeKey(next)
      if (id === themeId) return
      theme = next
      themeId = id
      for (const view of views()) post(view, { type: "theme", mode: theme.mode, vars: theme.vars })
    },
    count: () => entries.size,
    dispose() {
      disposed = true
      observer.disconnect()
      doc.defaultView?.removeEventListener("message", onMessage)
      closeOverlay()
      for (const wrapper of [...entries.keys()]) unmount(wrapper)
      for (const stale of doc.querySelectorAll(`[${HOST}],[${OVERLAY}]`)) stale.remove()
      entries.clear()
    },
  }
}
