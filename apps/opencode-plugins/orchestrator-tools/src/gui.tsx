import { Plugin, Style } from "@opencode/plugin/gui"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { peerOf, type PeerMessage } from "./card.js"

const ROW = "[data-timeline-row='UserMessage'][data-message-id]"
const ROW_ATTR = "data-peer-row"
const CARD_ATTR = "data-peer-card"

// The host styles a user bubble through `[data-component=user-message]` and its `data-slot`s, so the card wears the
// same markup and the host's CSS gives it the bubble's padding, radius, type and hover-revealed footer. Only what
// differs is set here: left-aligned, a cooler fill, the "From" pill on the top edge.
const css = `
[${ROW_ATTR}] [data-component="user-message"]:not([${CARD_ATTR}]) { display: none; }
[${CARD_ATTR}] { margin-top: 10px; }
[${CARD_ATTR}] [data-slot="user-message-body"] { position: relative; align-items: flex-start; margin-inline-start: 0; margin-inline-end: auto; max-width: min(82%, 64ch); }
[data-component="user-message"][${CARD_ATTR}] [data-slot="user-message-text"] {
  background: color-mix(in srgb, var(--v2-state-fg-info) 5%, color-mix(in srgb, var(--v2-background-bg-layer-01), var(--v2-background-bg-layer-02) 40%));
  border-start-end-radius: 10px; border-end-end-radius: 10px; padding-top: 12px; text-align: start;
}
[${CARD_ATTR}] [data-slot="peer-from"] {
  position: absolute; z-index: 1; top: -9px; inset-inline-start: 10px; box-sizing: border-box; max-width: calc(100% - 20px);
  display: flex; align-items: baseline; gap: 4px; padding: 0 8px; border: 1px solid var(--v2-border-border-base); border-radius: 9999px;
  background: var(--v2-background-bg-base); font-size: 12px; line-height: 16px; color: var(--v2-text-text-muted); white-space: nowrap;
}
[${CARD_ATTR}] [data-slot="peer-from-title"] { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 530; color: var(--v2-text-text-base); }
[${CARD_ATTR}] [data-slot="user-message-copy-wrapper"] { justify-content: flex-start; }
`

type Located = { readonly peer: PeerMessage; readonly server: string }

export default Plugin.define({
  i18n: {
    en: {
      from: "From",
      reply: "Reply to {title}",
      more: "More actions",
      open: "Open session",
      copy: "Copy text",
    },
  },
  setup(ctx) {
    ctx.add(Style, css)

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

    const Card = (props: { located: Located }) => {
      const peer = () => props.located.peer
      return (
        <>
          <div data-slot="user-message-body">
            <div data-slot="peer-from" title={peer().title}>
              <span>{ctx.t("from")}</span>
              <span data-slot="peer-from-title">{peer().title}</span>
            </div>
            <div data-slot="user-message-text" dir="auto">{peer().text}</div>
          </div>
          <div data-slot="user-message-copy-wrapper">
            <span data-slot="user-message-actions">
              <ctx.ui.Tooltip value={ctx.t("reply", { title: peer().title })}>
                <ctx.ui.IconButton icon="arrow-undo-down" size="small" label={ctx.t("reply", { title: peer().title })} onClick={() => open(props.located)} />
              </ctx.ui.Tooltip>
              <ctx.ui.Menu
                label={ctx.t("more")}
                placement="bottom-start"
                items={[
                  { label: ctx.t("open"), icon: "arrow-up-right", onSelect: () => open(props.located) },
                  { label: ctx.t("copy"), icon: "copy", onSelect: () => void ctx.system.copy(peer().text) },
                ]}
              />
            </span>
          </div>
        </>
      )
    }

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
        host.setAttribute("data-component", "user-message")
        host.setAttribute(CARD_ATTR, "")
        content.append(host)
        mounted.set(host, render(() => <Card located={located} />, host))
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
