import { Plugin, Style } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, getOwner, onCleanup, runWithOwner } from "solid-js"
import { render } from "solid-js/web"
import { holdTop, scrollerOf } from "./anchor.js"
import { escapeMarkup, peerOf, type PeerMessage } from "./card.js"

const ROW = "[data-timeline-row='UserMessage'][data-message-id]"
const ROW_ATTR = "data-peer-row"
const CARD_ATTR = "data-peer-card"
const GROW_MS = 200

// A peer message is a left-aligned grey row in the style of the host's subagent row (`task-tool-surface`: 8px 12px
// padding, 8px radius, bg-layer-02, 13px/20px type, title 530). The host has no message-renderer registry, so the host's
// user bubble inside the timeline row is hidden and this row is appended in its slot. The measurements are in DESIGN.md.
const css = `
[${ROW_ATTR}] [data-component="user-message"] { display: none; }
[${CARD_ATTR}] {
  position: relative; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px;
  width: fit-content; max-width: 100%; min-width: 0; padding: 8px 12px;
  border-radius: 8px; background: var(--v2-background-bg-layer-02);
  font: 440 13px/20px var(--v2-font-family-sans, inherit); letter-spacing: -0.04px; color: var(--v2-text-text-base);
}
[${CARD_ATTR}] [data-slot="peer-trigger"] {
  position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent; cursor: pointer;
}
[${CARD_ATTR}]:not([data-expandable="true"]) [data-slot="peer-trigger"] { display: none; }
[${CARD_ATTR}][data-expandable="true"] { cursor: pointer; }
[${CARD_ATTR}][data-open="true"] [data-slot="peer-text"] { cursor: text; }
[${CARD_ATTR}]:has([data-slot="peer-trigger"]:focus-visible) { outline: 1px solid var(--v2-text-text-accent); outline-offset: 2px; }
[${CARD_ATTR}] [data-slot="peer-trigger"]:focus-visible { outline: none; }
[${CARD_ATTR}] [data-slot="peer-dir"] { position: relative; flex: none; width: 16px; height: 16px; margin-top: 2px; color: var(--v2-text-text-faint); pointer-events: none; }
[${CARD_ATTR}] [data-slot="peer-dir"] svg { display: block; width: 16px; height: 16px; }
[${CARD_ATTR}] [data-slot="peer-name"] {
  position: relative; flex: 0 1 auto; min-width: 0; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 530; pointer-events: none;
}
/* One text element for both states: it is the first line in both, so it cannot move. Only its height changes. */
[${CARD_ATTR}] [data-slot="peer-text"] {
  position: relative; flex: 1 1 0%; min-width: 0; height: 20px; overflow: hidden; interpolate-size: allow-keywords;
  transition: height ${GROW_MS}ms cubic-bezier(0.23, 1, 0.32, 1); pointer-events: none; user-select: none; overflow-wrap: anywhere;
}
[${CARD_ATTR}][data-open="true"] [data-slot="peer-text"] { height: auto; pointer-events: auto; user-select: text; }
[${CARD_ATTR}] [data-slot="peer-text"] [data-markdown-block] > * { margin: 0; }
[${CARD_ATTR}] [data-slot="peer-text"] [data-markdown-block] > * + * { margin-top: 8px; }
[${CARD_ATTR}] [data-slot="peer-text"] :is(p, li, h1, h2, h3, h4, h5, h6) { font: inherit; letter-spacing: inherit; }
[${CARD_ATTR}] [data-slot="peer-text"] :is(ul, ol) { padding-inline-start: 18px; }
[${CARD_ATTR}] [data-slot="peer-text"] li { margin: 0; padding: 0; }
[${CARD_ATTR}] [data-slot="peer-text"] li + li { margin-top: 2px; }
[${CARD_ATTR}] [data-slot="peer-text"] li > p { margin: 0; }
/* A code block has no vertical padding here: its first line sits where the clamped line sits, so opening cannot move it. */
[${CARD_ATTR}] [data-slot="peer-text"] pre { margin: 0; padding: 0 8px; border-radius: 4px; line-height: 20px; white-space: pre-wrap; }
[${CARD_ATTR}][data-clamped="true"] [data-slot="peer-text"] [data-slot="markdown-copy-button"] { display: none; }
[${CARD_ATTR}][data-clamped="true"] [data-slot="peer-text"] [data-markdown-block]:first-child > :first-child {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; line-clamp: 1; overflow: hidden;
}
/* The trailing slot has a fixed width, so revealing its buttons never re-wraps the text. */
[${CARD_ATTR}] [data-slot="peer-tail"] { position: relative; flex: none; display: flex; align-items: center; gap: 2px; height: 20px; margin-right: -4px; }
[${CARD_ATTR}] [data-slot="peer-arrow"] {
  display: flex; align-items: center; justify-content: center; width: 16px; height: 20px; color: var(--v2-text-text-faint);
  pointer-events: none; opacity: 0; transition: opacity 150ms ease;
}
[${CARD_ATTR}] [data-slot="peer-arrow"] svg { transform: rotate(-90deg); transition: transform 150ms ease; }
[${CARD_ATTR}][data-expandable="true"]:is(:hover, :has([data-slot="peer-trigger"]:focus-visible)) [data-slot="peer-arrow"],
[${CARD_ATTR}][data-open="true"] [data-slot="peer-arrow"] { opacity: 1; }
[${CARD_ATTR}][data-open="true"] [data-slot="peer-arrow"] svg { transform: rotate(0); }
[${CARD_ATTR}]:not([data-expandable="true"]) [data-slot="peer-arrow"] { visibility: hidden; }
[${CARD_ATTR}] .peer-open { position: relative; z-index: 1; margin-block: -2px; opacity: 0; }
[${CARD_ATTR}]:is(:hover, :focus-within) .peer-open, [${CARD_ATTR}][data-open="true"] .peer-open { opacity: 1; }
@media (hover: none) { [${CARD_ATTR}] .peer-open, [${CARD_ATTR}] [data-slot="peer-arrow"] { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { [${CARD_ATTR}] [data-slot="peer-text"], [${CARD_ATTR}] [data-slot="peer-arrow"] svg { transition: none; } }
`

type Located = { readonly peer: PeerMessage; readonly server: string }

let serial = 0

export default Plugin.define({
  i18n: {
    en: {
      open: "Open session",
    },
  },
  setup(ctx) {
    ctx.add(Style, css)
    // The host's Markdown reads the app's contexts, which only the setup owner carries; a rAF callback has none.
    const owner = getOwner()

    // Every peer message in the sessions of open tabs, by message id.
    const peers = createMemo(() => {
      const found = new Map<string, Located>()
      for (const session of ctx.sessions.list()) {
        for (const message of session.server.data.session.message.list(session.id)) {
          const peer = peerOf(message as Parameters<typeof peerOf>[0])
          if (peer) found.set(message.id, { peer, server: session.server.id })
        }
      }
      return found
    })

    const open = (located: Located) => ctx.tabs.open({ server: located.server, id: located.peer.sessionID }, { focus: true })

    const Row = (props: { located: Located }) => {
      const peer = () => props.located.peer
      const id = `peer-text-${++serial}`
      const [expanded, setExpanded] = createSignal(false)
      const [clamped, setClamped] = createSignal(true)
      const [expandable, setExpandable] = createSignal(false)
      let root!: HTMLDivElement
      let text!: HTMLDivElement
      let release: (() => void) | undefined
      let settle: ReturnType<typeof setTimeout> | undefined

      // Something to reveal: a second block, or a first line the clamp cuts off.
      const measure = () => {
        // Only the clamped state tells whether the first line is cut off; skip while opening or closing.
        if (expanded() || !clamped()) return
        const parts = text.querySelectorAll("[data-markdown-block] > *")
        const first = parts[0]
        if (!first) return
        setExpandable(parts.length > 1 || first.scrollHeight > first.clientHeight + 1 || first.scrollWidth > first.clientWidth + 1)
      }
      const observer = new ResizeObserver(measure)
      // The host renders Markdown after mount, so the blocks to measure arrive late.
      const rendered = new MutationObserver(measure)
      onCleanup(() => {
        observer.disconnect()
        rendered.disconnect()
        release?.()
        clearTimeout(settle)
      })
      queueMicrotask(() => {
        observer.observe(text)
        rendered.observe(text, { childList: true, subtree: true })
        measure()
        void document.fonts?.ready.then(measure)
      })

      const toggle = () => {
        const next = !expanded()
        const scroller = scrollerOf(root)
        const name = root.querySelector("[data-slot='peer-name']")
        release?.()
        clearTimeout(settle)
        // The clamp lifts before the height grows and returns after it has shrunk, so the first line keeps its place.
        if (next) setClamped(false)
        else settle = setTimeout(() => setClamped(true), GROW_MS + 20)
        setExpanded(next)
        if (scroller && name) release = holdTop(scroller, name, root, GROW_MS + 60)
      }
      const onClick = (event: MouseEvent) => {
        if (!expandable()) return
        const target = event.target as Element
        if (target.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")) return
        // Open text is for selecting and following links: a click there does not close the row, the rest of it does.
        if (expanded() && target.closest("[data-slot='peer-text']")) return
        toggle()
      }

      return (
        <div
          ref={root}
          {...{ [CARD_ATTR]: "" }}
          data-open={expanded()}
          data-clamped={clamped()}
          data-expandable={expandable()}
          onClick={onClick}
        >
          <button type="button" data-slot="peer-trigger" aria-expanded={expanded()} aria-controls={id} aria-label={peer().title} />
          <span data-slot="peer-dir" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none"><path d="M5 6.44V11H9.56M5 11L11 5" stroke="currentColor" /></svg>
          </span>
          <span data-slot="peer-name" title={peer().title}>{peer().title}</span>
          <div ref={text} id={id} data-slot="peer-text">
            <ctx.ui.Markdown text={escapeMarkup(peer().text)} />
          </div>
          <span data-slot="peer-tail">
            <span data-slot="peer-arrow" aria-hidden="true"><ctx.ui.Icon name="fill-triangle-down" size="small" /></span>
            <ctx.ui.Tooltip value={ctx.t("open")}>
              <ctx.ui.IconButton
                class="peer-open"
                icon="arrow-up-right"
                variant="ghost"
                label={`${ctx.t("open")} ${peer().title}`}
                onClick={() => open(props.located)}
              />
            </ctx.ui.Tooltip>
          </span>
        </div>
      )
    }

    for (const stale of document.querySelectorAll("[data-peer-mount]")) stale.remove()
    const mounted = new Map<HTMLElement, () => void>()
    const drop = (host: HTMLElement) => {
      mounted.get(host)?.()
      mounted.delete(host)
      host.remove()
    }
    const sweep = () => {
      for (const host of [...mounted.keys()]) if (!host.isConnected) drop(host)
    }

    let frame: number | undefined
    let disposed = false
    const decorate = () => {
      frame = undefined
      if (disposed) return
      sweep()
      const known = peers()
      for (const row of document.querySelectorAll<HTMLElement>(ROW)) {
        const located = known.get(row.dataset.messageId ?? "")
        if (!located) continue
        if (row.querySelector(`[${CARD_ATTR}]`)) continue
        const content = row.querySelector("[data-slot='session-turn-message-content']")
        if (!content) continue
        row.setAttribute(ROW_ATTR, "")
        const host = document.createElement("div")
        host.setAttribute("data-peer-mount", "")
        host.style.display = "contents"
        content.append(host)
        mounted.set(host, runWithOwner(owner, () => render(() => <Row located={located} />, host))!)
      }
    }
    const schedule = () => {
      if (!disposed) frame ??= requestAnimationFrame(decorate)
    }

    createEffect(() => {
      peers()
      schedule()
    })
    // Mutation callbacks run before the next paint, so a row the host adds is swapped before it is ever drawn.
    const observer = new MutationObserver((records) => {
      if (!disposed && records.some((record) => record.addedNodes.length > 0)) decorate()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()

    onCleanup(() => {
      disposed = true
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      for (const host of [...mounted.keys()]) drop(host)
      for (const row of document.querySelectorAll(`[${ROW_ATTR}]`)) row.removeAttribute(ROW_ATTR)
    })
  },
})
