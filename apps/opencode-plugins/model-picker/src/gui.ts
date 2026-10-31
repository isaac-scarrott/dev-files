import { Plugin, Style } from "@opencode/plugin/gui"
import { onCleanup } from "solid-js"
import { hideRecent } from "./recent"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, `[data-mp-hidden] { display: none !important; }`)
    let frame: number | undefined
    const run = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => { frame = undefined; hideRecent(document) })
    }
    const observer = new MutationObserver(run)
    observer.observe(document.body, { childList: true, subtree: true })
    run()
    onCleanup(() => {
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      for (const el of document.querySelectorAll<HTMLElement>("[data-mp-hidden]")) { el.removeAttribute("data-mp-hidden"); el.hidden = false; el.inert = false }
    })
  },
})
