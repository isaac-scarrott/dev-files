import { LockedError, type Account, type AccountInfo, type Capabilities, type FieldRef, type ItemRef, type LockState, type UnlockInput, type UnlockMethod } from "./contract.js"

export type Session = { env: Record<string, string>; method: UnlockMethod }

/** An item list stays this long in memory: service accounts allow 1,000 requests a day. */
export const LIST_TTL_MS = 5 * 60_000

/**
 * What both vendors share: an in-memory session, an idle timer that locks it, and a short cache of item references (never
 * values). A subclass says how to unlock, list and read.
 */
export abstract class Base implements Account, AccountInfo {
  abstract readonly kind: string
  abstract readonly capabilities: Capabilities
  readonly id: string
  readonly label: string
  readonly allowedOrigins?: readonly string[]
  protected session: Session | undefined
  protected cache = new Map<string, { at: number; items: readonly ItemRef[] }>()
  readonly autoLockMs: number
  private used = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: { id: string; label: string; autoLockMinutes?: number; allowedOrigins?: readonly string[] }) {
    this.id = options.id
    this.label = options.label
    this.allowedOrigins = options.allowedOrigins
    this.autoLockMs = Math.round((options.autoLockMinutes ?? 10) * 60_000)
  }

  /** Starts a session and its idle timer. */
  protected open(session: Session) {
    this.session = session
    this.touch()
  }

  /** A use of the session: the idle timer starts over. */
  protected touch() {
    if (!this.session) return
    this.used = Date.now()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.lock(), this.autoLockMs)
    this.timer.unref?.()
  }

  protected env() {
    if (!this.session) throw new LockedError(this.id, this.unlockMethods())
    this.touch()
    return this.session.env
  }

  protected unlockMethods(): readonly UnlockMethod[] {
    return this.capabilities.unlock
  }

  protected cached(key: string) {
    const hit = this.cache.get(key)
    return hit && Date.now() - hit.at < LIST_TTL_MS ? hit.items : undefined
  }

  async status(): Promise<LockState> {
    if (this.session) return { state: "unlocked", method: this.session.method, expiresAt: this.used + this.autoLockMs }
    return { state: "locked", methods: this.unlockMethods() }
  }

  async lock() {
    clearTimeout(this.timer)
    this.session = undefined
    this.cache.clear()
  }

  abstract unlock(input: UnlockInput, signal?: AbortSignal): Promise<LockState>
  abstract findByOrigin(origin: string, signal?: AbortSignal): Promise<readonly ItemRef[]>
  abstract resolve(reference: string, signal?: AbortSignal): Promise<{ item: ItemRef; field: FieldRef }>
  abstract read(item: ItemRef, field: FieldRef, signal?: AbortSignal): Promise<string>
}
