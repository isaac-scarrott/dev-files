import { ComposerPill, createKeyed, createLatest, Plugin } from "@opencode/plugin/gui"
import { createSignal, onCleanup } from "solid-js"
import { formatTokens } from "./nudge.js"
import { HandoffNudge } from "./rpc.js"
import { acquirePublisher, notifyFromServer } from "../../native-ui/src/notify-contract.js"
import { type Loaded, pillFor, type SessionState } from "./view.js"

const TITLE = "Context is large: hand off to a fresh session"

export default Plugin.define({
  i18n: {
    en: {
      title: TITLE,
      pill: "{{size}} context",
      handOff: "Hand off now",
      notNow: "Not now",
      handOffFailed: "Could not queue the handoff",
      dismissFailed: "Could not dismiss the handoff",
    },
  },
  setup(ctx) {
    const rpc = () => ctx.client.rpc(HandoffNudge)
    onCleanup(acquirePublisher(ctx.id))

    // One reactive view of the server's state, refreshed by its `changed` event.
    const [version, setVersion] = createSignal(0)
    createKeyed(rpc, (client) => {
      onCleanup(client.events.on("changed", () => void setVersion((v) => v + 1)))
      // One info notification per tier: a mark in the hub, never a toast.
      onCleanup(client.events.on("notify", (event) => void notifyFromServer(ctx, event.data), { signal: ctx.signal }))
    })

    const sessionID = () => ctx.sessions.current()?.id
    const session = createLatest(
      () => {
        const id = sessionID()
        return id ? { id, version: version() } : undefined
      },
      async (key, signal): Promise<Loaded> => {
        const result = await rpc().get({ sessionID: key.id }, { signal })
        return { sessionID: key.id, state: result as SessionState }
      },
    )

    const act = (id: string, run: (id: string) => Promise<unknown>, failed: string) => {
      run(id)
        .catch((error) => {
          if (ctx.signal.aborted) return
          console.warn("handoff-nudge: action failed:", error)
          ctx.toast.show({ title: failed, variant: "error" })
        })
        .finally(() => setVersion((v) => v + 1))
    }

    ctx.add(ComposerPill, {
      id: "handoff",
      show: (input) => {
        const id = input.session.id
        const spec = pillFor({
          sessionID: id,
          loaded: session.latest,
          text: { title: ctx.t("title"), label: (context) => ctx.t("pill", { size: formatTokens(context) }) },
        })
        if (!spec) return undefined
        return {
          label: spec.label,
          title: spec.title,
          tone: "warning",
          rows: [
            {
              id: "hand-off",
              label: ctx.t("handOff"),
              icon: "branch-out",
              run: () => act(id, (sessionID) => rpc().handoff({ sessionID }, { signal: ctx.signal }), ctx.t("handOffFailed")),
            },
            {
              id: "not-now",
              label: ctx.t("notNow"),
              run: () => act(id, (sessionID) => rpc().dismiss({ sessionID }, { signal: ctx.signal }), ctx.t("dismissFailed")),
            },
          ],
        }
      },
    })
  },
})
