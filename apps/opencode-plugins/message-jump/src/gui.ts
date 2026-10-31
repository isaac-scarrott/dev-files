import { Plugin, Slot, Style } from "@opencode/plugin/gui"
import { createEffect, on, onCleanup } from "solid-js"
import { createJumpController } from "./controller"

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
        box-sizing: border-box;
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
        [data-message-jump][data-visible='true'],
        [data-message-jump][data-visible='true']:active {
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

    ctx.add(Slot, {
      at: "session.header",
      render(input) {
        const marker = document.createElement("span")
        marker.hidden = true
        const pill = document.createElement("button")
        pill.type = "button"
        pill.setAttribute("data-message-jump", "")
        pill.innerHTML = `<span data-message-jump-icon>${arrow}</span><span data-message-jump-text></span>`
        const controller = createJumpController(marker, pill)
        createEffect(on(
          () => [input.session.visit, input.active] as const,
          ([, active]) => {
            controller.setActive(false)
            controller.setActive(active)
          },
        ))
        onCleanup(() => controller.dispose())
        return marker
      },
    })
  },
})
