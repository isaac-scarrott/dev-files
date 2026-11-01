import { Plugin, Style, createKeyed } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { attach } from "./lane"
import { afterExit } from "./leave"
import { readConfig } from "./options"
import { forecast, humanize, type Notice, type Selection } from "./predict"
import { settler } from "./settle"
import { SETTLE } from "./spring"
import { styles } from "./styles"

const selectionKey = (value: Selection | undefined) =>
  value ? `${value.providerID}/${value.modelID}/${value.variant ?? ""}` : ""

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

    // A session shows no tray until its inputs have settled (see settle.ts), so the host's first-load steps never flash one.
    // A tray that is true at the first settle appears at rest, as a restored session's does; later ones slide in.
    const [settled, setSettled] = createSignal<string>()
    let atRest = false

    const gate = settler((at) => {
      atRest = true
      setSettled(at)
      atRest = false
    })
    onCleanup(gate.stop)

    createKeyed(
      () => (messages().length > 0 && key() ? `${key()}|${selectionKey(selection())}|${notice()?.kind ?? ""}` : undefined),
      () => gate.watch(key(), selection() !== undefined),
      { otherwise: () => (gate.watch(undefined, false), setSettled(undefined)) },
    )

    const visible = createMemo(() => (key() && settled() === key() ? notice() : undefined), undefined, {
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
      () => (key() && visible() ? key() : undefined),
      (mounted) => {
        leaving.forEach((finish) => finish())
        const animate = !atRest
        const host = document.createElement("div")
        host.setAttribute("data-cache-warning", "")
        host.setAttribute("data-dock-surface", "tray")
        host.setAttribute("role", "status")
        host.setAttribute("data-state", animate ? "closed" : "rest")
        const dispose = render(() => <Text notice={visible} locale={ctx.locale.locale} t={ctx.t} />, host)
        // The closed state must be painted once in the lane before it opens, or there is nothing to transition from.
        const detach = attach(host, () => {
          if (!animate) return
          requestAnimationFrame(() => host.getAttribute("data-state") === "closed" && host.setAttribute("data-state", "open"))
        })

        let stop = () => {}
        let finished = false

        const finish = () => {
          if (finished) return
          finished = true
          leaving.delete(finish)
          stop()
          detach()
          dispose()
        }

        onCleanup(() => {
          if (ctx.signal.aborted || key() !== mounted || !host.isConnected) return finish()

          host.setAttribute("data-state", "closing")
          leaving.add(finish)
          stop = afterExit(host, finish, SETTLE * 1000 + 50)
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
