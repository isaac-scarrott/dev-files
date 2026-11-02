import { createKeyed, Plugin, Style } from "@opencode/plugin/gui"
import { createMemo } from "solid-js"
import { RobotIcon, drawnIconCss, firstLine, hasMore, InjectedMessageRow, injectedMessageRowCss, mountInjectedRows } from "../../native-ui/src"
import { escapeMarkup, peerOf, type PeerMessage } from "./card.js"

type Located = { readonly id: string; readonly peer: PeerMessage; readonly server: string }

// A peer message is the shared injected-message row (native-ui): the host's subagent-row header with the sender's title and the
// message's first line, the message in a card below when opened. The measurements are in DESIGN.md.
export default Plugin.define({
  i18n: {
    en: {
      open: "Open session",
    },
  },
  setup(ctx) {
    ctx.add(Style, drawnIconCss)
    ctx.add(Style, injectedMessageRowCss)

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

    const rows = mountInjectedRows({
      kind: "peer",
      known: peers,
      render: (located) => (
        <InjectedMessageRow
          ui={ctx.ui}
          kind="peer"
          icon={<RobotIcon />}
          title={located.peer.title}
          preview={firstLine(located.peer.text)}
          more={hasMore(located.peer.text)}
          action={{ icon: "chevron-right", label: ctx.t("open"), onClick: () => open(located) }}
          open={opened.has(located.id)}
          onOpenChange={(next) => (next ? opened.add(located.id) : opened.delete(located.id))}
          body={() => <ctx.ui.Markdown text={escapeMarkup(located.peer.text)} />}
        />
      ),
    })
    createKeyed(peers, rows.schedule)
    createKeyed(() => ctx.sessions.current()?.key, rows.look, { otherwise: rows.look })
  },
})
