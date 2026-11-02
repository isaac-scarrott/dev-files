/** The window's width, and its inset from the chat card's end edge (the card reserves both, so the chat ends where the window starts). */
export const DOCK_WIDTH = 288
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

/** The attribute whose rules reserve the window's width on the chat card. */
export const PAD = "data-agents-pad"

/**
 * The host keeps one chat card and swaps sessions in it, so every session's toggle resolves the same element while the
 * entering and the leaving toggle exist at once, in whichever order their effects run. A toggle that owned the attribute
 * alone would strip what the other one just wrote. So the card carries the attribute while ANY toggle holds a claim on
 * it, and a toggle only ever changes its own claim.
 */
const claims = new WeakMap<Element, Map<object, number>>()
const inset = (card: Element) => Math.max(0, ...(claims.get(card)?.values() ?? []))

/** Sets `owner`'s claim (0 drops it). Returns the card's end padding before and after, and the write, so the caller can start its glide first. */
export function claimPad(card: Element, owner: object, px: number) {
  const held = claims.get(card) ?? new Map<object, number>()
  claims.set(card, held)
  const before = inset(card)
  if (px > 0) held.set(owner, px)
  else held.delete(owner)
  const after = inset(card)
  return { before, after, write: () => card.toggleAttribute(PAD, after > 0) }
}
