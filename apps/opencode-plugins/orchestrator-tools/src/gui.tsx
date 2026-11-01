import { createKeyed, Plugin, Style } from "@opencode/plugin/gui"
import { createMemo, createSignal, createUniqueId, getOwner, onCleanup, runWithOwner } from "solid-js"
import { render } from "solid-js/web"
import { holdTop, scrollerOf } from "./anchor.js"
import { escapeMarkup, peerOf, type PeerMessage } from "./card.js"

const ROW = "[data-timeline-row='UserMessage'][data-message-id]"
const TIMELINE = "[data-slot='session-timeline-scroll']"
const ROW_ATTR = "data-peer-row"
const CARD_ATTR = "data-peer-card"
// Height of the header line: the row's 8px padding plus the 20px title line.
const HEADER = 28

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
  position: absolute; inset: 0; z-index: 0; margin: 0; padding: 0; border: 0; border-radius: 8px; background: transparent;
}
[${CARD_ATTR}]:not([data-expandable="true"]) [data-slot="peer-trigger"] { display: none; }
[${CARD_ATTR}][data-open="true"] [data-slot="peer-text"] { cursor: text; }
[${CARD_ATTR}]:has([data-slot="peer-trigger"]:focus-visible) { outline: 1px solid var(--v2-text-text-accent); outline-offset: 2px; }
[${CARD_ATTR}] [data-slot="peer-trigger"]:focus-visible { outline: none; }
/* 16px catalog box, vertically centred on the 20px line; the arrow's ink starts 5px inside the box, so the box sits 5px left of the 12px content edge and its ink lines up with it. */
[${CARD_ATTR}] [data-slot="peer-dir"] { position: relative; flex: none; width: 16px; height: 16px; margin: 2px -4px 2px -5px; color: var(--v2-text-text-faint); pointer-events: none; }
[${CARD_ATTR}] [data-slot="peer-dir"] svg { display: block; width: 16px; height: 16px; }
[${CARD_ATTR}] [data-slot="peer-name"] {
  position: relative; flex: 0 1 auto; min-width: 0; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 530; pointer-events: none;
}
/* One text element for both states: it is the first line in both, so it cannot move. Only its height changes, in one frame, as the host's collapsibles do. */
[${CARD_ATTR}] [data-slot="peer-text"] {
  position: relative; flex: 1 1 0%; min-width: 0; height: 20px; overflow: hidden; pointer-events: none; user-select: none; overflow-wrap: anywhere;
}
[${CARD_ATTR}][data-open="true"] [data-slot="peer-text"] { height: auto; pointer-events: auto; user-select: text; }
/* The host's Markdown is 14px/22.4px with its own block margins. The row's text is the row's type (13px/20px), so the first line
   shares the title's baseline, and no block brings margin of its own: spacing between blocks is set here. */
[${CARD_ATTR}] [data-slot="peer-text"] [data-component="markdown"] { margin: 0; padding: 0; font: inherit; letter-spacing: inherit; }
[${CARD_ATTR}] [data-slot="peer-text"] :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) { margin: 0; }
[${CARD_ATTR}] [data-slot="peer-text"] :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) + :is(p, ul, ol, blockquote, pre, table, hr, h1, h2, h3, h4, h5, h6, [data-component="markdown-code"]) { margin-top: 8px; }
[${CARD_ATTR}] [data-slot="peer-text"] :is(p, li, h1, h2, h3, h4, h5, h6) { font: inherit; letter-spacing: inherit; }
[${CARD_ATTR}] [data-slot="peer-text"] :is(ul, ol) { padding-inline-start: 18px; }
[${CARD_ATTR}] [data-slot="peer-text"] li { margin: 0; padding: 0; }
[${CARD_ATTR}] [data-slot="peer-text"] li + li { margin-top: 2px; }
[${CARD_ATTR}] [data-slot="peer-text"] li > p { margin: 0; }
/* A code block has no vertical padding here: its first line sits where the clamped line sits, so opening cannot move it. */
[${CARD_ATTR}] [data-slot="peer-text"] pre { margin: 0; padding: 0 8px; border-radius: 4px; line-height: 20px; white-space: pre-wrap; }
[${CARD_ATTR}]:not([data-open="true"]) [data-slot="peer-text"] [data-slot="markdown-copy-button"] { display: none; }
[${CARD_ATTR}]:not([data-open="true"]) [data-slot="peer-text"] [data-markdown-block]:first-child > :first-child {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; line-clamp: 1; overflow: hidden;
}
/* The trailing slot is the host task-tool-action, copied: collapsed it takes no room (width 0, and a negative margin cancels
   the row's 8px gap), and on hover or focus it grows, fades in and slides from 4px left over 150ms ease, so the row's width grows
   the way the host row's does (+18px for a bare chevron). The 24px button's 4px side padding hangs outside the 16px slot (overflow-clip-margin), so its chevron sits exactly where
   the host's does. With the expand triangle in front the slot is 34px (16 triangle + 2 + 16 chevron). */
[${CARD_ATTR}] [data-slot="peer-tail"] {
  position: relative; flex: none; display: flex; align-items: center; gap: 2px; box-sizing: border-box; height: 20px;
  width: 0; margin-inline: -8px 0; opacity: 0; color: var(--v2-text-text-faint); transform: translate(-4px); overflow: clip; overflow-clip-margin: 4px;
  transition: width 150ms, margin-inline-start 150ms, opacity 150ms, color 150ms, transform 150ms;
}
:root[data-motion="reduce"] [${CARD_ATTR}] [data-slot="peer-tail"], :root[data-motion="reduce"] [${CARD_ATTR}] [data-slot="peer-arrow"] svg { transition: none; }
[${CARD_ATTR}]:is(:hover, :focus-within, :has([data-slot="peer-trigger"]:focus-visible)) [data-slot="peer-tail"],
[${CARD_ATTR}][data-open="true"] [data-slot="peer-tail"] { opacity: 1; transform: none; width: 16px; margin-inline: -6px 0; }
[${CARD_ATTR}][data-expandable="true"]:is(:hover, :focus-within, :has([data-slot="peer-trigger"]:focus-visible)) [data-slot="peer-tail"],
[${CARD_ATTR}][data-open="true"] [data-slot="peer-tail"] { width: 34px; margin-inline: -6px 0; }
[${CARD_ATTR}] [data-slot="peer-arrow"] { display: flex; flex: none; align-items: center; justify-content: center; width: 16px; height: 20px; color: var(--v2-text-text-faint); pointer-events: none; }
[${CARD_ATTR}] [data-slot="peer-arrow"] svg { transform: rotate(-90deg); transition: transform 150ms ease; }
[${CARD_ATTR}][data-open="true"] [data-slot="peer-arrow"] svg { transform: rotate(0); }
[${CARD_ATTR}]:not([data-expandable="true"]) [data-slot="peer-arrow"] { display: none; }
[${CARD_ATTR}] .peer-open { position: relative; flex: none; z-index: 1; margin: -2px -4px; transition: none; color: var(--v2-text-text-faint); }
@media (hover: none) { [${CARD_ATTR}] [data-slot="peer-tail"] { opacity: 1; transform: none; width: 16px; margin-inline: -6px 0; } [${CARD_ATTR}][data-expandable="true"] [data-slot="peer-tail"] { width: 34px; } }
`

type Located = { readonly id: string; readonly peer: PeerMessage; readonly server: string }

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
          if (peer) found.set(message.id, { id: message.id, peer, server: session.server.id })
        }
      }
      return found
    })

    // The host re-creates a timeline row when it re-renders (a new message arrives, a virtualised row scrolls back in), which would
    // collapse a row the user opened; the open ones are remembered here, per window.
    const opened = new Set<string>()
    const open = (located: Located) => ctx.tabs.open({ server: located.server, id: located.peer.sessionID }, { focus: true })

    const Row = (props: { located: Located }) => {
      const peer = () => props.located.peer
      const id = `peer-text-${createUniqueId()}`
      const [expanded, setExpanded] = createSignal(opened.has(props.located.id))
      const [expandable, setExpandable] = createSignal(false)
      let root!: HTMLDivElement
      let text!: HTMLDivElement

      // Something to reveal: a second block, or a first line the clamp cuts off.
      const measure = () => {
        // Only the clamped (collapsed) state tells whether the first line is cut off.
        if (expanded()) return
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
      })
      queueMicrotask(() => {
        observer.observe(text)
        rendered.observe(text, { childList: true, subtree: true })
        measure()
        void document.fonts?.ready.then(measure)
      })

      // The host scrolls to the bottom whenever a row resizes, which would carry the clicked header out from under the pointer, so
      // the second click could not land on it. Hold the header at its screen position through the change (the user's decision;
      // the host does not do this for its own collapsibles). Only toggles made here are held.
      let release: (() => void) | undefined
      onCleanup(() => release?.())
      const toggle = () => {
        const scroller = scrollerOf(root)
        const header = root.querySelector("[data-slot='peer-name']")
        release?.()
        if (scroller && header) release = holdTop(scroller, header, root, 400)
        const next = !expanded()
        if (next) opened.add(props.located.id)
        else opened.delete(props.located.id)
        setExpanded(next)
      }
      const onClick = (event: MouseEvent) => {
        if (!expandable()) return
        const target = event.target as Element
        if (target.closest(".peer-open, a, button:not([data-slot='peer-trigger'])")) return
        // The header (the title line, which carries the first line of the message) toggles both ways. The rest of the open text is
        // for selecting and following links, so a click there, or one that ends a selection, does not close the row.
        if (expanded() && target.closest("[data-slot='peer-text']")) {
          const header = root.getBoundingClientRect().top + HEADER
          if (event.clientY > header || getSelection()?.toString()) return
        }
        toggle()
      }

      return (
        <div
          ref={root}
          {...{ [CARD_ATTR]: "" }}
          data-open={expanded()}
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
                icon="chevron-right"
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
    // False when the row is a peer message whose content slot is not there yet; the next frame scan retries it.
    const decorateRow = (row: HTMLElement, known: Map<string, Located>) => {
      const located = known.get(row.dataset.messageId ?? "")
      if (!located || row.querySelector(`[${CARD_ATTR}]`)) return true
      const content = row.querySelector("[data-slot='session-turn-message-content']")
      if (!content) return false
      row.setAttribute(ROW_ATTR, "")
      const host = document.createElement("div")
      host.setAttribute("data-peer-mount", "")
      host.style.display = "contents"
      content.append(host)
      mounted.set(host, runWithOwner(owner, () => render(() => <Row located={located} />, host))!)
      return true
    }
    const decorate = () => {
      frame = undefined
      if (disposed) return
      sweep()
      const known = peers()
      if (known.size === 0) return
      for (const timeline of watched) for (const row of timeline.querySelectorAll<HTMLElement>(ROW)) decorateRow(row, known)
    }
    const schedule = () => {
      if (!disposed) frame ??= requestAnimationFrame(decorate)
    }

    // Rows only appear inside a timeline's scroll region, so that is all the observer watches. Cached timelines stay
    // mounted, and a new one arrives with a session switch, so the regions are looked up again then.
    const watched = new Set<Element>()
    // Mutation callbacks run before the next paint, so a row the host adds is swapped before it is ever drawn. Only the
    // added nodes are searched, and nothing runs while no open session holds a peer message.
    const observer = new MutationObserver((records) => {
      if (disposed) return
      const known = peers()
      if (known.size === 0) return
      let retry = false
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue
          const element = node as Element
          if (element.matches(ROW)) retry ||= !decorateRow(element as HTMLElement, known)
          else if (element.firstElementChild) for (const row of element.querySelectorAll<HTMLElement>(ROW)) retry ||= !decorateRow(row, known)
        }
      }
      if (retry) schedule()
    })
    let looking: number | undefined
    const locate = (attempts: number) => {
      looking = undefined
      if (disposed) return
      for (const timeline of watched) if (!timeline.isConnected) watched.delete(timeline)
      for (const timeline of document.querySelectorAll(TIMELINE)) {
        if (watched.has(timeline)) continue
        watched.add(timeline)
        observer.observe(timeline, { childList: true, subtree: true })
        schedule()
      }
      if (attempts > 0) looking = requestAnimationFrame(() => locate(attempts - 1))
    }
    const look = () => {
      if (looking === undefined && !disposed) looking = requestAnimationFrame(() => locate(12))
    }

    createKeyed(peers, schedule)
    createKeyed(() => ctx.sessions.current()?.key, look, { otherwise: look })
    look()

    onCleanup(() => {
      disposed = true
      observer.disconnect()
      watched.clear()
      if (frame !== undefined) cancelAnimationFrame(frame)
      if (looking !== undefined) cancelAnimationFrame(looking)
      for (const host of [...mounted.keys()]) drop(host)
      for (const row of document.querySelectorAll(`[${ROW_ATTR}]`)) row.removeAttribute(ROW_ATTR)
    })
  },
})
