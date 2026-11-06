// Binds the swipe machine to the sidebar's wheel events. Two-finger horizontal swipes change space; past the last space
// the strip's plus is revealed and filled. Every other wheel is left to the host.

import { idleSwipe, release, swipe, type SwipeState } from "./swipe"

export interface WheelHandlers {
  /** The sidebar is showing a space and could switch: only then are horizontal wheels ours. */
  ready(): boolean
  atEnd(): boolean
  switchTo(direction: 1 | -1): void
  create(): void
  reveal(on: boolean): void
  progress(offset: number): void
  /** A short class on the sidebar for the list's slide-in; `direction` names the side. */
  animate(direction: "next" | "previous"): void
}

export function bindWheel(doc: Document, handlers: WheelHandlers) {
  let state: SwipeState = idleSwipe()
  let idle: ReturnType<typeof setTimeout> | undefined

  const end = () => {
    if (idle !== undefined) clearTimeout(idle)
    idle = undefined
    state = release(state)
    handlers.reveal(false)
    handlers.progress(0)
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
    if (step.action.type === "none") return
    // Horizontal travel is ours: stop the host from scrolling sideways with it.
    event.preventDefault()
    if (step.action.type === "progress") {
      handlers.progress(step.action.offset)
      handlers.reveal(step.action.revealed)
    } else if (step.action.type === "switch") {
      handlers.reveal(false)
      handlers.progress(0)
      handlers.switchTo(step.action.direction)
    } else {
      handlers.reveal(false)
      handlers.progress(0)
      handlers.create()
    }
    if (idle !== undefined) clearTimeout(idle)
    idle = setTimeout(end, 200)
  }

  // Bound on the document, because the sidebar is mounted late and may be replaced; the target check keeps it to the
  // sidebar's own area.
  doc.addEventListener("wheel", onWheel, { passive: false })
  return {
    stop() {
      doc.removeEventListener("wheel", onWheel)
      if (idle !== undefined) clearTimeout(idle)
      handlers.reveal(false)
      handlers.progress(0)
    },
  }
}
