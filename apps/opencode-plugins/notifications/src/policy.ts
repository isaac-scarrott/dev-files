import type { Notification } from "../../native-ui/src/notify-contract"
import { ALWAYS_SHOWN, type Settings } from "./settings"

/** Where the user is looking right now. `onScreen`: the notification's session is the active tab of a focused window. */
export interface Presence {
  readonly focused: boolean
  readonly onScreen: boolean
}

export type ToastReason = "show" | "muted" | "off" | "on-screen" | "unfocused" | "hold"

export interface ToastVerdict {
  readonly show: boolean
  /** A persistent notification that no focused window can show yet: kept, shown when a window gains focus. */
  readonly hold: boolean
  readonly reason: ToastReason
}

const verdict = (reason: ToastReason): ToastVerdict => ({ show: reason === "show", hold: reason === "hold", reason })

/**
 * Whether a notification raises a toast. Order: per-source mute, the kind's cell, the focus rule (the session on screen
 * in a focused window needs no toast for `done`/`info`; `error` and `needs-you` ignore it), then focus (a transient toast
 * in a window nobody looks at is wasted, a persistent one waits for focus).
 */
export function toastVerdict(n: Notification, settings: Settings, presence: Presence): ToastVerdict {
  if (settings.muted.includes(n.source)) return verdict("muted")
  if (!settings.toast[n.kind]) return verdict("off")
  if (presence.onScreen && !ALWAYS_SHOWN.has(n.kind)) {
    const shown = n.kind === "done" ? settings.onScreen.done : n.kind === "info" ? settings.onScreen.info : true
    if (!shown) return verdict("on-screen")
  }
  if (!presence.focused) return verdict(n.persistent ? "hold" : "unfocused")
  return verdict("show")
}

export const BURST_MS = 2_000
export const MERGE_MS = 10_000
export const RATE_WINDOW_MS = 60_000
export const RATE_MAX = 5
export const SUMMARY_MS = 1_500
export const SYSTEM_SESSION_MS = 30_000
export const SYSTEM_WINDOW_MAX = 6

const sessionOf = (n: Notification) => (n.target ? `${n.target.server}\u0000${n.target.session}` : "-")

/**
 * Admission for one sink: burst collapse, per-source rate, system-notification rate. State lives in the instance, which
 * the plugin creates in `setup`, so a reload starts clean.
 */
export class Admission {
  private readonly byKey = new Map<string, number>()
  private readonly byKind = new Map<string, number>()
  private readonly toasts = new Map<string, number[]>()
  private readonly systemBySession = new Map<string, number>()
  private systemRecent: number[] = []

  constructor(private readonly now: () => number) {}

  /** The same `(source, key)` or the same `(source, kind, session)` within `BURST_MS` is one notification. */
  admit(n: Notification): boolean {
    const now = this.now()
    this.prune(this.byKey, now, BURST_MS)
    this.prune(this.byKind, now, BURST_MS)
    const keyed = `${n.source}\u0000${n.key}`
    const kinded = `${n.source}\u0000${n.kind}\u0000${sessionOf(n)}`
    // Distinct persistent requests of one session (two permissions in a row) are different things; only transient repeats collapse by kind.
    const duplicate = this.recent(this.byKey, keyed, now) || (!n.persistent && this.recent(this.byKind, kinded, now))
    if (duplicate) return false
    this.byKey.set(keyed, now)
    this.byKind.set(kinded, now)
    return true
  }

  /** Counts a toast against its source. Returns how many toasts the source raised in the last minute beyond `RATE_MAX`, 0 while within the limit. */
  overflow(source: string): number {
    const now = this.now()
    const recent = (this.toasts.get(source) ?? []).filter((at) => now - at < RATE_WINDOW_MS)
    recent.push(now)
    this.toasts.set(source, recent)
    return Math.max(0, recent.length - RATE_MAX)
  }

  /** One system notification per session per 30 s and six a minute overall. */
  system(n: Notification): boolean {
    const now = this.now()
    this.systemRecent = this.systemRecent.filter((at) => now - at < RATE_WINDOW_MS)
    const session = sessionOf(n)
    const last = this.systemBySession.get(session)
    if ((last !== undefined && now - last < SYSTEM_SESSION_MS) || this.systemRecent.length >= SYSTEM_WINDOW_MAX) return false
    this.systemBySession.set(session, now)
    this.systemRecent.push(now)
    this.prune(this.systemBySession, now, SYSTEM_SESSION_MS)
    return true
  }

  private recent(map: Map<string, number>, key: string, now: number): boolean {
    const at = map.get(key)
    return at !== undefined && now - at < BURST_MS
  }

  private prune(map: Map<string, number>, now: number, ttl: number): void {
    if (map.size < 100) return
    for (const [key, at] of map) if (now - at >= ttl) map.delete(key)
  }
}
