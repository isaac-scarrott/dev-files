import { createSignal, onCleanup } from "solid-js"

/** The window's width, and its inset from the chat card's end edge (the card reserves both, so the chat ends where the window starts). */
export const DOCK_WIDTH = 320
export const DOCK_INSET = 8

const CARD = "[data-slot=session-chat-panel]"

/** The chat card: the rounded surface holding header, timeline and composer, the first child of the chat panel. */
export const chatCard = (from: Element) => from.closest(CARD)?.firstElementChild ?? undefined

const SIDEBAR = "[data-slot=vertical-tabs-sidebar]"

export type Sidebar = "open" | "closed" | "none"

/** The host has no API for the left tab sidebar (`layout.side` is the right region): its aside carries the state. "none" is top-tabs layout (no aside), which behaves like an open sidebar: popover only. */
export const readSidebar = (root: ParentNode = document): Sidebar => {
  const state = root.querySelector(SIDEBAR)?.getAttribute("data-state")
  return state === "open" ? "open" : state === "closed" ? "closed" : "none"
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
