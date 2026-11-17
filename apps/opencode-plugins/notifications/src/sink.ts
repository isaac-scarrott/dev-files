import { KIND_GLYPH, type KindGlyph, type Notification, type NotifySink } from "../../native-ui/src/notify-contract"
import { Admission, MERGE_MS, SUMMARY_MS, toastVerdict, type Presence } from "./policy"
import { ALWAYS_SHOWN, type Settings } from "./settings"

const GLYPH = KIND_GLYPH
type ToastGlyph = KindGlyph

/** The variant follows the kind, not the severity: `toast-style` scopes its layout to the pair of variant and glyph. */
const VARIANT: Record<Notification["kind"], NonNullable<ToastOptions["variant"]>> = { done: "success", info: "default", "needs-you": "default", error: "error" }

/** Quiet info leaves sooner than the app's 5 seconds. */
const INFO_MS = 4000

/** The part of `ctx.toast.show` the sink uses. */
export interface ToastOptions {
  title: string
  description?: string
  variant?: "default" | "success" | "error" | "loading"
  icon?: ToastGlyph
  /** Milliseconds before it closes itself; the app's 5 seconds when absent. */
  duration?: number
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
  /** Puts text on the clipboard; a rejection is reported as a failed copy. */
  readonly copy: (text: string) => Promise<void>
  /** What waits on a session for go-to-next, the count and the marks. `host`: made from the host's own events. */
  readonly track: { put(n: Notification, host: boolean): void; remove(source: string, key: string): void }
  /** `ctx.attention.notify`: the host decides, by its own Settings › Notifications, whether anything shows or sounds. */
  readonly attention: (options: { title: string; message?: string; variant: "default" | "error"; session?: { server: string; id: string }; id: string }) => unknown
  readonly text: {
    readonly open: string
    readonly copyDetails: string
    readonly copyFailed: string
    readonly more: (count: number, source: string) => string
  }
}

interface Live {
  readonly n: Notification
  handle?: { dismiss(): void }
}

const toastFor = (n: Notification, deps: SinkDeps): ToastOptions => {
  const target = n.target
  const actions: { label: string; run(): void }[] = []
  if (target) actions.push({ label: deps.text.open, run: () => deps.open(target) })
  // Copying leaves the result in the clipboard and the toast closes (the app closes a toast on any button); only a failure is said.
  if (n.kind === "error") {
    const details = [n.title, n.body].filter(Boolean).join("\n")
    actions.push({ label: deps.text.copyDetails, run: () => void deps.copy(details).catch(() => void deps.show({ title: deps.text.copyFailed, variant: "error" })) })
  }
  return {
    title: n.title,
    description: n.body,
    variant: VARIANT[n.kind],
    icon: GLYPH[n.kind],
    duration: n.kind === "info" ? INFO_MS : undefined,
    // A failure waits for you like a request does; a toast that closes by itself is gone when you look back.
    persistent: n.persistent || n.kind === "error",
    actions: actions.length > 0 ? actions : undefined,
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
      entry.handle = deps.show({ title: deps.text.more(entry.count, source), variant: "default", icon: GLYPH.info, duration: INFO_MS })
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
    const presence = deps.presence(n)
    // The user is looking at it: a toast (error, needs-you) says enough, and nothing waits except a request that needs an answer.
    if (!(presence.onScreen && n.kind !== "needs-you")) deps.track.put(n, n.source === deps.self)
    const verdict = toastVerdict(n, deps.settings(), presence)
    if (verdict.show) show(id, n)
    else if (verdict.hold) {
      retract(id)
      live.set(id, { n })
    }
    // Host signals already reach the system notification through the host's own listener; a plugin's go through the host's
    // mechanism. The host never banners a focused window but does play the sound there, so the focus rule (the session on
    // screen needs nothing for `done`) is applied here, before the call.
    const seen = presence.onScreen && !ALWAYS_SHOWN.has(n.kind)
    if (n.source !== deps.self && n.kind !== "info" && !seen && admission.system(n)) {
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
      clear: (source: string, key: string) => {
        retract(idOf(source, key))
        deps.track.remove(source, key)
      },
    } satisfies NotifySink,
    /** The user opened the session: its error toasts have been seen. A request that still needs an answer stays. */
    seen(server: string, session: string) {
      const key = `${server}\u0000${session}`
      for (const [id, entry] of [...live]) if (entry.n.kind === "error" && sessionOf(entry.n) === key) retract(id)
    },
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
