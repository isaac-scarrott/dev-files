// The bottom strip of the sidebar: one dot per space, and a way to add one. It is one injected row inside the sidebar's
// own flex column, above its footer, so it follows every collapse, resize and layout change the host makes. Nothing else
// is tinted or moved (see DESIGN.md).

export const STRIP = "data-spaces-strip"
export const DOT = "data-spaces-dot"
export const GHOST = "data-spaces-ghost"
const TRACK = "data-spaces-track"

export interface StripSpace {
  id: string
  name: string
  emoji: string
  accent?: string
}

export interface StripHandlers {
  select(index: number): void
  /** A dot was dragged from one slot to another. */
  reorder(from: number, to: number): void
}

export interface Strip {
  /** Moves the strip back where it belongs, creating it on first use. False when the sidebar is not there. */
  place(): boolean
  /** Draws the spaces. With fewer than two the strip takes no room and shows nothing. */
  update(spaces: readonly StripSpace[], active: number): void
  /** The new-space slot, 0..1: how far a pull has filled it. 0 hides it entirely. */
  pull(value: number): void
  /** The strip is wanted by this layout: false hides it without forgetting the element. */
  enabled(on: boolean): void
  dispose(): void
}

const column = (doc: Document): HTMLElement | undefined => {
  const mount = doc.querySelector<HTMLElement>('[data-slot="vertical-tabs-mount"]')
  const first = mount?.firstElementChild
  return first instanceof doc.defaultView!.HTMLElement ? first : undefined
}

export function createStrip(doc: Document, handlers: StripHandlers, css: (space: StripSpace) => string | undefined): Strip {
  let element: HTMLElement | undefined
  let shown = true
  let spaces: readonly StripSpace[] = []
  let active = 0
  let fill = 0
  /** How far a press must travel before it is a drag rather than a click. */
  const DRAG = 4

  const draw = () => {
    if (!element) return
    const visible = shown && spaces.length >= 2
    element.toggleAttribute("data-spaces-empty", !visible)
    const track = element.querySelector<HTMLElement>(`[${TRACK}]`)
    const ghost = element.querySelector<HTMLElement>(`[${GHOST}]`)
    if (!track || !ghost) return
    ghost.style.setProperty("--spaces-pull", String(fill))
    ghost.toggleAttribute("data-spaces-armed", fill >= 1)
    track.replaceChildren(
      ...spaces.map((space, index) => {
        const dot = doc.createElement("button")
        dot.type = "button"
        dot.setAttribute(DOT, space.id)
        dot.setAttribute("role", "tab")
        dot.textContent = space.emoji
        dot.setAttribute("aria-label", space.name)
        dot.setAttribute("aria-selected", String(index === active))
        dot.setAttribute("title", space.name)
        dot.classList.toggle("spaces-dot-active", index === active)
        const accent = css(space)
        if (accent) dot.style.setProperty("--spaces-accent", accent)
        dot.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          // A drag ends with a click too; suppress that one so dropping a dot does not also switch space.
          if (dot.hasAttribute("data-spaces-dragged")) {
            dot.removeAttribute("data-spaces-dragged")
            return
          }
          handlers.select(index)
        })
        attachDrag(dot, index)
        return dot
      }),
      ghost,
    )
    ghost.hidden = !visible || fill <= 0
  }

  /** Drag a dot sideways to move its space. The dot follows the pointer and the dots it passes slide across to make
   * room, so the row shows the order you are choosing while you drag; letting go asks for exactly that order. */
  const attachDrag = (dot: HTMLElement, index: number) => {
    dot.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return
      const startX = event.clientX
      const startIndex = index
      const row = [...doc.querySelectorAll<HTMLElement>(`[${DOT}]`)]
      let moved = false
      let target = startIndex
      dot.setPointerCapture?.(event.pointerId)
      // One slot's width, read before anything moves: the distance between two dots, or the dot's own size when nothing
      // has been laid out yet.
      const slot = () => {
        const [first, second] = row
        if (!first || !second) return 24
        const step = second.getBoundingClientRect().x - first.getBoundingClientRect().x
        return step >= 12 ? step : 24
      }
      const step = slot()
      const onMove = (move: PointerEvent) => {
        const dx = move.clientX - startX
        if (!moved && Math.abs(dx) < DRAG) return
        if (!moved) {
          moved = true
          stripElement()?.setAttribute("data-spaces-dragging", "")
          dot.classList.add("spaces-dot-dragging")
        }
        target = Math.max(0, Math.min(startIndex + Math.round(dx / step), row.length - 1))
        dot.style.transform = `translateX(${dx}px)`
        dot.style.zIndex = "1"
        // Every dot the dragged one has passed takes the slot it left, so the row opens where it will land.
        for (const [position, item] of row.entries()) {
          if (item === dot) continue
          const shift =
            position > startIndex && position <= target ? -step :
            position < startIndex && position >= target ? step : 0
          item.style.transform = shift === 0 ? "" : `translateX(${shift}px)`
        }
      }
      const finish = (up: PointerEvent | undefined) => {
        dot.removeEventListener("pointermove", onMove)
        dot.removeEventListener("pointerup", finish)
        dot.removeEventListener("pointercancel", cancel)
        stripElement()?.removeAttribute("data-spaces-dragging")
        dot.classList.remove("spaces-dot-dragging")
        dot.style.transform = ""
        dot.style.zIndex = ""
        for (const item of row) item.style.transform = ""
        if (!moved) return
        dot.setAttribute("data-spaces-dragged", "")
        if (!up) return
        // The pointer's last word decides the slot, in case it came to rest a shade past the last move event.
        const to = Math.max(0, Math.min(startIndex + Math.round((up.clientX - startX) / step), row.length - 1))
        if (to !== startIndex) handlers.reorder(startIndex, to)
      }
      const cancel = () => finish(undefined)
      dot.addEventListener("pointermove", onMove)
      dot.addEventListener("pointerup", finish)
      dot.addEventListener("pointercancel", cancel)
    })
  }

  const stripElement = () => doc.querySelector<HTMLElement>(`[${STRIP}]`)

  const build = () => {
    const strip = doc.createElement("div")
    strip.setAttribute(STRIP, "")
    strip.setAttribute("role", "tablist")
    strip.setAttribute("aria-label", "Spaces")
    const track = doc.createElement("div")
    track.setAttribute(TRACK, "")
    // The slot the new space would take: invisible until a pull opens it, so nothing invites a click and nothing is
    // added to the strip on hover.
    const ghost = doc.createElement("div")
    ghost.setAttribute(GHOST, "")
    ghost.setAttribute("aria-hidden", "true")
    ghost.textContent = "+"
    track.append(ghost)
    strip.replaceChildren(track)
    return strip
  }

  return {
    place() {
      const parent = column(doc)
      const footer = parent?.querySelector<HTMLElement>('[data-slot="vertical-tabs-footer"]')
      if (!parent) {
        element?.remove()
        return false
      }
      if (!element) element = build()
      if (element.parentElement !== parent || (footer && element.nextElementSibling !== footer)) {
        parent.insertBefore(element, footer ?? null)
      }
      draw()
      return true
    },
    update(next, nextActive) {
      spaces = next
      active = Math.max(0, Math.min(nextActive, Math.max(0, next.length - 1)))
      draw()
    },
    pull(value) {
      const next = Math.max(0, Math.min(1, value))
      if (next === fill) return
      fill = next
      draw()
    },
    enabled(on) {
      shown = on
      if (!on) element?.remove()
      else this.place()
      draw()
    },
    dispose() {
      element?.remove()
      element = undefined
    },
  }
}
