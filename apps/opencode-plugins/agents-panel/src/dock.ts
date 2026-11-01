import { createSignal, onCleanup } from "solid-js"

/** The window's width, and its inset from the chat card's end edge (the card reserves both, so the chat ends where the window starts). */
export const DOCK_WIDTH = 320
export const DOCK_INSET = 8

const CARD = "[data-slot=session-chat-panel]"

/** The chat card: the rounded surface holding header, timeline and composer, the first child of the chat panel. */
export const chatCard = (from: Element) => from.closest(CARD)?.firstElementChild ?? undefined

const SIDEBAR = "[data-slot=vertical-tabs-sidebar]"

/** The host has no API for the left tab sidebar (`layout.side` is the right region): its aside carries the state. Absent in top-tabs layout, which counts as closed. */
export const readSidebarOpen = (root: ParentNode = document) =>
  root.querySelector(SIDEBAR)?.getAttribute("data-state") === "open"

/** Reactive left-sidebar state. One observer, filtered to `data-state` and coalesced into a frame. */
export function createSidebarOpen() {
  const [open, setOpen] = createSignal(readSidebarOpen())
  let pending = false
  let frame = 0
  const observer = new MutationObserver(() => {
    if (pending) return
    pending = true
    frame = requestAnimationFrame(() => {
      pending = false
      setOpen(readSidebarOpen())
    })
  })
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
  onCleanup(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  })
  return open
}

/** What the header button does, and whether the floating window is on screen. */
export function dockState(input: { enabled: boolean; sidebarOpen: boolean; visible: boolean }) {
  const docked = input.enabled && input.sidebarOpen
  return { docked, shown: docked && input.visible, inset: docked && input.visible ? DOCK_WIDTH + DOCK_INSET : 0 }
}
