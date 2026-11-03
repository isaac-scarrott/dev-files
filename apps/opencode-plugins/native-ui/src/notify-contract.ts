// The notification hub convention. Every plugin that has something to tell the user publishes through `notify(ctx, n)`;
// the optional `notifications` plugin provides the sink that owns settings, de-duplication, system notifications, the
// focus rule and go-to-next. Without a sink each plugin falls back to a toast of its own, so any subset of plugins works.
//
// Plugins are separate bundles that each include this file, so the registry lives on `globalThis` under a versioned
// `Symbol.for` key (as the shared MutationObserver of the injected rows does). The suffix of the key is the protocol major:
// a bundle with an incompatible shape uses another key and never misreads this one. Nothing here holds a reference to a
// plugin: publishers look the sink up on every call, so a reload of any plugin leaves nothing stale behind.
//
// No imports: the file stays valid for a server half (which publishes an RPC event, see `serverNotificationSchema`) and for the GUI.

/** Protocol major. A sink lists the majors it accepts; a publisher sends the highest it speaks that the sink accepts. */
export const NOTIFY_PROTOCOL = 1

export const NOTIFY_KEY = Symbol.for(`opencode-plugins.notify.v${NOTIFY_PROTOCOL}`)

/** `done`: a run finished. `needs-you`: waits for an answer. `error`: something failed. `info`: quiet. */
export type NotifyKind = "done" | "needs-you" | "error" | "info"

export const NOTIFY_KINDS: readonly NotifyKind[] = ["needs-you", "error", "done", "info"]

export type NotifySeverity = "info" | "success" | "warning" | "error"

/** The session a notification is about, in the host's terms (`ServerRef.id`, session id). */
export interface NotifyTarget {
  readonly server: string
  readonly session: string
}

/** What choosing the notification does. Both open the session; `open-message` also scrolls to the message. */
export type NotifyAction =
  | { readonly type: "open-session" }
  | { readonly type: "open-message"; readonly message: string }

/** What travels between plugins and the hub. Every field a reader does not know is ignored. */
export interface Notification {
  readonly v: number
  readonly kind: NotifyKind
  readonly severity: NotifySeverity
  readonly target?: NotifyTarget
  readonly title: string
  readonly body?: string
  /** The publishing plugin's id (`ctx.id`), or the server half's. */
  readonly source: string
  /** Same key replaces the earlier notification of the same source; `clearNotification` retracts it. */
  readonly key: string
  readonly action?: NotifyAction
  /** Stays until retracted or acted on (a question waiting for an answer). Defaults to false. */
  readonly persistent: boolean
  readonly at: number
}

/** What a publisher writes. `source` comes from the context, `at` from the clock. */
export interface NotifyInput {
  readonly kind: NotifyKind
  readonly title: string
  readonly severity?: NotifySeverity
  readonly target?: NotifyTarget
  readonly body?: string
  readonly key?: string
  readonly action?: NotifyAction
  readonly persistent?: boolean
}

/** The part of a GUI `ctx` this file uses, so a test or a server half can stand in for one. */
export interface NotifyContext {
  readonly id: string
  readonly toast: {
    show(options: {
      title: string
      description?: string
      variant?: "default" | "success" | "error" | "loading"
      persistent?: boolean
      actions?: readonly { label: string; run(): void }[]
    }): { dismiss(): void }
  }
  /** Lets the fallback toast offer Open. Absent: the toast has no action. */
  readonly tabs?: { open(session: { server: string; id: string }, options?: { focus?: boolean }): void }
  /** Lets `notifyFromServer` name the server a server half's notification belongs to: the desktop's own. */
  readonly servers?: { list(): readonly string[]; get(id: string): { readonly builtin: boolean } | undefined }
}

/** Provided by the `notifications` plugin. */
export interface NotifySink {
  readonly id: string
  /** Protocol majors this sink reads. */
  readonly accepts: readonly number[]
  publish(notification: Notification): void
  clear(source: string, key: string): void
}

interface Registry {
  readonly v: number
  readonly publishers: Map<string, number>
  readonly sinks: NotifySink[]
}

const holder = () => globalThis as unknown as Record<symbol, Registry | undefined>

function registry(create: boolean): Registry | undefined {
  const existing = holder()[NOTIFY_KEY]
  if (existing || !create) return existing
  const made: Registry = { v: NOTIFY_PROTOCOL, publishers: new Map(), sinks: [] }
  holder()[NOTIFY_KEY] = made
  return made
}

function release(): void {
  const found = registry(false)
  if (found && found.publishers.size === 0 && found.sinks.length === 0) delete holder()[NOTIFY_KEY]
}

/**
 * A plugin announces itself for as long as it runs: call inside `setup` and return the result from the cleanup. It lets
 * the settings page list the sources that exist. Reference-counted per source id, so a reload (new setup before or after the
 * old cleanup) never drops the entry early.
 */
export function acquirePublisher(source: string): () => void {
  const found = registry(true)!
  found.publishers.set(source, (found.publishers.get(source) ?? 0) + 1)
  let done = false
  return () => {
    if (done) return
    done = true
    const current = registry(false)
    if (!current) return
    const count = (current.publishers.get(source) ?? 0) - 1
    if (count > 0) current.publishers.set(source, count)
    else current.publishers.delete(source)
    release()
  }
}

/** The ids of the plugins currently announced, sorted. */
export const publishers = (): string[] => [...(registry(false)?.publishers.keys() ?? [])].sort()

/**
 * The `notifications` plugin installs its sink. The newest sink that speaks a protocol major we know answers; the older one
 * answers again when it is removed, so a reload that overlaps the old and the new run never leaves the hub without one.
 */
export function provideSink(sink: NotifySink): () => void {
  const found = registry(true)!
  found.sinks.push(sink)
  let done = false
  return () => {
    if (done) return
    done = true
    const current = registry(false)
    if (!current) return
    const index = current.sinks.indexOf(sink)
    if (index !== -1) current.sinks.splice(index, 1)
    release()
  }
}

/** The sink that answers, or undefined when none is installed or none speaks this file's major. */
export function activeSink(): NotifySink | undefined {
  const sinks = registry(false)?.sinks ?? []
  for (let index = sinks.length - 1; index >= 0; index--) if (sinks[index].accepts.includes(NOTIFY_PROTOCOL)) return sinks[index]
}

const TITLE_MAX = 200
const BODY_MAX = 500
const KEY_MAX = 200

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const KIND_SEVERITY: Record<NotifyKind, NotifySeverity> = { done: "success", "needs-you": "warning", error: "error", info: "info" }

const isKind = (value: unknown): value is NotifyKind => typeof value === "string" && (NOTIFY_KINDS as readonly string[]).includes(value)

const isSeverity = (value: unknown): value is NotifySeverity => value === "info" || value === "success" || value === "warning" || value === "error"

const text = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined)

/** The key a publisher gets when it gives none: one live notification per source, kind and session. */
export const defaultKey = (source: string, kind: NotifyKind, target?: NotifyTarget) => `${source}:${kind}:${target ? `${target.server}/${target.session}` : "-"}`

/**
 * Reads anything that claims to be a notification: an RPC event from a server half, a message from a newer or older plugin.
 * Unknown kinds become `info` (quiet is the safe default), unknown fields are dropped, text is clipped, and the result has
 * every field set. Returns undefined when there is nothing to show (no title) or the shape is not an object. `server` names
 * the server a payload without `target.server` belongs to: a server half does not know the host's id for its own server.
 */
export function normalize(raw: unknown, source: string, now: number = Date.now(), server?: string): Notification | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const input = raw as Record<string, unknown>
  const title = text(input.title)
  if (!title) return undefined
  const kind: NotifyKind = isKind(input.kind) ? input.kind : "info"
  const rawTarget = input.target as Record<string, unknown> | undefined
  const targetServer = text(rawTarget?.server) ?? server
  const session = text(rawTarget?.session)
  const target = targetServer && session ? { server: targetServer, session } : undefined
  const rawAction = input.action as Record<string, unknown> | undefined
  const message = text(rawAction?.message)
  const action: NotifyAction | undefined =
    rawAction?.type === "open-message" && message ? { type: "open-message", message } : target ? { type: "open-session" } : undefined
  const body = text(input.body)
  return {
    v: NOTIFY_PROTOCOL,
    kind,
    severity: isSeverity(input.severity) ? input.severity : KIND_SEVERITY[kind],
    target,
    title: clip(title, TITLE_MAX),
    body: body ? clip(body, BODY_MAX) : undefined,
    source,
    key: clip(text(input.key) ?? defaultKey(source, kind, target), KEY_MAX),
    action,
    persistent: input.persistent === true,
    at: typeof input.at === "number" && Number.isFinite(input.at) ? input.at : now,
  }
}

/** Where a notification went. `none`: nothing was shown (quiet kinds without a hub). */
export type NotifyOutcome = "hub" | "fallback" | "none"

const handles = new WeakMap<object, Map<string, { dismiss(): void }>>()

const fallbackKinds: ReadonlySet<NotifyKind> = new Set<NotifyKind>(["needs-you", "error", "done"])

/** The host holds this Web Lock (shared) in every window that has focus (`shell/notifications/coordinator.ts`), so no holder means no window is focused. */
const HOST_FOCUS_LOCK = "opencode:notification-focus"
const CLAIM_LOCK = "opencode-plugins.notify.fallback"
const CLAIM_STORE = "opencode-plugins.notify.fallback"
const CLAIM_MAX = 200

/**
 * Which window shows a fallback toast when the app has several. Each window runs every plugin, so one server event reaches
 * all of them: the focused window shows it, and when none has focus one window does (the first to claim the event). Undefined
 * when the page cannot coordinate (no `document` or Web Locks: a server half, a test): the caller shows at once.
 */
function windowGate(): ((id: string) => Promise<boolean>) | undefined {
  if (typeof document === "undefined" || typeof navigator === "undefined" || !navigator.locks) return undefined
  const locks = navigator.locks
  const seen = new Set<string>()
  const claim = (id: string): boolean => {
    if (seen.has(id)) return false
    seen.add(id)
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(CLAIM_STORE) ?? "[]")
      const ids = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : []
      if (ids.includes(id)) return false
      localStorage.setItem(CLAIM_STORE, JSON.stringify([...ids, id].slice(-CLAIM_MAX)))
    } catch {
      // The in-memory claim still keeps this window from showing it twice.
    }
    return true
  }
  return async (id) => {
    if (document.hasFocus()) return true
    const someoneFocused = await locks.query().then((state) => (state.held ?? []).some((lock) => lock.name === HOST_FOCUS_LOCK), () => false)
    if (someoneFocused) return false
    return locks.request(CLAIM_LOCK, async () => claim(id)).catch(() => true)
  }
}

function fallback(ctx: NotifyContext, notification: Notification): NotifyOutcome {
  if (!fallbackKinds.has(notification.kind)) return "none"
  const open = ctx.tabs && notification.target
  const target = notification.target
  const live = handles.get(ctx) ?? new Map()
  handles.set(ctx, live)
  live.get(notification.key)?.dismiss()
  const show = () =>
    ctx.toast.show({
      title: notification.title,
      description: notification.body,
      variant: notification.kind === "error" ? "error" : notification.kind === "done" ? "success" : "default",
      persistent: notification.persistent,
      actions: open && target ? [{ label: "Open", run: () => ctx.tabs!.open({ server: target.server, id: target.session }, { focus: true }) }] : undefined,
    })
  const gate = windowGate()
  if (!gate) {
    live.set(notification.key, show())
    return "fallback"
  }
  // Decided a moment later (Web Locks answer asynchronously); a newer notification with the key, or a clear, cancels this one.
  const pending = { dismiss() {} }
  live.set(notification.key, pending)
  void gate(`${ctx.id}\u0000${notification.key}\u0000${notification.at}`).then(
    (yes) => {
      if (live.get(notification.key) !== pending) return
      if (yes) live.set(notification.key, show())
      else live.delete(notification.key)
    },
    () => undefined,
  )
  return "fallback"
}

/**
 * Publishes through the hub when a sink is installed, else shows the plugin's own toast (`needs-you`, `error`, `done`;
 * `info` stays quiet). Never throws: a failing sink falls back, a failing toast is swallowed.
 */
export function notify(ctx: NotifyContext, input: NotifyInput): NotifyOutcome {
  const notification = normalize(input, ctx.id)
  return notification ? deliver(ctx, notification) : "none"
}

/**
 * A plugin's GUI half passes on what its server half emitted as `notify` (see `serverNotificationSchema`): the same path as
 * `notify`, with the target's server filled in from the desktop's own server, which is the one that runs plugins.
 */
export function notifyFromServer(ctx: NotifyContext, raw: unknown): NotifyOutcome {
  const server = ctx.servers?.list().find((id) => ctx.servers?.get(id)?.builtin)
  const notification = normalize(raw, ctx.id, Date.now(), server)
  return notification ? deliver(ctx, notification) : "none"
}

function deliver(ctx: NotifyContext, notification: Notification): NotifyOutcome {
  const sink = activeSink()
  if (sink) {
    try {
      sink.publish(notification)
      return "hub"
    } catch {
      // A broken sink must not silence the plugin: fall through to its own toast.
    }
  }
  try {
    return fallback(ctx, notification)
  } catch {
    return "none"
  }
}

/** Retracts the plugin's earlier notification with this key: hub sink, or the fallback toast. */
export function clearNotification(ctx: NotifyContext, key: string): void {
  const sink = activeSink()
  try {
    sink?.clear(ctx.id, key)
  } catch {
    // Nothing to retract with.
  }
  const live = handles.get(ctx)
  live?.get(key)?.dismiss()
  live?.delete(key)
}

/**
 * Server halves have no `ctx.toast`. They emit one RPC event named `notify` with this payload and the plugin's GUI half (or the
 * `notifications` plugin, which reads every `rpc.<id>.notify` event) turns it into `notify(ctx, …)`. The schema to put in
 * `Rpc.define({ events: { notify: { schema } } })`.
 */
export const serverNotificationSchema = {
  type: "object",
  properties: {
    kind: { type: "string" },
    title: { type: "string" },
    severity: { type: "string" },
    body: { type: "string" },
    key: { type: "string" },
    persistent: { type: "boolean" },
    /** The server clock at the event: every window then derives the same system-notification id from one event. */
    at: { type: "number" },
    target: { type: "object", properties: { server: { type: "string" }, session: { type: "string" } }, required: ["session"], additionalProperties: false },
    action: { type: "object", properties: { type: { type: "string" }, message: { type: "string" } }, required: ["type"], additionalProperties: false },
  },
  required: ["kind", "title"],
  additionalProperties: true,
} as const

/** The event type a hub reads from the client's event stream for a source: `rpc.<source>.notify`. */
export const serverEventType = (source: string) => `rpc.${source}.notify`

/** `rpc.<source>.notify` → `<source>`, else undefined. Source ids may contain dots. */
export function sourceOfEvent(type: unknown): string | undefined {
  if (typeof type !== "string" || !type.startsWith("rpc.") || !type.endsWith(".notify")) return undefined
  const source = type.slice(4, -".notify".length)
  return source.length > 0 ? source : undefined
}
