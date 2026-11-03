import { createKeyed, Plugin, SettingsPage, Store } from "@opencode/plugin/gui"
import { createSignal, onCleanup } from "solid-js"
import { normalize, provideSink, publishers, type NotifyInput } from "../../native-ui/src/notify-contract"
import { readRpcEvents } from "./events"
import { AlertsPage } from "./page"
import { createSink } from "./sink"
import { createHostSignals, type SignalData } from "./signals"
import { defaultSettings, SettingsSchema } from "./settings"

const definition = Plugin.define({
  stores: { settings: Store.global(SettingsSchema, defaultSettings) },
  i18n: {
    en: {
      "page.title": "Alerts",
      "page.description": "Toasts for what finishes, fails or waits for you. Plugins that publish alerts are listed under Sources.",
      "toasts.title": "Toasts",
      "kind.needs-you.title": "Needs you",
      "kind.needs-you.description": "A question or permission is waiting. Stays until answered.",
      "kind.error.title": "Error",
      "kind.error.description": "A run failed, or a scheduled task or monitor could not do its job.",
      "kind.done.title": "Done",
      "kind.done.description": "A run finished in a session you are not looking at.",
      "kind.info.title": "Info",
      "kind.info.description": "Quiet events: a monitor started, a snooze woke.",
      "onScreen.done.title": "Done, for the session on screen",
      "onScreen.done.description": "Also toast when the finished session is the one you are looking at.",
      "onScreen.info.title": "Info, for the session on screen",
      "onScreen.info.description": "Also toast info for the session you are looking at.",
      "system.title": "System notification and sound",
      "system.row.title": "Follows Settings > Notifications",
      "system.row.description": "The app's own switches and sound choices decide whether a banner shows or plays for plugin alerts.",
      "system.row.open": "Open",
      "sources.title": "Sources",
      "sources.description": "Show alerts from {{source}}",
      "sources.empty": "No plugin has published yet.",
      "open": "Open",
      "more": "{{count}} more from {{source}}",
      "done.title": "Run finished",
      "failed.title": "Run failed",
      "permission.title": "Permission needed",
      "question.title": "Question waiting",
      "fallback.title": "Session",
    },
  },
})

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((item, index) => item === b[index])

export default Plugin.define({
  ...definition,
  setup(ctx) {
    const builtinServer = () =>
      ctx.servers
        .list()
        .map((id) => ctx.servers.get(id))
        .find((server) => server?.builtin)?.id
    const activeSession = () => ctx.tabs.list().find((tab) => tab.active)?.session
    const hasTab = (server: string, sessionID: string) => ctx.tabs.list().some((tab) => tab.session?.server.id === server && tab.session.id === sessionID)

    const hub = createSink({
      self: ctx.id,
      now: () => Date.now(),
      later: (fn, ms) => {
        const timer = setTimeout(fn, ms)
        return () => clearTimeout(timer)
      },
      settings: () => ctx.stores.settings.value,
      presence: (n) => {
        const focused = document.hasFocus()
        const active = activeSession()
        return { focused, onScreen: focused && n.target !== undefined && active?.server.id === n.target.server && active.id === n.target.session }
      },
      show: (options) => ctx.toast.show(options),
      open: (target) => ctx.tabs.open({ server: target.server, id: target.session }, { focus: true }),
      attention: (options) => ctx.attention.notify(options),
      text: { open: ctx.t("open"), more: (count, source) => ctx.t("more", { count, source }) },
    })
    onCleanup(provideSink(hub.sink))
    onCleanup(hub.dispose)

    const [seen, setSeen] = createSignal<readonly string[]>([])
    const publishInput = (input: NotifyInput) => {
      const n = normalize(input, ctx.id)
      if (n) hub.sink.publish(n)
    }

    // Window focus: persistent alerts that waited for a focused window appear now.
    const onFocus = () => hub.focusGained()
    window.addEventListener("focus", onFocus)
    onCleanup(() => window.removeEventListener("focus", onFocus))

    // Server halves publish RPC events; every `rpc.<id>.notify` on the stream is one notification.
    createKeyed(
      () => ctx.client,
      () => {
        const abort = new AbortController()
        ctx.signal.addEventListener("abort", () => abort.abort(), { once: true })
        onCleanup(() => abort.abort())
        void readRpcEvents({
          signal: abort.signal,
          subscribe: (signal) => ctx.client.event.subscribe({ signal }) as AsyncIterable<{ type?: unknown; data?: unknown }>,
          onEvent: ({ source, data }) => {
            // A plugin with a GUI half announces itself and publishes its own events through `notifyFromServer`.
            if (publishers().includes(source)) return
            const n = normalize(data, source, Date.now(), builtinServer())
            if (!n) return
            if (!seen().includes(source)) setSeen([...seen(), source])
            hub.sink.publish(n)
          },
          wait: (ms, signal) =>
            new Promise((resolve) => {
              const timer = setTimeout(resolve, ms)
              signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true })
            }),
        })
      },
    )

    // Host signals: one listener set per server, rebuilt when a server appears, is replaced or reconnects.
    const reconciled = new Set<string>()
    createKeyed(
      () => ctx.servers.list().flatMap((id) => [ctx.servers.get(id)?.data, ctx.servers.get(id)?.connected]),
      () => {
        reconciled.clear()
        for (const id of ctx.servers.list()) {
          const server = ctx.servers.get(id)
          if (!server?.connected) continue
          const signals = createHostSignals({
            server: id,
            data: server.data as unknown as SignalData,
            hasTab: (sessionID) => hasTab(id, sessionID),
            publish: publishInput,
            clear: (key) => hub.sink.clear(ctx.id, key),
            later: (fn, ms) => {
              const timer = setTimeout(fn, ms)
              return () => clearTimeout(timer)
            },
            text: { done: ctx.t("done.title"), failed: ctx.t("failed.title"), permission: ctx.t("permission.title"), question: ctx.t("question.title"), fallbackTitle: ctx.t("fallback.title") },
          })
          onCleanup(signals.attach())
          // Requests asked before this window existed come back from the server, not from events.
          for (const tab of ctx.tabs.list()) {
            const session = tab.session
            if (session?.server.id !== id || reconciled.has(session.key)) continue
            reconciled.add(session.key)
            void signals.reconcile(session.id)
          }
        }
      },
      { equals: (previous, next) => sameList(previous, next) },
    )

    ctx.add(SettingsPage, {
      id: "alerts",
      title: ctx.t("page.title"),
      icon: "circle-exclamation",
      entries: [
        { id: "alerts-toasts", title: ctx.t("toasts.title"), description: ctx.t("page.description"), keywords: "notifications toast alerts done error needs you" },
        { id: "alerts-sources", title: ctx.t("sources.title"), keywords: "mute scheduler monitor plugin" },
      ],
      render: () => (
        <AlertsPage
          ctx={ctx}
          settings={() => ctx.stores.settings.value}
          update={(change) => ctx.stores.settings.update(change as never)}
          sources={() => [...new Set([...publishers().filter((id) => id !== ctx.id), ...seen()])].sort()}
        />
      ),
    })
  },
})
