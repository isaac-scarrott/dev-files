import type { Plugin } from "@opencode/plugin"
import { detectUsageLimit, type ErrorLike, type UsageLimit } from "./detect.js"
import type { Options } from "./options.js"
import { decide, type Waiting } from "./plan.js"
import { availability, emptyUsageState, UsageSource, type UsageState } from "./usage.js"

/** The slice of the plugin context the resumer uses; tests supply a fake. */
export type Host = Pick<Plugin.Context, "session" | "storage">

export interface Attempts {
  count: number
  lastAt: number
}

export interface State {
  waiting: Record<string, Waiting>
  attempts: Record<string, Attempts>
  usage: UsageState
}

export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

const STORAGE_KEY = "state/v1"
const MAX_ANNOUNCEMENTS = 3
const REANNOUNCE_MS = 5 * 60_000
// A run that started this long after the failure was recorded was started by someone else.
const TOUCH_SLACK_MS = 2_000

export function emptyState(): State {
  return { waiting: {}, attempts: {}, usage: emptyUsageState() }
}

export function formatTime(at: number, now: number): string {
  const date = new Date(at)
  const sameDay = date.toDateString() === new Date(now).toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })
}

export class Resumer {
  private busy = false

  private constructor(
    private readonly host: Host,
    private readonly options: Options,
    private readonly clock: Clock,
    private readonly usage: UsageSource,
    private readonly state: State,
    private readonly log: (message: string) => void,
  ) {}

  static async create(
    host: Host,
    options: Options,
    clock: Clock,
    usageDeps: Omit<ConstructorParameters<typeof UsageSource>[0], "now" | "authDir" | "snapshotPath">,
    log: (message: string) => void = () => {},
  ): Promise<Resumer> {
    const stored = (await host.storage.get(STORAGE_KEY).catch(() => undefined)) as Partial<State> | undefined
    const state: State = { ...emptyState(), ...stored, usage: { ...emptyUsageState(), ...stored?.usage } }
    const save = () => host.storage.set(STORAGE_KEY, state as never)
    const source = new UsageSource(
      { ...usageDeps, now: () => clock.now(), authDir: options.authDir, snapshotPath: options.snapshotPath },
      state.usage,
      save,
    )
    return new Resumer(host, options, clock, source, state, log)
  }

  /** Session IDs currently waiting, for tests and diagnostics. */
  waiting(): readonly Waiting[] {
    return Object.values(this.state.waiting)
  }

  attempts(sessionID: string): Attempts | undefined {
    return this.state.attempts[sessionID]
  }

  /** A run failed. If it is a Claude usage limit, start waiting for it to clear. */
  async onFailed(sessionID: string, error: ErrorLike | undefined, at: number): Promise<void> {
    const limit = detectUsageLimit(error, at)
    if (!limit) return
    const info = await this.host.session.get({ sessionID }).catch(() => undefined)
    if (!info || info.time.archived !== undefined) return
    if (info.parentID !== undefined && !this.options.includeChildren) return
    const attempts = this.state.attempts[sessionID]
    if (attempts && attempts.count >= this.options.maxAttempts) {
      this.log(`${sessionID}: giving up after ${attempts.count} resumes`)
      await this.notice(sessionID, `Usage limit reached again after ${attempts.count} automatic resumes. Not resuming automatically.`)
      delete this.state.waiting[sessionID]
      await this.save()
      return
    }
    await this.register(sessionID, limit, at)
  }

  /** The session moved on without us (a user prompt, a run, deletion, completion): stop waiting for it. */
  async onSettled(sessionID: string, completed = false): Promise<void> {
    let changed = false
    if (this.state.waiting[sessionID]) {
      delete this.state.waiting[sessionID]
      changed = true
    }
    if (completed && this.state.attempts[sessionID]) {
      delete this.state.attempts[sessionID]
      changed = true
    }
    if (changed) await this.save()
  }

  /** Look at every waiting session that is due. Call on an interval; after sleep the first call catches up. */
  async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const now = this.clock.now()
      const due = Object.values(this.state.waiting)
        .filter((w) => w.dueAt <= now)
        .sort((a, b) => a.dueAt - b.dueAt)
      let first = true
      for (const waiting of due) {
        if (!first && this.options.staggerMs > 0) await this.clock.sleep(this.options.staggerMs)
        first = false
        await this.process(waiting.sessionID).catch((error) => this.log(`${waiting.sessionID}: ${String(error)}`))
      }
    } finally {
      this.busy = false
    }
  }

  private async register(sessionID: string, limit: UsageLimit, stalledAt: number): Promise<void> {
    const prior = this.state.attempts[sessionID]?.count ?? 0
    const backoff = prior > 0 ? this.options.retryBackoffMs * 2 ** (prior - 1) : 0
    const notBefore = stalledAt + this.options.marginMs + backoff
    const waiting: Waiting = {
      sessionID,
      stalledAt,
      notBefore,
      dueAt: notBefore,
      kind: limit.kind,
      resetsAt: limit.resetsAt,
      unverified: 0,
      announcements: 0,
    }
    const decision = await this.evaluate(waiting)
    waiting.dueAt = decision.action === "wait" ? decision.at : waiting.notBefore
    this.state.waiting[sessionID] = waiting
    await this.announce(waiting)
    await this.save()
  }

  private async evaluate(waiting: Waiting) {
    const readings = await this.usage.refresh().catch(() => [])
    const now = this.clock.now()
    const a = availability(readings, now, waiting.stalledAt)
    const nextPoll = this.usage.nextPollAt(readings.map((r) => r.id))
    return decide(waiting, a, now, this.options.marginMs, nextPoll)
  }

  private async process(sessionID: string): Promise<void> {
    const waiting = this.state.waiting[sessionID]
    if (!waiting) return
    if (this.clock.now() - waiting.stalledAt > this.options.maxWaitMs) return this.drop(sessionID, "waited too long")

    const info = await this.host.session.get({ sessionID }).catch(() => undefined)
    if (!info) return this.drop(sessionID, "deleted")
    if (info.time.archived !== undefined) return this.drop(sessionID, "archived")
    if (info.time.busy !== undefined && (info.time.idle === undefined || info.time.busy > info.time.idle)) return this.drop(sessionID, "running again")
    if (info.time.busy !== undefined && info.time.busy > waiting.stalledAt + TOUCH_SLACK_MS) return this.drop(sessionID, "touched since the stall")
    if (info.outcome !== undefined && info.outcome !== "failed") return this.drop(sessionID, `finished ${info.outcome}`)

    const decision = await this.evaluate(waiting)
    if (decision.action === "wait") {
      waiting.dueAt = decision.at
      if (decision.unverified) waiting.unverified += 1
      await this.announce(waiting)
      await this.save()
      return
    }

    // Forget the stall before sending: the prompt's own events must not look like the user touching the session.
    delete this.state.waiting[sessionID]
    const attempts = this.state.attempts[sessionID] ?? { count: 0, lastAt: 0 }
    this.state.attempts[sessionID] = { count: attempts.count + 1, lastAt: this.clock.now() }
    await this.save()
    try {
      await this.host.session.prompt({ sessionID, text: this.options.prompt, delivery: "queue" })
      this.log(`${sessionID}: resumed (${decision.verified ? "usage verified" : "reset time only"})`)
    } catch (error) {
      this.log(`${sessionID}: resume failed: ${String(error)}`)
      this.state.waiting[sessionID] = { ...waiting, dueAt: this.clock.now() + this.options.retryBackoffMs }
      await this.save()
    }
  }

  private async drop(sessionID: string, reason: string): Promise<void> {
    this.log(`${sessionID}: not resuming (${reason})`)
    delete this.state.waiting[sessionID]
    await this.save()
  }

  private async announce(waiting: Waiting): Promise<void> {
    if (waiting.announcements >= MAX_ANNOUNCEMENTS) return
    if (waiting.announcedAt !== undefined && Math.abs(waiting.dueAt - waiting.announcedAt) < REANNOUNCE_MS) return
    waiting.announcedAt = waiting.dueAt
    waiting.announcements += 1
    const at = formatTime(waiting.dueAt, this.clock.now())
    await this.notice(waiting.sessionID, `Claude usage limit reached. Resumes automatically at ${at}.`)
  }

  /** A timeline notice that does not wake the session. */
  private async notice(sessionID: string, text: string): Promise<void> {
    if (!this.options.notices) return
    await this.host.session
      .synthetic({ sessionID, text, description: text, delivery: "queue", resume: false })
      .catch((error) => this.log(`${sessionID}: notice failed: ${String(error)}`))
  }

  private save(): Promise<void> {
    return this.host.storage.set(STORAGE_KEY, this.state as never)
  }
}
