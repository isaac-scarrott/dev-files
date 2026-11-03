import type { Notification, NotifySink } from "../../native-ui/src/notify-contract"
import { Admission, MERGE_MS, SUMMARY_MS, toastVerdict, type Presence } from "./policy"
import type { Settings } from "./settings"

/** The part of `ctx.toast.show` the sink uses. */
export interface ToastOptions {
  title: string
  description?: string
  variant?: "default" | "success" | "error" | "loading"
  icon?: "warning" | "info"
  persistent?: boolean
  actions?: readonly { label: string; run(): void }[]
}

export interface SinkDeps {
  /** The sink's own source id: notifications it makes from host signals carry it. */
  readonly self: string
  readonly now: () => number
  /** Runs `fn` later; returns the cancel. */
  readonly later: (fn: () => void, ms: number) => () => void
  readonly settings: () => Settings
  readonly presence: (n: Notification) => Presence
  readonly show: (options: ToastOptions) => { dismiss(): void }
  readonly open: (target: { server: string; session: string }) => void
  /** `ctx.attention.notify`: the host decides, by its own Settings › Notifications, whether anything shows or sounds. */
  readonly attention: (options: { title: string; message?: string; variant: "default" | "error"; session?: { server: string; id: string }; id: string }) => unknown
  readonly text: {
    readonly open: string
    readonly more: (count: number, source: string) => string
  }
}

interface Live {
  readonly n: Notification
  handle?: { dismiss(): void }
}

const toastFor = (n: Notification, deps: SinkDeps): ToastOptions => {
  const target = n.target
  return {
    title: n.title,
    description: n.body,
    variant: n.severity === "error" ? "error" : n.severity === "success" ? "success" : "default",
    icon: n.severity === "warning" ? "warning" : n.severity === "info" ? "info" : undefined,
    persistent: n.persistent,
    actions: target ? [{ label: deps.text.open, run: () => deps.open(target) }] : undefined,
  }
}

const idOf = (source: string, key: string) => `${source}\u0000${key}`

const sessionOf = (n: Notification) => (n.target ? `${n.target.server}\u0000${n.target.session}` : undefined)

/**
 * The hub's sink: one per window, created in `setup`. Applies the policy (mute, cell, focus rule), collapses bursts,
 * merges a plugin's error for a session with the host's own `execution.failed` for it, and keeps what is on screen so a
 * later `clear` can retract it.
 */
export function createSink(deps: SinkDeps) {
  const admission = new Admission(deps.now)
  const live = new Map<string, Live>()
  // The "N more" summary per source: shown at once, then refreshed at most every SUMMARY_MS however fast events arrive (a toast per event is what it replaces).
  const more = new Map<string, { count: number; handle?: { dismiss(): void }; cancel?: () => void }>()

  const retract = (id: string) => {
    const entry = live.get(id)
    entry?.handle?.dismiss()
    live.delete(id)
  }

  const summarize = (source: string, count: number) => {
    const entry = more.get(source) ?? { count }
    entry.count = count
    more.set(source, entry)
    const present = () => {
      entry.cancel = undefined
      entry.handle?.dismiss()
      entry.handle = deps.show({ title: deps.text.more(entry.count, source), variant: "default" })
    }
    if (!entry.handle) present()
    else if (!entry.cancel) entry.cancel = deps.later(present, SUMMARY_MS)
  }

  const show = (id: string, n: Notification) => {
    const source = n.source
    const extra = admission.overflow(source)
    if (extra > 0) {
      summarize(source, extra)
      return
    }
    live.get(id)?.handle?.dismiss()
    live.set(id, { n, handle: deps.show(toastFor(n, deps)) })
  }

  // A plugin's error for a session is the more specific one; the host's `execution.failed` for it within MERGE_MS goes.
  const mergeErrors = (n: Notification): boolean => {
    const session = sessionOf(n)
    if (n.kind !== "error" || !session) return false
    const hostSide = n.source === deps.self
    for (const [id, entry] of live) {
      if (entry.n.kind !== "error" || sessionOf(entry.n) !== session || deps.now() - entry.n.at > MERGE_MS) continue
      const entryHost = entry.n.source === deps.self
      if (entryHost === hostSide) continue
      if (hostSide) return true
      retract(id)
    }
    return false
  }

  // A transient toast closes itself within seconds; its entry is only kept for replace and merge.
  const sweep = () => {
    const now = deps.now()
    for (const [id, entry] of live) if (!entry.n.persistent && now - entry.n.at > MERGE_MS) live.delete(id)
  }

  const publish = (n: Notification) => {
    sweep()
    if (deps.settings().muted.includes(n.source)) return
    if (!admission.admit(n)) return
    if (mergeErrors(n)) return
    const id = idOf(n.source, n.key)
    // A request that is already waiting on screen, unchanged (a reconnect asks again): leave it be.
    const shown = live.get(id)
    if (shown?.handle && shown.n.persistent && n.persistent && shown.n.title === n.title && shown.n.body === n.body) return
    const verdict = toastVerdict(n, deps.settings(), deps.presence(n))
    if (verdict.show) show(id, n)
    else if (verdict.hold) {
      retract(id)
      live.set(id, { n })
    }
    // Host signals already reach the system notification through the host's own listener; a plugin's go through the host's mechanism.
    if (n.source !== deps.self && n.kind !== "info" && admission.system(n)) {
      void deps.attention({
        title: n.title,
        message: n.body,
        variant: n.kind === "error" ? "error" : "default",
        session: n.target ? { server: n.target.server, id: n.target.session } : undefined,
        id: `${id}\u0000${n.at}`,
      })
    }
  }

  return {
    sink: {
      id: deps.self,
      accepts: [1],
      publish,
      clear: (source: string, key: string) => retract(idOf(source, key)),
    } satisfies NotifySink,
    /** A window gained focus: persistent notifications that waited for one appear now. */
    focusGained() {
      for (const [id, entry] of live) if (!entry.handle && deps.presence(entry.n).focused) entry.handle = deps.show(toastFor(entry.n, deps))
    },
    /** Notifications this sink holds or shows (tests, diagnostics). */
    size: () => live.size,
    dispose() {
      for (const entry of live.values()) entry.handle?.dismiss()
      for (const entry of more.values()) {
        entry.cancel?.()
        entry.handle?.dismiss()
      }
      live.clear()
      more.clear()
    },
  }
}
