import { nearestAbove, SCROLL_SLOT, snippet, userRows } from "./jump"

export function createJumpController(marker: HTMLElement, pill: HTMLButtonElement) {
  const document = marker.ownerDocument
  const window = document.defaultView!
  const text = pill.querySelector<HTMLElement>("[data-message-jump-text]")!
  let active = false
  let disposed = false
  let container: HTMLElement | undefined
  let target: HTMLElement | undefined
  let frame: number | undefined
  let entrance: number | undefined
  const mutations = new window.MutationObserver(() => schedule())
  const resize = new window.ResizeObserver(() => schedule())

  const hide = () => {
    target = undefined
    if (active && document.activeElement === pill) container?.focus({ preventScroll: true })
    pill.tabIndex = -1
    pill.setAttribute("aria-hidden", "true")
    pill.setAttribute("data-visible", "false")
    if (entrance !== undefined) window.cancelAnimationFrame(entrance)
    entrance = undefined
  }

  const bind = (next: HTMLElement | undefined) => {
    if (next === container) return
    mutations.disconnect()
    resize.disconnect()
    container = next
    if (!next) return
    mutations.observe(next, { subtree: true, childList: true, characterData: true })
    const content = next.querySelector<HTMLElement>("[data-timeline-virtual-content]")
    if (content) resize.observe(content)
    // Ancestor resizes include pane/sidebar geometry changes that leave the window unchanged.
    for (let node: HTMLElement | null = next; node; node = node.parentElement) resize.observe(node)
  }

  const evaluate = () => {
    frame = undefined
    if (!active || disposed) return
    const next = marker.isConnected ? marker.closest<HTMLElement>(SCROLL_SLOT) ?? undefined : undefined
    bind(next)
    const rect = next?.getBoundingClientRect()
    if (!next || !rect || rect.width <= 24 || rect.height <= 0) return hide()
    const row = nearestAbove(userRows(next), rect.top)
    const label = row ? snippet(row.element) : ""
    if (!row || !label) return hide()

    target = row.element
    if (text.textContent !== label) text.textContent = label
    if (pill.title !== label) pill.title = label
    const accessible = `Jump to your message: ${label}`
    if (pill.getAttribute("aria-label") !== accessible) pill.setAttribute("aria-label", accessible)
    pill.style.left = `${Math.round(rect.left + rect.width / 2)}px`
    pill.style.top = `${Math.round(rect.top + 10)}px`
    pill.style.maxWidth = `${Math.min(520, rect.width - 24)}px`
    pill.tabIndex = 0
    pill.removeAttribute("aria-hidden")

    if (!pill.isConnected) {
      document.body.append(pill)
      // Give the initial hidden style a painted frame before entering.
      entrance = window.requestAnimationFrame(() => {
        entrance = undefined
        if (active && target && !disposed) pill.setAttribute("data-visible", "true")
      })
    } else if (entrance === undefined) pill.setAttribute("data-visible", "true")
  }

  function schedule() {
    if (active && !disposed && frame === undefined) frame = window.requestAnimationFrame(evaluate)
  }

  const onScroll = (event: Event) => {
    if (event.target === container) schedule()
  }
  const onClick = () => {
    if (!active || !target?.isConnected || !container?.contains(target)) return hide()
    target.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    })
    hide()
  }

  hide()
  pill.addEventListener("click", onClick)

  return {
    setActive(value: boolean) {
      if (active === value || disposed) return
      active = value
      if (value) {
        document.addEventListener("scroll", onScroll, { capture: true, passive: true })
        window.addEventListener("resize", schedule)
        schedule()
      } else {
        document.removeEventListener("scroll", onScroll, { capture: true })
        window.removeEventListener("resize", schedule)
        if (frame !== undefined) window.cancelAnimationFrame(frame)
        frame = undefined
        bind(undefined)
        hide()
        // Cached timelines stay mounted: never leave a fading pill over another session.
        pill.remove()
      }
    },
    dispose() {
      this.setActive(false)
      disposed = true
      mutations.disconnect()
      resize.disconnect()
      pill.removeEventListener("click", onClick)
      pill.remove()
    },
  }
}
