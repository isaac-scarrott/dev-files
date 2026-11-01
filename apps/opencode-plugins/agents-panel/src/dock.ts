import { createSignal, onCleanup } from "solid-js"

/** The window's width, and its inset from the chat card's end edge (the card reserves both, so the chat ends where the window starts). */
export const DOCK_WIDTH = 320
export const DOCK_INSET = 8

const CARD = "[data-slot=session-chat-panel]"

/** The chat card: the rounded surface holding header, timeline and composer, the first child of the chat panel. */
export const chatCard = (from: Element) => from.closest(CARD)?.firstElementChild ?? undefined

const SIDEBAR = "[data-slot=vertical-tabs-sidebar]"

export type Sidebar = "open" | "closed" | "none"

/**
 * The host has no API for the left tab sidebar (`layout.side` is the right region). Its shell renders, in the Side-tabs
 * layout only, `<aside id="vertical-tabs-sidebar" data-slot="vertical-tabs-sidebar" data-state={open ? "open" : "closed"}>`
 * from the persisted `appearance.sidebarOpen` (app/src/shell/shell.tsx 2.2.5), and animates its inline width to 0; a hover
 * peek adds `data-peek` and keeps `closed`. Closed means what the user sees: the attribute says so, OR the aside takes no
 * room (zero width, hidden, or entirely off-screen), whatever the attribute reads. "none" is no aside or one without the
 * attribute: top tabs or the narrow mobile layout, which behave like an open sidebar.
 */
export function readSidebarFacts(root: ParentNode = document) {
  const aside = root.querySelector(SIDEBAR)
  if (!aside) return { sidebar: "none" as Sidebar, width: undefined as number | undefined }
  const state = aside.getAttribute("data-state")
  if (state === null) return { sidebar: "none" as Sidebar, width: undefined }
  const rect = aside.getBoundingClientRect()
  const style = aside.ownerDocument.defaultView?.getComputedStyle(aside)
  const invisible = !!style && (style.display === "none" || style.visibility === "hidden")
  // Rect rules apply only once the aside has a layout box (no environment without layout reads as closed).
  const laidOut = rect.height > 0
  const offscreen = laidOut && rect.right <= 0
  const empty = laidOut && rect.width < 1
  // A just-opened aside is at width 0 for the first frames of its animation; the width observer re-reads as it grows.
  const closed = state !== "open" || invisible || offscreen || empty
  return { sidebar: (closed ? "closed" : "open") as Sidebar, width: Math.round(rect.width) }
}

export const readSidebar = (root: ParentNode = document): Sidebar => readSidebarFacts(root).sidebar

/** Reactive left-sidebar state and the aside's width. One MutationObserver on `data-state`/`style`/`data-peek` and one ResizeObserver on the aside, coalesced into a frame. */
export function createSidebar() {
  const initial = readSidebarFacts()
  const [facts, setFacts] = createSignal(initial, { equals: (a, b) => a.sidebar === b.sidebar && a.width === b.width })
  let pending = false
  let frame = 0
  let watched: Element | null = null
  const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => schedule())
  const read = () => {
    pending = false
    const aside = document.querySelector(SIDEBAR)
    if (aside !== watched) {
      if (watched) resize?.unobserve(watched)
      watched = aside
      if (aside) resize?.observe(aside)
    }
    setFacts(readSidebarFacts())
  }
  const schedule = () => {
    if (pending) return
    pending = true
    frame = requestAnimationFrame(read)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "style", "class"] })
  read()
  onCleanup(() => {
    observer.disconnect()
    resize?.disconnect()
    cancelAnimationFrame(frame)
  })
  return { sidebar: () => facts().sidebar, width: () => facts().width }
}

/** The window exists only while the sidebar is closed; with it open (or top tabs) the button opens the popover. */
export function dockState(input: { enabled: boolean; sidebar: Sidebar; visible: boolean }) {
  const docked = input.enabled && input.sidebar === "closed"
  return { docked, shown: docked && input.visible, inset: docked && input.visible ? DOCK_WIDTH + DOCK_INSET : 0 }
}
