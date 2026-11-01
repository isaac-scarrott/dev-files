import { Plugin, Style, createKeyed } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { attach } from "./lane"
import { readConfig } from "./options"
import { forecast, humanize, type Notice, type Selection } from "./predict"
import { SETTLE } from "./spring"
import { styles } from "./styles"

const tokensOf = (notice: Notice | undefined) => (notice && "tokens" in notice ? notice.tokens : 0)

export default Plugin.define({
  i18n: {
    en: {
      "expired.lead": "Cache expired",
      "expired.rest": "next message re-reads ~{{tokens}} tokens",
      "model.lead": "Cache reset",
      "model.rest": "model changed · next message re-reads ~{{tokens}} tokens",
      "compacted.lead": "Cache reset",
      "compacted.rest": "compacted · next message writes a new cache",
    },
  },
  setup(ctx) {
    const config = readConfig(ctx.options)
    ctx.add(Style, styles)

    const session = createMemo(() => ctx.sessions.current())
    const key = createMemo(() => session()?.key)

    const messages = () => {
      const current = session()

      return current?.id ? current.server.data.session.message.list(current.id) : []
    }

    // A session that has just mounted, or just finished loading its messages (Cmd+R, a switch), shows its tray at rest;
    // one that turns stale while you watch slides in.
    let born = performance.now()

    createMemo((previous?: string) => {
      const next = messages().length > 0 ? key() : undefined

      if (next !== previous) born = performance.now()

      return next
    })

    const selection = createMemo<Selection | undefined>(
      () => {
        const model = ctx.screen.current()?.composer.model()

        return model && { providerID: model.providerID, modelID: model.modelID, variant: model.variant }
      },
      undefined,
      {
        equals: (a, b) =>
          a?.providerID === b?.providerID && a?.modelID === b?.modelID && (a?.variant ?? "") === (b?.variant ?? ""),
      },
    )

    // The one clock: a single timer set for the moment a warm cache runs out. It only asks for a new forecast.
    const [tick, again] = createSignal(0)

    const next = createMemo(() => {
      tick()

      return forecast({ messages: messages(), now: Date.now(), config, selection: selection() })
    })

    const notice = createMemo(() => next().notice, undefined, {
      equals: (a, b) => a?.kind === b?.kind && tokensOf(a) === tokensOf(b),
    })

    createKeyed(
      () => next().expiresAt,
      (at) => {
        let timer: ReturnType<typeof setTimeout> | undefined

        const arm = () => {
          const wait = at - Date.now()

          if (wait > 0) timer = setTimeout(arm, Math.min(wait, 2 ** 31 - 1))
          else again((count) => count + 1)
        }

        arm()
        onCleanup(() => clearTimeout(timer))
      },
    )

    // Trays that are retracting; the next one, or the plugin going away, finishes them at once.
    const leaving = new Set<() => void>()
    onCleanup(() => leaving.forEach((finish) => finish()))

    createKeyed(
      () => (key() && notice() ? key() : undefined),
      (mounted) => {
        leaving.forEach((finish) => finish())
        const animate = performance.now() - born > 250
        const host = document.createElement("div")
        host.setAttribute("data-cache-warning", "")
        host.setAttribute("data-dock-surface", "tray")
        host.setAttribute("role", "status")
        host.setAttribute("data-state", animate ? "closed" : "rest")
        const dispose = render(() => <Text notice={notice} locale={ctx.locale.locale} t={ctx.t} />, host)
        // The closed state must be painted once in the lane before it opens, or there is nothing to transition from.
        const detach = attach(host, () => {
          if (!animate) return
          requestAnimationFrame(() => host.getAttribute("data-state") === "closed" && host.setAttribute("data-state", "open"))
        })

        let timer: ReturnType<typeof setTimeout> | undefined

        const finish = () => {
          leaving.delete(finish)
          clearTimeout(timer)
          detach()
          dispose()
        }

        onCleanup(() => {
          if (ctx.signal.aborted || key() !== mounted || !host.isConnected) return finish()

          host.setAttribute("data-state", "closing")
          leaving.add(finish)
          timer = setTimeout(finish, SETTLE * 1000 + 50)
        })
      },
    )
  },
})

function Text(props: {
  notice: () => Notice | undefined
  locale: () => string
  t: (key: string, params?: Record<string, string>) => string
}) {
  // The last notice stays on screen while the tray retracts.
  const parts = createMemo<{ lead: string; rest: string } | undefined>((last) => {
    const value = props.notice()

    if (!value) return last
    const params = { tokens: "tokens" in value ? humanize(value.tokens, props.locale()) : "" }

    return { lead: props.t(`${value.kind}.lead`, params), rest: props.t(`${value.kind}.rest`, params) }
  })

  return (
    <>
      <span data-cache-warning-lead>{parts()?.lead}</span> · {parts()?.rest}
    </>
  )
}
