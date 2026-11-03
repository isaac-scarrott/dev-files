import { Command, createKeyed, Plugin, SettingsPage, Store, Style, TitlebarItem } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { createDomHub } from "../../native-ui/src/dom-hub"
import { normalize, provideSink, publishers, type NotifyInput } from "../../native-ui/src/notify-contract"
import { createTabMarks, tabMarkCss, TAB_MARK_OWN } from "../../native-ui/src/tab-marks"
import { Ledger, markEntries, order, pickNext, sessionKey, stops, urgentCount, type SessionRef } from "./ledger"
import { readRpcEvents } from "./events"
import { NotificationsPage } from "./page"
import { createSink } from "./sink"
import { createHostSignals, type SignalData } from "./signals"
import { defaultMarks, defaultPending, defaultSettings, MarksSchema, PendingSchema, SettingsSchema } from "./settings"
import { unreadRoots, type UnreadData } from "./unread"

const definition = Plugin.define({
  stores: {
    settings: Store.global(SettingsSchema, defaultSettings),
    marks: Store.global(MarksSchema, defaultMarks),
    pending: Store.global(PendingSchema, defaultPending),
  },
  i18n: {
    en: {
      "page.title": "Notifications (plugins)",
      "page.description": "Toasts and tab marks for what finishes, fails or waits for you, from the app and from your plugins. Plugins that publish are listed under Sources.",
      "toasts.title": "Delivery",
      "column.toast": "Toast",
      "column.mark": "Mark",
      "next.title": "Go to next notification",
      "next.description": "Open the session that needs you, then one that failed, then one that finished",
      "titlebar.label.one": "{{count}} waiting",
      "titlebar.label.other": "{{count}} waiting",
      "titlebar.title.one": "{{count}} session needs you or failed",
      "titlebar.title.other": "{{count}} sessions need you or failed",
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
      "system.row.description": "The app's own switches and sound choices decide whether a banner shows or plays for plugin notifications.",
      "system.row.open": "Open",
      "sources.title": "Sources",
      "sources.description": "Show notifications from {{source}}",
      "sources.empty": "No plugin has published yet.",
      "open": "Open",
      "copyDetails": "Copy details",
      "copyFailed": "Couldn't copy the details",
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

    // Marks, the titlebar count and go-to-next read one ledger of what waits on a session. Plugin-sourced entries are kept in
    // storage so the marks survive a reload; the host's own events are rebuilt by the signals below.
    const [version, setVersion] = createSignal(0)
    let persistTimer: ReturnType<typeof setTimeout> | undefined
    const writePending = () => {
      persistTimer = undefined
      const entries = ledger.stored().map(({ source, key, kind, severity, title, server, session, at }) => ({ source, key, kind, severity, title, server, session, at }))
      if (JSON.stringify(entries) === JSON.stringify(ctx.stores.pending.value.entries)) return
      ctx.stores.pending.update(((draft: { entries: typeof entries }) => void (draft.entries = entries)) as never)
    }
    // A burst of events changes the ledger hundreds of times in one task: readers (marks, count) run once after it.
    let announced = false
    const ledger = new Ledger(() => {
      persistTimer ??= setTimeout(writePending, 500)
      if (announced) return
      announced = true
      queueMicrotask(() => {
        announced = false
        setVersion((value) => value + 1)
      })
    })
    onCleanup(() => {
      if (persistTimer === undefined) return
      clearTimeout(persistTimer)
      writePending()
    })
    ledger.load(ctx.stores.pending.value.entries)

    const hub = createSink({
      track: { put: (n, host) => ledger.put(n, host), remove: (source, key) => void ledger.remove(source, key) },
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
      copy: (text) => navigator.clipboard.writeText(text),
      attention: (options) => ctx.attention.notify(options),
      text: { open: ctx.t("open"), copyDetails: ctx.t("copyDetails"), copyFailed: ctx.t("copyFailed"), more: (count, source) => ctx.t("more", { count, source }) },
    })
    onCleanup(provideSink(hub.sink))
    onCleanup(hub.dispose)

    const [seen, setSeen] = createSignal<readonly string[]>([])
    const publishInput = (input: NotifyInput) => {
      const n = normalize(input, ctx.id)
      if (n) hub.sink.publish(n)
    }

    // Window focus: persistent notifications that waited for a focused window appear now.
    const [focused, setFocused] = createSignal(document.hasFocus())
    const onFocus = () => {
      setFocused(true)
      hub.focusGained()
    }
    const onBlur = () => setFocused(false)
    window.addEventListener("focus", onFocus)
    window.addEventListener("blur", onBlur)
    onCleanup(() => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("blur", onBlur)
    })

    // Looking at a session sees what waits on it (the host clears its own dot the same way).
    const activeRef = (): SessionRef | undefined => {
      const session = activeSession()
      return session ? { server: session.server.id, session: session.id } : undefined
    }
    createKeyed(
      () => (focused() ? (activeRef() ? sessionKey(activeRef()!) : undefined) : undefined),
      () => {
        const ref = activeRef()
        if (!ref) return
        ledger.clearSession(ref)
        hub.seen(ref.server, ref.session)
      },
    )

    // Tab marks for events that start no turn. The host's own marks cover everything it knows about.
    const tabSessions = createMemo(() => new Map(ctx.tabs.list().flatMap((tab) => (tab.session ? [[tab.key, sessionKey({ server: tab.session.server.id, session: tab.session.id })] as const] : []))))
    const marks = createMemo(() => (version(), markEntries(ledger.list(), (kind) => ctx.stores.marks.value[kind])))
    const markOf = (tabKey: string) => {
      const sessionRef = tabSessions().get(tabKey)
      const entry = sessionRef ? marks().get(sessionRef) : undefined
      return entry ? { severity: entry.severity, label: entry.title } : undefined
    }
    const dom = createDomHub(document, (fn) => requestAnimationFrame(fn), (id) => cancelAnimationFrame(id), TAB_MARK_OWN, ctx.id)
    const tabMarks = createTabMarks({ doc: document, hub: dom, mark: markOf, active: () => marks().size > 0 })
    createKeyed(
      () => (marks().size === 0 ? "m:" : `m:${[...tabSessions()].map(([key]) => { const mark = markOf(key); return mark ? `${key}|${mark.severity}|${mark.label}` : "" }).join("\n")}`),
      () => tabMarks.sync(),
    )
    ctx.add(Style, tabMarkCss)

    // Go to next notification: needs you, then error, then done (the host's unread roots included), the open session never.
    let last: SessionRef | undefined
    let walk: readonly SessionRef[] = []
    const [walked, setWalked] = createSignal(0)
    const stopsNow = () => {
      const unread = ctx.servers.list().flatMap((id) => {
        const server = ctx.servers.get(id)
        return server?.connected ? unreadRoots(id, server.data as unknown as UnreadData) : []
      })
      return order([...stops(ledger.list()), ...unread])
    }
    const goNext = () => {
      const ordered = stopsNow()
      const next = pickNext(ordered, activeRef(), last, walk)
      // Nothing to jump to: decline the key so it reaches whatever has focus (Cmd+I in the composer).
      if (!next) return false
      last = next
      walk = ordered
      setWalked((count) => count + 1)
      ctx.tabs.open({ server: next.server, id: next.session }, { focus: true })
      ledger.clearSession(next)
    }
    // The key is shown on a waiting request's toast only while it opens that very session: one session waits and it is the next stop.
    const hint = createMemo(() => {
      version()
      walked()
      const waiting = new Set(ledger.list().filter((entry) => entry.kind === "needs-you").map((entry) => sessionKey(entry)))
      if (waiting.size !== 1) return undefined
      const next = pickNext(stopsNow(), activeRef(), last, walk)
      if (!next || !waiting.has(sessionKey(next))) return undefined
      return ctx.keybinds.keybind(`${ctx.id}.go-to-next`).join("").replace(/["\\]/g, "") || undefined
    })
    // `toast-style` reads this variable; without it (or with no value) a toast shows no key.
    ctx.add(Style, () => (hint() ? `:root { --toast-style-go-next-hint: "${hint()}"; }` : undefined))
    const urgent = createMemo(() => (version(), urgentCount(ledger.list())))
    ctx.add(
      Command,
      (): Command => ({
        id: "go-to-next",
        title: ctx.t("next.title"),
        description: ctx.t("next.description"),
        keywords: "notification inbox alert unread waiting error needs you jump",
        section: "navigation",
        bind: "mod+i",
        run: goNext,
      }),
    )
    ctx.add(TitlebarItem, (): TitlebarItem | undefined => {
      const count = urgent()
      if (count === 0) return undefined
      const keys = ctx.keybinds.keybind(`${ctx.id}.go-to-next`).join("")
      const title = ctx.plural("titlebar.title", count)
      return { id: "next", icon: "notifications", label: ctx.plural("titlebar.label", count), title: keys ? `${title} (${keys})` : title, run: () => void goNext() }
    })

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
      // The page was first called Alerts; the id stays so links and search entries keep working.
      id: "alerts",
      title: ctx.t("page.title"),
      icon: "circle-exclamation",
      entries: [
        { id: "alerts-toasts", title: ctx.t("toasts.title"), description: ctx.t("page.description"), keywords: "notifications toast mark alerts done error needs you" },
        { id: "alerts-sources", title: ctx.t("sources.title"), keywords: "mute scheduler monitor plugin" },
      ],
      render: () => (
        <NotificationsPage
          ctx={ctx}
          settings={() => ctx.stores.settings.value}
          update={(change) => ctx.stores.settings.update(change as never)}
          marks={() => ctx.stores.marks.value}
          updateMarks={(change) => ctx.stores.marks.update(change as never)}
          sources={() => [...new Set([...publishers().filter((id) => id !== ctx.id), ...seen()])].sort()}
        />
      ),
    })
  },
})
