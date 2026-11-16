import type { NotifyInput } from "../../native-ui/src/notify-contract"
import { pendingRequests, requestPending, REQUEST_FORM_KINDS, syncRequests, type RequestData } from "../../native-ui/src/requests"

interface SessionLike {
  readonly title?: string
  readonly parentID?: string
  readonly time?: { readonly updated?: number }
}

interface PermissionLike {
  readonly id: string
  readonly action?: string
  readonly resources?: readonly string[]
  readonly message?: string
}

interface FormLike {
  readonly id: string
  readonly metadata?: Record<string, unknown>
  readonly fields?: readonly { readonly key: string; readonly title?: string; readonly description?: string; readonly options?: readonly { readonly value: string; readonly label: string }[]; readonly custom?: boolean }[]
}

/** The slice of a server's synced `data` that the host-derived signals read. */
export interface SignalData {
  on(type: string, handler: (event: { data: unknown }) => void): () => void
  session: {
    get(sessionID: string): SessionLike | undefined
    root(sessionID: string): string
    family(sessionID: string): readonly string[]
    status(sessionID: string): "idle" | "running"
    sync(sessionID: string): Promise<void>
    permission: { list(sessionID: string): readonly PermissionLike[] | undefined; sync(sessionID: string): Promise<void> }
    form: { list(sessionID: string): readonly FormLike[] | undefined; sync(sessionID: string): Promise<void> }
  }
}

export interface SignalDeps {
  readonly server: string
  readonly data: SignalData
  /** A session with a tab open, which is all the host itself notifies for. */
  readonly hasTab: (sessionID: string) => boolean
  readonly publish: (input: NotifyInput) => void
  readonly clear: (key: string) => void
  /** Runs `fn` later; returns the cancel. */
  readonly later: (fn: () => void, ms: number) => () => void
  readonly text: {
    readonly done: string
    readonly failed: string
    readonly permission: string
    readonly question: string
    readonly fallbackTitle: string
  }
}

/** A request is answered or auto-approved quickly: wait this long before raising a persistent toast for it. */
export const REQUEST_DELAY_MS = 250

export const keys = {
  done: (sessionID: string) => `host:done:${sessionID}`,
  error: (sessionID: string) => `host:error:${sessionID}`,
  permission: (requestID: string) => `host:perm:${requestID}`,
  form: (formID: string) => `host:form:${formID}`,
}

const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {})

/**
 * Turns the host's own session events into notifications of the shared model, with no plugin-specific code and without
 * repeating the host's system notification or sound (the host sends those itself). Event driven: nothing runs while
 * nothing happens. `attach` listens to one server's data; `reconcile` rebuilds persistent requests the events (which are
 * ephemeral) did not tell this window about.
 */
export function createHostSignals(deps: SignalDeps) {
  const { data, server } = deps
  const cancels = new Set<() => void>()

  const defer = (fn: () => void, ms: number) => {
    const cancel = deps.later(() => {
      cancels.delete(cancel)
      fn()
    }, ms)
    cancels.add(cancel)
  }

  const lookup = async (sessionID: string) => {
    const known = data.session.get(sessionID)
    if (known) return known
    await data.session.sync(sessionID).catch(() => undefined)
    return data.session.get(sessionID)
  }

  const hasRunningChild = (sessionID: string) =>
    data.session.family(sessionID).some((child) => child !== sessionID && data.session.get(child)?.parentID === sessionID && data.session.status(child) === "running")

  const succeeded = async (sessionID: string) => {
    if (hasRunningChild(sessionID)) return
    const session = await lookup(sessionID)
    if (!session || session.parentID || !deps.hasTab(sessionID)) return
    deps.publish({ kind: "done", title: deps.text.done, body: session.title, key: keys.done(sessionID), target: { server, session: sessionID } })
  }

  const failed = async (sessionID: string, error: unknown) => {
    const session = await lookup(sessionID)
    const root = data.session.root(sessionID)
    const target = deps.hasTab(sessionID) ? sessionID : root
    if (!deps.hasTab(target)) return
    // The toast opens the target, so it names the target.
    const named = target === sessionID ? session : await lookup(target)
    const message = record(error).message
    deps.publish({
      kind: "error",
      title: deps.text.failed,
      body: typeof message === "string" && message ? [named?.title, message].filter(Boolean).join(" · ") : (named?.title ?? deps.text.fallbackTitle),
      key: keys.error(sessionID),
      target: { server, session: target },
    })
  }

  const pending = (kind: "permission" | "form", sessionID: string, id: string) => requestPending(data, kind, sessionID, id)

  const request = async (kind: "permission" | "form", sessionID: string, id: string, title: string) => {
    const session = await lookup(sessionID)
    if (!session) return
    const target = deps.hasTab(sessionID) ? sessionID : data.session.root(sessionID)
    if (!deps.hasTab(target)) return
    const key = kind === "permission" ? keys.permission(id) : keys.form(id)
    defer(() => {
      if (!pending(kind, sessionID, id)) return
      deps.publish({ kind: "needs-you", persistent: true, title, body: session.title, key, target: { server, session: target } })
    }, REQUEST_DELAY_MS)
  }

  const formKind = (value: unknown) => record(record(record(value).form).metadata).kind

  return {
    /** Listens to one server's events; the returned function stops it and cancels what is waiting. */
    attach(): () => void {
      const stops = [
        data.on("session.execution.succeeded", (event) => void succeeded(String(record(event.data).sessionID))),
        data.on("session.execution.failed", (event) => void failed(String(record(event.data).sessionID), record(event.data).error)),
        data.on("permission.asked", (event) => void request("permission", String(record(event.data).sessionID), String(record(event.data).id), deps.text.permission)),
        data.on("form.created", (event) => {
          if (!REQUEST_FORM_KINDS.has(formKind(event.data))) return
          const form = record(record(event.data).form)
          void request("form", String(form.sessionID), String(form.id), deps.text.question)
        }),
        data.on("permission.replied", (event) => deps.clear(keys.permission(String(record(event.data).requestID)))),
        data.on("form.replied", (event) => deps.clear(keys.form(String(record(event.data).id)))),
        data.on("form.cancelled", (event) => deps.clear(keys.form(String(record(event.data).id)))),
      ]
      return () => {
        for (const stop of stops) stop()
        for (const cancel of cancels) cancel()
        cancels.clear()
      }
    },
    /** Reads what the server holds for a session and raises the requests still waiting for an answer. */
    async reconcile(sessionID: string): Promise<void> {
      await syncRequests(data, sessionID).catch(() => undefined)
      const session = data.session.get(sessionID)
      const body = session?.title
      const target = { server, session: sessionID }
      for (const item of pendingRequests(data, { server, session: sessionID })) {
        deps.publish({
          kind: "needs-you",
          persistent: true,
          title: item.kind === "permission" ? deps.text.permission : deps.text.question,
          body,
          key: item.kind === "permission" ? keys.permission(item.id) : keys.form(item.id),
          target,
        })
      }
    },
  }
}
