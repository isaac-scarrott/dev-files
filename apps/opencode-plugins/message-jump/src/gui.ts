import { Plugin, Style } from "@opencode/plugin/gui"
import { awayFromBottom, nearestAbove, SCROLL_SLOT, snippet, userRows, type Row } from "./jump"

// Phosphor (regular): arrow-up.
const arrow =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/></svg>'

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, `
      [data-message-jump] {
        position: fixed;
        z-index: 40;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: min(520px, calc(100vw - 24px));
        height: 26px;
        padding: 0 10px 0 9px;
        border: 1px solid var(--v2-border-border-muted);
        border-radius: 999px;
        background: var(--v2-background-bg-layer-02);
        color: var(--v2-text-text-muted);
        box-shadow: 0 6px 18px -8px rgb(0 0 0 / 0.5);
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translate(-50%, -6px) scale(0.97);
        transition:
          opacity 120ms cubic-bezier(0.23, 1, 0.32, 1),
          transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
          visibility 0s 120ms;
      }
      [data-message-jump][data-visible='true'] {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translate(-50%, 0) scale(1);
        transition:
          opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
          transform 180ms cubic-bezier(0.23, 1, 0.32, 1),
          visibility 0s;
      }
      [data-message-jump][data-visible='true']:active {
        transform: translate(-50%, 0) scale(0.97);
        transition: transform 100ms cubic-bezier(0.23, 1, 0.32, 1);
      }
      [data-message-jump]:focus-visible {
        outline: 2px solid var(--v2-border-border-focus);
        outline-offset: 2px;
      }
      [data-message-jump-icon] {
        display: block;
        flex: none;
        width: 12px;
        height: 12px;
        color: var(--v2-text-text-faint);
      }
      [data-message-jump-icon] > svg {
        display: block;
        width: 12px;
        height: 12px;
      }
      [data-message-jump-text] {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* Leave room for the pill under the top edge after a jump. */
      [data-timeline-row='UserMessage'] {
        scroll-margin-block-start: 12px;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-message-jump],
        [data-message-jump][data-visible='true'] {
          transform: translate(-50%, 0);
        }
        [data-message-jump] {
          transition: opacity 120ms linear, visibility 0s 120ms;
        }
        [data-message-jump][data-visible='true'] {
          transition: opacity 120ms linear, visibility 0s;
        }
      }
    `)

    if (typeof document === "undefined") return

    const pill = document.createElement("button")
    pill.type = "button"
    pill.tabIndex = -1
    pill.setAttribute("data-message-jump", "")
    pill.innerHTML = `<span data-message-jump-icon>${arrow}</span><span data-message-jump-text></span>`

    const text = pill.querySelector<HTMLElement>("[data-message-jump-text]")!

    let target: Row | undefined
    let container: HTMLElement | undefined
    let frame: number | undefined
    let mounted = false
    let position = ""

    const hide = () => {
      target = undefined
      if (pill.getAttribute("data-visible") === "true") pill.setAttribute("data-visible", "false")
    }

    const place = (rect: DOMRect, row: Row) => {
      const left = `${Math.round(rect.left + rect.width / 2)}px`
      const top = `${Math.round(rect.top + 10)}px`
      const next = `${left}|${top}`

      if (next !== position) {
        position = next
        pill.style.left = left
        pill.style.top = top
      }
    }

    const evaluate = (element: HTMLElement) => {
      if (!element.isConnected || !awayFromBottom(element)) return hide()

      const edge = element.getBoundingClientRect().top
      const row = nearestAbove(userRows(element), edge)
      const label = row ? snippet(row.element) : ""

      if (!row || !label) return hide()

      const changed = row.element !== target?.element

      target = row
      container = element
      if (text.textContent !== label) text.textContent = label
      if (pill.title !== label) pill.title = label
      if (pill.getAttribute("aria-label") !== label) pill.setAttribute("aria-label", `Jump to your message: ${label}`)

      // Position before the entrance frame so it slides in where it belongs, not from a stale spot.
      if (!mounted || changed || pill.getAttribute("data-visible") !== "true") place(element.getBoundingClientRect(), row)

      if (!mounted) {
        mounted = true
        document.body.append(pill)
      }
      if (pill.getAttribute("data-visible") !== "true") pill.setAttribute("data-visible", "true")
    }

    const schedule = (element: HTMLElement) => {
      container = element
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (container) evaluate(container)
      })
    }

    const onScroll = (event: Event) => {
      const node = event.target
      const element = node instanceof Element ? node.closest<HTMLElement>(SCROLL_SLOT) : null

      if (element) schedule(element)
    }

    const onResize = () => {
      if (container) schedule(container)
    }

    const onClick = () => {
      const element = target?.element

      if (!element?.isConnected) return hide()

      element.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      })
      hide()
    }

    pill.addEventListener("click", onClick)
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    window.addEventListener("resize", onResize)

    // Rows mount and unmount as the virtualizer scrolls; re-read the timeline when it changes.
    const observer = new MutationObserver(() => {
      if (!container?.isConnected) {
        // A session switch replaces the timeline element; adopt the one now on screen.
        const next = [...document.querySelectorAll<HTMLElement>(SCROLL_SLOT)].find((element) => element.clientHeight > 0)

        if (!next) return hide()

        container = next
      }
      schedule(container)
    })
    observer.observe(document.documentElement, { subtree: true, childList: true })

    return () => {
      observer.disconnect()
      document.removeEventListener("scroll", onScroll, { capture: true })
      window.removeEventListener("resize", onResize)
      pill.removeEventListener("click", onClick)
      if (frame !== undefined) cancelAnimationFrame(frame)
      pill.remove()
    }
  },
})
