import { Plugin, Slot, Style } from "@opencode/plugin/gui"
import { createEffect, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { AgentsPanel, styles } from "./panel"

const SCROLL = "[data-slot='session-timeline-scroll']"
const INSET = 12

// The timeline element that holds this header: the nearest ancestor with a scroll area inside it.
export function timelineOf(marker: Element): Element | undefined {
  for (let node = marker.parentElement; node; node = node.parentElement) {
    const scroll = node.querySelector(SCROLL)
    if (scroll) return scroll
  }
}

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, styles)
    if (typeof document === "undefined") return

    // No registry floats content at the timeline's corner, so each active header mounts one fixed host that follows
    // the timeline's bounds. Cached timelines stay mounted while hidden, so only the active one has a host.
    ctx.add(Slot, {
      at: "session.header",
      render(input) {
        const marker = document.createElement("span")
        marker.hidden = true

        createEffect(() => {
          if (!input.active) return
          const host = document.createElement("div")
          host.setAttribute("data-agents-host", "")
          document.body.append(host)
          const dispose = render(() => <AgentsPanel ctx={ctx} session={() => input.session} />, host)

          let frame = 0
          const place = () => {
            cancelAnimationFrame(frame)
            frame = requestAnimationFrame(() => {
              const rect = (timelineOf(marker) ?? marker.parentElement)?.getBoundingClientRect()
              if (!rect) return
              host.style.top = `${rect.top + INSET}px`
              host.style.right = `${Math.max(0, window.innerWidth - rect.right) + INSET}px`
            })
          }
          place()
          const observer = new ResizeObserver(place)
          const target = timelineOf(marker) ?? marker.parentElement
          if (target) observer.observe(target)
          observer.observe(document.body)
          window.addEventListener("resize", place)

          onCleanup(() => {
            cancelAnimationFrame(frame)
            observer.disconnect()
            window.removeEventListener("resize", place)
            dispose()
            host.remove()
          })
        })
        return marker
      },
    })
  },
})
