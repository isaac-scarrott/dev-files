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
          handlers.select(index)
        })
        return dot
      }),
      ghost,
    )
    ghost.hidden = !visible || fill <= 0
  }

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
