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
 * from the persisted `appearance.sidebarOpen` (app/src/shell/shell.tsx 2.2.5); a hover peek adds `data-peek` and keeps
 * `data-state="closed"`. Anything but "open" counts as closed, so a value the host adds later does not read as popover mode.
 * "none" is no aside, or one without the attribute: top tabs or the narrow mobile layout, which behave like an open sidebar.
 */
export const readSidebar = (root: ParentNode = document): Sidebar => {
  const state = root.querySelector(SIDEBAR)?.getAttribute("data-state")
  return state === null || state === undefined ? "none" : state === "open" ? "open" : "closed"
}

/** Reactive left-sidebar state. One observer, filtered to `data-state` and coalesced into a frame. */
export function createSidebar() {
  const [sidebar, setSidebar] = createSignal(readSidebar())
  let pending = false
  let frame = 0
  const observer = new MutationObserver(() => {
    if (pending) return
    pending = true
    frame = requestAnimationFrame(() => {
      pending = false
      setSidebar(readSidebar())
    })
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
  onCleanup(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  })
  return sidebar
}

/** The window exists only while the sidebar is closed; with it open (or top tabs) the button opens the popover. */
export function dockState(input: { enabled: boolean; sidebar: Sidebar; visible: boolean }) {
  const docked = input.enabled && input.sidebar === "closed"
  return { docked, shown: docked && input.visible, inset: docked && input.visible ? DOCK_WIDTH + DOCK_INSET : 0 }
}
