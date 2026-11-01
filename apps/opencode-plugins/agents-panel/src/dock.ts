/** The window's width, and its inset from the chat card's end edge (the card reserves both, so the chat ends where the window starts). */
export const DOCK_WIDTH = 320
export const DOCK_INSET = 8

const CARD = "[data-slot=session-chat-panel]"

/** The chat card: the rounded surface holding header, timeline and composer, the first child of the chat panel. */
export const chatCard = (from: Element) => from.closest(CARD)?.firstElementChild ?? undefined

/**
 * The window docks only while the session's right side region (review, files, browser, terminal...) is closed; with it
 * open the button opens the popover. `ctx.layout.side.opened(session)` is the host's own reactive answer (shell tab has a
 * "side" region). A window too narrow to hold the chat beside the window also counts as popover mode.
 */
export function dockState(input: { enabled: boolean; sideOpen: boolean; narrow: boolean; visible: boolean }) {
  const docked = input.enabled && !input.sideOpen && !input.narrow
  return { docked, shown: docked && input.visible, inset: docked && input.visible ? DOCK_WIDTH + DOCK_INSET : 0 }
}
