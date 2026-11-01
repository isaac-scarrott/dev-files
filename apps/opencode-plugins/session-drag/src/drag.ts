import { isTabRow, rowFromTarget, rowLink, rowTitle, token, type SessionTarget } from "./reference"

/** dnd-kit's PointerSensor activation distance in the host's tab strip (`tab-strip.tsx`). */
export const THRESHOLD = 4

/** The host's file-row drag image sits at `setDragImage(image, 0, 12)` (`gui-plugins/src/file/drag.ts`). */
export const GHOST_OFFSET = { x: 0, y: 12 }

/** The host's file-row drag image classes, so the ghost is the chip the app already draws. */
export const GHOST_CLASS =
  "flex items-center gap-x-2 px-2 py-1 bg-surface-raised-base rounded-md border border-v2-border-border-base text-12-regular text-text-strong"

/** Set on the root while the host's dropzone overlay shows our wording (see `styles.ts`). */
export const LABEL_ATTR = "data-session-drag-label"

/** The overlay fades out over 200ms (`transition-opacity duration-200`); the wording must not flip back mid-fade. */
export const LABEL_HOLD = 200

export type DragHost = {
  /** The session a row names, or undefined for a row that is not a session. */
  resolve(row: HTMLElement): SessionTarget | undefined
  /** Puts the reference into the composer. */
  drop(target: SessionTarget): void
  /** Elements that take a drop: the session panels the host's own dropzone overlay covers. */
  dropzones(): readonly Element[]
  /** Renders the chip icon into the ghost; returns its disposer. */
  icon(into: HTMLElement): () => void
}

type Pending = {
  row: HTMLElement
  target: SessionTarget
  x: number
  y: number
  pointerId: number
  /** The host's navigate-on-mousedown, held back until the gesture is known not to be a reference drag. */
  replay?: MouseEventInit
}

type Dragging = { target: SessionTarget; pointerId: number; ghost: HTMLElement; dispose: () => void }

export function buildGhost(doc: Document, title: string) {
  const ghost = doc.createElement("div")
  ghost.setAttribute("data-session-drag-ghost", "")
  ghost.setAttribute("aria-hidden", "true")
  ghost.dataset.state = "enter"
  ghost.className = GHOST_CLASS
  const icon = doc.createElement("span")
  icon.dataset.slot = "session-drag-ghost-icon"
  icon.className = "flex size-4 shrink-0 items-center justify-center"
  const text = doc.createElement("span")
  text.dataset.slot = "session-drag-ghost-title"
  text.className = "truncate"
  text.textContent = title
  ghost.append(icon, text)

  return { ghost, icon }
}

const within = (element: Element, x: number, y: number) => {
  const rect = element.getBoundingClientRect()

  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/**
 * Lets a sidebar session row be dragged sideways into the session panel. Listens at window capture, ahead of the
 * host: a press on a row holds back the host's navigate-on-mousedown until the gesture turns out vertical (dnd-kit's
 * reorder, which then proceeds untouched) or ends without moving, so a sideways drag never switches sessions first.
 */
export function installSessionDrag(host: DragHost, win: Window & typeof globalThis = window): () => void {
  const doc = win.document
  const replayed = new WeakSet<Event>()
  let pending: Pending | undefined
  let dragging: Dragging | undefined
  let suppressClick = false
  let labelTimer: number | undefined

  const showLabel = () => {
    win.clearTimeout(labelTimer)
    labelTimer = undefined
    doc.documentElement.setAttribute(LABEL_ATTR, "")
  }

  const hideLabel = (hold: number) => {
    win.clearTimeout(labelTimer)
    labelTimer = undefined

    if (!hold) return doc.documentElement.removeAttribute(LABEL_ATTR)
    labelTimer = win.setTimeout(() => doc.documentElement.removeAttribute(LABEL_ATTR), hold)
  }

  const signal = (type: "dragover" | "dragleave", target?: SessionTarget) => {
    const data = typeof win.DataTransfer === "function" ? new win.DataTransfer() : null

    if (data && target) data.setData("text/plain", token(target.id))
    const init: DragEventInit = { bubbles: true, cancelable: true, dataTransfer: data }

    const event = typeof win.DragEvent === "function" ? new win.DragEvent(type, init) : new win.Event(type, init)

    // A DOM without constructible drag data still gets the payload the host reads.
    if ((event as DragEvent).dataTransfer !== data) Object.defineProperty(event, "dataTransfer", { value: data })
    doc.body.dispatchEvent(event)
  }

  const replay = () => {
    const init = pending?.replay

    if (!pending || !init) return
    pending.replay = undefined
    const event = new win.MouseEvent("mousedown", init)
    replayed.add(event)
    rowLink(pending.row).dispatchEvent(event)
  }

  const move = (x: number, y: number) => {
    if (dragging) dragging.ghost.style.transform = `translate3d(${x - GHOST_OFFSET.x}px, ${y - GHOST_OFFSET.y}px, 0)`
  }

  const begin = (from: Pending, x: number, y: number) => {
    pending = undefined
    const { ghost, icon } = buildGhost(doc, from.target.title || rowTitle(from.row))
    const dispose = host.icon(icon)
    doc.body.append(ghost)
    doc.documentElement.setAttribute("data-session-drag", "")
    showLabel()
    win.getSelection()?.removeAllRanges()
    dragging = { target: from.target, pointerId: from.pointerId, ghost, dispose }
    move(x, y)

    // The entrance transitions from a painted first frame; reduced motion keeps the fade and drops the scale (CSS).
    win.requestAnimationFrame(() => {
      if (dragging?.ghost === ghost) ghost.dataset.state = "active"
    })
    signal("dragover", from.target)
  }

  const finish = (kind: "drop" | "cancel") => {
    const current = dragging

    if (!current) return
    dragging = undefined
    doc.documentElement.removeAttribute("data-session-drag")
    hideLabel(LABEL_HOLD)
    signal("dragleave")
    const ghost = current.ghost

    const remove = () => {
      ghost.remove()
      current.dispose()
    }

    // A drop lands at once, as the host's own file drop does; a cancel fades the chip out.
    if (kind === "drop") return remove()
    ghost.dataset.state = "leave"
    ghost.addEventListener("transitionend", remove, { once: true })
    win.setTimeout(remove, 200)
  }

  const onPointerDown = (event: PointerEvent) => {
    suppressClick = false

    if (dragging || event.button !== 0 || !event.isPrimary) return
    const row = rowFromTarget(event.target)

    if (!row) return
    const target = host.resolve(row)

    if (!target) return
    pending = { row, target, x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }

  const onMouseDown = (event: MouseEvent) => {
    if (!pending || pending.replay || replayed.has(event) || event.button !== 0) return

    if (!isTabRow(pending.row) || !pending.row.contains(event.target as Node | null)) return
    event.stopPropagation()

    pending.replay = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: win,
      button: 0,
      buttons: 1,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (dragging) {
      if (event.pointerId !== dragging.pointerId) return
      event.stopPropagation()
      event.preventDefault()
      move(event.clientX, event.clientY)

      return
    }

    if (!pending || event.pointerId !== pending.pointerId) return
    const dx = event.clientX - pending.x
    const dy = event.clientY - pending.y

    if (Math.hypot(dx, dy) < THRESHOLD) return

    // Vertical: the host's reorder. It activates on this same event, after the navigation it expects to have seen.
    if (Math.abs(dx) <= Math.abs(dy)) {
      replay()
      pending = undefined

      return
    }
    event.stopPropagation()
    event.preventDefault()
    begin(pending, event.clientX, event.clientY)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (dragging) {
      if (event.pointerId !== dragging.pointerId) return
      const target = dragging.target
      const inside = host.dropzones().some((zone) => within(zone, event.clientX, event.clientY))
      finish(inside ? "drop" : "cancel")
      suppressClick = true

      if (inside) host.drop(target)

      return
    }

    if (!pending || event.pointerId !== pending.pointerId) return
    replay()
    pending = undefined
  }

  const onClick = (event: MouseEvent) => {
    if (!suppressClick) return
    suppressClick = false
    event.stopPropagation()
    event.preventDefault()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!dragging || event.key !== "Escape") return
    event.stopPropagation()
    event.preventDefault()
    finish("cancel")
    suppressClick = true
  }

  const cancel = () => {
    pending = undefined
    finish("cancel")
  }

  const capture = { capture: true }
  win.addEventListener("pointerdown", onPointerDown, capture)
  win.addEventListener("mousedown", onMouseDown, capture)
  win.addEventListener("pointermove", onPointerMove, capture)
  win.addEventListener("pointerup", onPointerUp, capture)
  win.addEventListener("pointercancel", cancel, capture)
  win.addEventListener("click", onClick, capture)
  win.addEventListener("keydown", onKeyDown, capture)
  win.addEventListener("blur", cancel)

  return () => {
    win.removeEventListener("pointerdown", onPointerDown, capture)
    win.removeEventListener("mousedown", onMouseDown, capture)
    win.removeEventListener("pointermove", onPointerMove, capture)
    win.removeEventListener("pointerup", onPointerUp, capture)
    win.removeEventListener("pointercancel", cancel, capture)
    win.removeEventListener("click", onClick, capture)
    win.removeEventListener("keydown", onKeyDown, capture)
    win.removeEventListener("blur", cancel)
    cancel()
    hideLabel(0)
  }
}
