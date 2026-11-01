import { buildDocument, csp, parseFrameMessage, sandbox, themeKey, zoomSteps, type Theme } from "./frame"

export type Surface = "inline" | "overlay" | "panel"

export interface View {
  /** Unique per frame; the page signs its messages with it. */
  id: string
  /** The artifact (or tool call) the frame shows; zoom and height are shared by group. */
  group: string
  surface: Surface
  frame: HTMLIFrameElement
  /** Waiting for the page's bridge to announce itself after a load; set while a load is unanswered. */
  unanswered?: ReturnType<typeof setTimeout>
  /** Set once the frame loaded a document that is not ours; it shows `blockedDocument` instead. */
  blocked: boolean
}

export interface FramesOptions {
  doc: Document
  theme: () => Theme
  /** Asks the user, in the app's own dialog, then opens the link in their browser. Resolves true only if they confirmed. */
  open: (url: string) => Promise<boolean>
  now?: () => number
  /** A real user input happened in the window in the last few seconds (`navigator.userActivation.isActive`). */
  activation?: () => boolean
  /** How long a loaded frame may take to announce itself before it is taken for a foreign document. */
  readyWait?: number
}

/** After a link question is settled, a page cannot cause another for this long; each decline triples it (cap: 5 doublings). */
export const openInterval = 3000

const blockedDocument = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'"><body style="margin:12px;font:13px system-ui;color:#888">This page tried to navigate away and was stopped.`

/**
 * Owns every live page frame (inline cards, the expanded overlay, panel tabs): builds them with the sandbox and CSP,
 * routes their messages, pushes theme and zoom, and enforces the two rules a hostile page must not be able to break:
 * a frame that navigates is replaced, and a link opens only right after a real user input while the frame holds focus.
 */
export function createFrames(options: FramesOptions) {
  const { doc } = options
  const now = options.now ?? (() => Date.now())
  const activation = options.activation ?? (() => doc.defaultView?.navigator.userActivation?.isActive === true)
  const views = new Map<string, View>()
  const heights = new Map<string, number>()
  const zooms = new Map<string, number>()
  let theme = options.theme()
  let themeId = themeKey(theme)
  let counter = 0
  const readyWait = options.readyWait ?? 1000
  let asking = false
  /** Per artifact, so a page that keeps asking only ever slows itself down. */
  const pauses = new Map<string, { declines: number; last: number }>()
  let disposed = false

  const post = (view: View, message: Record<string, unknown>) => view.frame.contentWindow?.postMessage({ vr: view.id, ...message }, "*")

  function sync(view: View) {
    post(view, { type: "theme", mode: theme.mode, vars: theme.vars })
    post(view, { type: "zoom", value: zooms.get(view.group) ?? 1 })
  }

  function onMessage(event: MessageEvent) {
    if (disposed) return
    const view = [...views.values()].find((item) => item.frame.contentWindow && item.frame.contentWindow === event.source)
    if (!view || view.blocked) return
    const message = parseFrameMessage(event.data, view.id)
    if (!message) return
    if (message.type === "ready") {
      clearTimeout(view.unanswered)
      view.unanswered = undefined
      return sync(view)
    }
    if (message.type === "height") {
      if (view.surface !== "inline") return
      if (Math.abs((heights.get(view.group) ?? 0) - message.height) < 2) return
      heights.set(view.group, message.height)
      for (const item of views.values()) if (item.group === view.group && item.surface === "inline") item.frame.style.height = `${message.height}px`
      return
    }
    // A page can claim anything, so no signal from it or about its focus proves intent. Only a click on the app's own
    // confirmation proves it; what the page controls is how rarely it may ask: after a real user input, one question
    // at a time, with a pause once answered.
    const pause = pauses.get(view.group) ?? { declines: 0, last: Number.NEGATIVE_INFINITY }
    if (!activation() || asking || now() - pause.last < openInterval * 3 ** Math.min(pause.declines, 5)) return
    asking = true
    void options
      .open(message.url)
      .catch(() => false)
      .then((opened) => {
        pauses.set(view.group, { declines: opened ? 0 : pause.declines + 1, last: now() })
      })
      .finally(() => {
        asking = false
      })
  }
  doc.defaultView?.addEventListener("message", onMessage)

  function load(view: View, html: string) {
    clearTimeout(view.unanswered)
    view.unanswered = undefined
    view.blocked = false
    view.frame.srcdoc = buildDocument({ id: view.id, html, theme })
  }

  function create(input: { group: string; html: string; surface: Surface; title: string }): View {
    const frame = doc.createElement("iframe")
    frame.setAttribute("sandbox", sandbox)
    frame.setAttribute("csp", csp)
    frame.setAttribute("referrerpolicy", "no-referrer")
    frame.setAttribute("loading", "eager")
    frame.setAttribute("data-visual-reply-frame", input.surface)
    frame.title = input.title
    const view: View = { id: `vr${++counter}`, group: input.group, surface: input.surface, frame, blocked: false }
    if (input.surface === "inline") frame.style.height = `${heights.get(input.group) ?? 240}px`
    frame.addEventListener("load", () => {
      if (view.blocked) return
      // Every document of ours announces itself on load, so a reload the DOM causes (a moved row) is answered at once.
      // A load nothing answers is a document that is not ours: the page navigated itself away (the bridge and the main
      // process stop that; this is the backstop), so the frame is replaced rather than left on screen.
      clearTimeout(view.unanswered)
      view.unanswered = setTimeout(() => {
        view.unanswered = undefined
        if (!views.has(view.id)) return
        view.blocked = true
        frame.srcdoc = blockedDocument
      }, readyWait)
    })
    views.set(view.id, view)
    load(view, input.html)
    return view
  }

  function setZoom(group: string, next: number) {
    const value = Math.min(zoomSteps.at(-1)!, Math.max(zoomSteps[0], next))
    zooms.set(group, value)
    for (const view of views.values()) if (view.group === group) post(view, { type: "zoom", value })
  }

  return {
    create,
    /** Shows new HTML in an existing frame, e.g. after the artifact was updated. */
    reload: (view: View, html: string) => load(view, html),
    retire(view: View) {
      clearTimeout(view.unanswered)
      views.delete(view.id)
      view.frame.remove()
    },
    zoomStep(group: string, direction: 1 | -1) {
      const current = zooms.get(group) ?? 1
      const index = zoomSteps.findIndex((step) => step >= current - 1e-9)
      setZoom(group, zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, index + direction))]!)
    },
    zoomReset: (group: string) => setZoom(group, 1),
    /** Applies the app's current theme to every live page. */
    refreshTheme() {
      const next = options.theme()
      const id = themeKey(next)
      if (id === themeId) return
      theme = next
      themeId = id
      for (const view of views.values()) post(view, { type: "theme", mode: theme.mode, vars: theme.vars })
    },
    count: () => views.size,
    dispose() {
      disposed = true
      doc.defaultView?.removeEventListener("message", onMessage)
      for (const view of [...views.values()]) {
        clearTimeout(view.unanswered)
        views.delete(view.id)
        view.frame.remove()
      }
    },
  }
}

export type Frames = ReturnType<typeof createFrames>
