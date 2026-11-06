// Binds the swipe machine to the sidebar's wheel events. Two-finger horizontal swipes change space; past the last space
// the strip's plus is revealed and filled. Every other wheel is left to the host.

import { idleSwipe, release, swipe, type SwipeState } from "./swipe"

export interface WheelHandlers {
  /** The sidebar is showing a space and could switch: only then are horizontal wheels ours. */
  ready(): boolean
  atEnd(): boolean
  switchTo(direction: 1 | -1): void
  create(): void
  /** 0..1: how far the new-space slot has been pulled open. */
  pull(value: number): void
}

export function bindWheel(doc: Document, handlers: WheelHandlers) {
  let state: SwipeState = idleSwipe()
  let idle: ReturnType<typeof setTimeout> | undefined
  let pull = 0

  const end = () => {
    if (idle !== undefined) clearTimeout(idle)
    idle = undefined
    const armed = pull >= 1
    state = release(state)
    pull = 0
    handlers.pull(0)
    if (armed) handlers.create()
  }
  const onWheel = (event: WheelEvent) => {
    if (!handlers.ready()) return
    // Only over the sidebar, and never over a text field or a menu.
    const target = event.target as HTMLElement | null
    if (!target?.closest?.('[data-slot="vertical-tabs-sidebar"]')) return
    if (event.ctrlKey || target.closest("input, textarea, [contenteditable=true], [role=menu]")) return
    const atEnd = handlers.atEnd()
    const step = swipe(state, { dx: event.deltaX, dy: event.deltaY, at: Date.now() }, { atEnd })
    state = step.state
    // Every event keeps the gesture alive, including the ones the latch swallows; otherwise a slow swipe outlives the
    // idle timer and re-arms half way through.
    if (idle !== undefined) clearTimeout(idle)
    idle = setTimeout(end, 320)
    if (step.action.type === "none") return
    // Horizontal travel is ours: stop the host from scrolling sideways with it.
    event.preventDefault()
    if (step.action.type === "progress") {
      pull = step.action.pull
      handlers.pull(pull)
    } else if (step.action.type === "switch") {
      pull = 0
      handlers.pull(0)
      handlers.switchTo(step.action.direction)
    }
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
