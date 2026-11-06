// Binds the swipe machine to the sidebar's wheel events. Two-finger horizontal swipes change space; past the last space
// the strip's plus is revealed and filled. Every other wheel is left to the host.

import { GESTURE_GAP, idleSwipe, release, swipe, type SwipeState } from "./swipe"

export interface WheelHandlers {
  /** The sidebar is showing a space and could switch: only then are horizontal wheels ours. */
  ready(): boolean
  atEnd(): boolean
  switchTo(direction: 1 | -1): void
  create(): void
  /** 0..1: how far the new-space slot has been pulled open. */
  pull(value: number): void
}

/** `WheelEvent.momentum` (Chromium 151+), or nothing on an engine without it, so the machine reads the stream instead. */
const momentum = (event: WheelEvent): boolean | undefined => (event as WheelEvent & { momentum?: boolean }).momentum

export function bindWheel(doc: Document, handlers: WheelHandlers) {
  let state: SwipeState = idleSwipe()
  let idle: ReturnType<typeof setTimeout> | undefined

  // Nothing has arrived for a while: the slot's fill falls back, and a full one creates.
  const end = () => {
    idle = undefined
    const step = release(state)
    state = step.state
    handlers.pull(0)
    if (step.create) handlers.create()
  }
  const onWheel = (event: WheelEvent) => {
    if (!handlers.ready()) return
    // Only over the sidebar, and never over a text field or a menu.
    const target = event.target as HTMLElement | null
    if (!target?.closest?.('[data-slot="vertical-tabs-sidebar"]')) return
    if (event.ctrlKey || target.closest("input, textarea, [contenteditable=true], [role=menu]")) return
    const atEnd = handlers.atEnd()
    // The event's own time, not the handler's: a switch re-renders the sidebar, and the tail queued behind that work
    // would otherwise arrive looking like a pause and a fresh gesture.
    const step = swipe(state, { dx: event.deltaX, dy: event.deltaY, at: event.timeStamp, momentum: momentum(event) }, { atEnd })
    state = step.state
    if (step.action.type !== "none") {
      // Horizontal travel is ours: stop the host from scrolling sideways with it.
      event.preventDefault()
      if (step.action.type === "progress") handlers.pull(step.action.pull)
      else if (step.action.type === "switch") {
        handlers.pull(0)
        handlers.switchTo(step.action.direction)
      }
    }
    // The same pause the machine treats as the end of a gesture lets go of the slot. Timed from after the switch's work.
    if (idle !== undefined) clearTimeout(idle)
    idle = setTimeout(end, GESTURE_GAP)
  }

  // Bound on the document, because the sidebar is mounted late and may be replaced; the target check keeps it to the
  // sidebar's own area.
  doc.addEventListener("wheel", onWheel, { passive: false })
  return {
    stop() {
      doc.removeEventListener("wheel", onWheel)
      if (idle !== undefined) clearTimeout(idle)
      handlers.pull(0)
    },
  }
}
