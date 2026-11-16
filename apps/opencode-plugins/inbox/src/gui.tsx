import { createKeyed, Panel, Plugin, Style, TitlebarItem } from "@opencode/plugin/gui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { acquirePublisher, clearNotification, notify } from "../../native-ui/src/notify-contract.js"
import { pendingRequests, syncRequests } from "../../native-ui/src/requests.js"
import { createTopNotifier } from "./notify-top.js"
import { parseOptions } from "./options.js"
import { InboxPanel, inboxCss, type RowActions } from "./panel.js"
import { rank } from "./rank.js"
import { Inbox, type AskView } from "./rpc.js"
import { buildRows, type Row, type SessionView } from "./rows.js"

const NOTIFY_KEY = "inbox:top"

/** The last path segment of a project directory, as the sidebar names it. */
const basename = (path: string) => path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? ""

interface SessionInfo {
  readonly id: string
  readonly title?: string
  readonly projectID: string
}

interface FieldOption {
  readonly value: string
  readonly label: string
}

/**
 * The slice of a server's synced data this half reads. Spelled out here rather than imported from the client package, which
 * a plugin does not depend on (as `notifications` does for its host signals).
 */
interface ServerData {
  readonly session: {
    list(): readonly SessionInfo[]
    get(sessionID: string): SessionInfo | undefined
    root(sessionID: string): string
    family(sessionID: string): readonly string[]
    status(sessionID: string): "idle" | "running"
    permission: {
      list(sessionID: string): readonly { id: string; action?: string; resources?: readonly string[]; message?: string }[] | undefined
      sessions(): readonly string[]
      sync(sessionID: string): Promise<void>
      reply(input: { sessionID: string; requestID: string; decision: "once" | "always" | "reject" }): Promise<void>
    }
    form: {
      list(sessionID: string):
        | readonly { id: string; metadata?: Record<string, unknown>; fields?: readonly { key: string; description?: string; options?: readonly FieldOption[]; custom?: boolean }[] }[]
        | undefined
      sessions(): readonly string[]
      sync(sessionID: string): Promise<void>
      reply(input: { sessionID: string; formID: string; answer: Record<string, string> }): Promise<void>
    }
  }
  readonly project: { get(projectID: string): { canonical?: string } | undefined }
}

export default Plugin.define({
  i18n: {
    en: {
      title: "Inbox",
      empty: "Nothing is waiting for you.",
      allowOnce: "Allow once",
      reject: "Reject",
      answer: "Answer",
      answerPlaceholder: "Your answer…",
      dismiss: "Dismiss",
      open: "Open",
      notifyTitle: "Inbox · {{count}} waiting",
      couldNotAnswer: "Could not answer that",
      couldNotOpen: "Could not answer the request",
    },
  },
  setup(ctx) {
    const options = parseOptions(ctx.options)
    // An inbox is one list, so the app's own waiting-request toasts stand down while it runs; its marks stay.
    onCleanup(acquirePublisher(ctx.id, { owns: ["host-requests"] }))
    ctx.add(Style, inboxCss)

    const builtin = () =>
      ctx.servers
        .list()
        .map((id) => ctx.servers.get(id))
        .find((server) => server?.builtin)?.id
    const dataOf = (serverID: string) => ctx.servers.get(serverID)?.data as unknown as ServerData | undefined

    // Every session's pending lists are loaded once; after that the host's stores keep them current.
    const requested = new Set<string>()
    createKeyed(
      () =>
        ctx.servers.list().flatMap((id) => {
          const data = ctx.servers.get(id)?.connected ? dataOf(id) : undefined
          return data ? data.session.list().map((session) => `${id}\u0000${session.id}`) : []
        }),
      (keys) => {
        for (const key of keys) {
          if (requested.has(key)) continue
          const at = key.indexOf("\u0000")
          const id = key.slice(0, at)
          const sessionID = key.slice(at + 1)
          const data = ctx.servers.get(id)?.connected ? dataOf(id) : undefined
          if (!data) continue
          requested.add(key)
          void syncRequests(data, sessionID).catch(() => requested.delete(key))
        }
      },
    )

    // The asks the server half holds; its `changed` event says when to read them again.
    interface InboxClient {
      list(input: Record<string, never>): Promise<unknown>
      answer(input: { id: number; answer: string }): Promise<unknown>
      dismiss(input: { id: number }): Promise<unknown>
      events: { on(name: string, listener: () => void): () => void }
    }
    const [asks, setAsks] = createSignal<readonly AskView[]>([])
    const inbox = () => (ctx.client as unknown as { rpc?: (definition: typeof Inbox) => InboxClient }).rpc?.(Inbox)
    createKeyed(
      () => ctx.client,
      (client) => {
        const rpc = client.rpc?.(Inbox)
        if (!rpc) return
        const load = () => {
          void rpc
            .list({})
            .then((reply) => {
              if (ctx.signal.aborted) return
              setAsks((reply as { asks: AskView[] }).asks)
            })
            .catch(() => undefined)
        }
        onCleanup(rpc.events.on("changed", load))
        load()
      },
    )

    const sessionView = (serverID: string, sessionID: string): SessionView | undefined => {
      const data = ctx.servers.get(serverID)?.connected ? dataOf(serverID) : undefined
      if (!data) return undefined
      const info = data.session.get(sessionID)
      if (!info) return undefined
      const project = data.project.get(info.projectID)
      return {
        title: info.title ?? "",
        project: basename(project?.canonical ?? ""),
        root: data.session.root(sessionID),
        running: data.session.status(sessionID) === "running",
      }
    }

    const familyOf = (serverID: string, sessionID: string): readonly string[] => {
      const data = ctx.servers.get(serverID)?.connected ? dataOf(serverID) : undefined
      return data ? data.session.family(sessionID) : []
    }

    const requests = createMemo(() =>
      ctx.servers.list().flatMap((id) => {
        const data = ctx.servers.get(id)?.connected ? dataOf(id) : undefined
        return data ? pendingRequests(data, { server: id }) : []
      }),
    )

    // Ages move while nothing else does, so one minute tick rebuilds them.
    const [now, setNow] = createSignal(Date.now())
    const ticker = setInterval(() => setNow(Date.now()), 60_000)
    onCleanup(() => clearInterval(ticker))

    const firstSeen = new Map<string, number>()
    const seen = new Map<string, number>()
    const rows = createMemo(() =>
      buildRows({
        now: now(),
        builtin: builtin(),
        requests: requests(),
        asks: asks(),
        session: sessionView,
        family: familyOf,
        firstSeen,
        seen,
      }),
    )
    const ranked = createMemo(() => rank(rows(), options.reaskWeight))

    // One notification for the whole list: what tops it, and a blocked ask after 15 and 60 minutes.
    const notifier = createTopNotifier({ everyMs: options.notifyEveryMin * 60_000, escalateMin: options.escalateMin })
    let notified = false
    const evaluate = () => {
      const list = ranked()
      const top = list[0]
      const decision = notifier.consider({
        now: Date.now(),
        ...(top ? { top: { id: top.key, blocked: top.blocked, ageMin: top.ageMin } } : {}),
        blocked: list.filter((row) => row.blocked).map((row) => ({ id: row.key, ageMin: row.ageMin })),
      })
      if (!top) {
        if (notified) clearNotification(ctx, NOTIFY_KEY)
        notified = false
        return
      }
      if (!decision.notify) return
      notified = true
      notify(ctx, {
        kind: "needs-you",
        key: NOTIFY_KEY,
        persistent: true,
        title: ctx.t("notifyTitle", { count: list.length }),
        body: [[top.project, top.title].filter(Boolean).join(" · "), top.text].filter(Boolean).join(" — "),
        target: { server: top.server, session: top.session },
      })
    }
    createKeyed(
      () => ranked().map((row) => `${row.key}:${row.blocked ? 1 : 0}:${Math.floor(row.ageMin)}`).join("|"),
      () => evaluate(),
    )

    const fail = (error: unknown) => {
      if (ctx.signal.aborted) return
      console.warn("inbox: request failed:", error)
      ctx.toast.show({ title: ctx.t("couldNotOpen"), description: error instanceof Error ? error.message : String(error), variant: "error" })
    }

    const rowActions: RowActions = {
      open: (row) => ctx.tabs.open({ server: row.server, id: row.session }, { focus: true }),
      allow: (row) => {
        void dataOf(row.server)?.session.permission.reply({ sessionID: row.session, requestID: row.id, decision: "once" }).catch(fail)
      },
      reject: (row) => {
        void dataOf(row.server)?.session.permission.reply({ sessionID: row.session, requestID: row.id, decision: "reject" }).catch(fail)
      },
      choose: (row, value) => {
        const field = row.field
        if (!field) return
        void dataOf(row.server)?.session.form.reply({ sessionID: row.session, formID: row.id, answer: { [field.key]: value } }).catch(fail)
      },
      answer: (row: Row, text: string) => {
        const rpc = inbox()
        if (!rpc || row.askId === undefined) return
        void rpc
          .answer({ id: row.askId, answer: text })
          .catch((error) => {
            if (ctx.signal.aborted) return
            console.warn("inbox: could not answer:", error)
            ctx.toast.show({ title: ctx.t("couldNotAnswer"), description: error instanceof Error ? error.message : String(error), variant: "error" })
          })
      },
      dismiss: (row: Row) => {
        const rpc = inbox()
        if (!rpc || row.askId === undefined) return
        void rpc.dismiss({ id: row.askId }).catch(fail)
      },
    }

    // The pinned tab's label follows the count; a new tab object is what re-renders the trigger.
    let tab: { count: number; value: ReturnType<typeof tabValue> } | undefined
    const tabValue = (count: number) => ({ id: "inbox", title: `Inbox · ${count}`, pinned: true, closable: false, draggable: false } as const)
    const tabNow = () => {
      const count = ranked().length
      if (tab?.count === count) return tab.value
      const value = tabValue(count)
      tab = { count, value }
      return value
    }
    ctx.add(Panel, {
      id: "inbox",
      region: "side",
      list: () => [tabNow()],
      render: () => <InboxPanel ctx={ctx} rows={ranked} actions={rowActions} />,
    })

    ctx.add(TitlebarItem, () => {
      const count = ranked().length
      return count > 0 ? { id: "inbox", label: String(count), title: ctx.t("title"), icon: "notifications" as const } : undefined
    })
  },
})
