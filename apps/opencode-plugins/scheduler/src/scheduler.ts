import { randomBytes } from "node:crypto"
import { nextCron, parseCron } from "./cron.js"
import type { Host, SessionInfo } from "./host.js"
import type { Options } from "./options.js"
import { resolveTarget, label } from "./targets.js"
import { formatSpan, parseAt, parseDuration } from "./when.js"
import { deliver, wakeMetadata } from "./wake.js"

export type Kind = "once" | "every" | "cron"

export interface Job {
  readonly id: string
  readonly name: string
  readonly kind: Kind
  readonly prompt: string
  readonly sessionID: string
  /** Display label of the target at creation: `title [ref]`. */
  readonly target: string
  readonly createdAt: number
  /** The schedule as the user wrote it, for listings. */
  readonly spec: string
  readonly everyMs?: number
  readonly cron?: string
  readonly maxRuns?: number
  nextRun: number
  lastRun?: number
  runs: number
  /** Recent fire times, for the loop guard. */
  fires: number[]
  /** Delivery or lookup failures in a row. */
  failures: number
  status: "active" | "paused"
  pausedReason?: string
}

export interface Ended {
  readonly id: string
  readonly name: string
  readonly target: string
  readonly reason: string
  readonly at: number
  readonly runs: number
}

export interface State {
  jobs: Job[]
  ended: Ended[]
}

export interface Clock {
  now(): number
}

export interface AddInput {
  readonly prompt: string
  readonly at?: string
  readonly every?: string | number
  readonly cron?: string
  readonly name?: string
  readonly session?: string
  readonly maxRuns?: number
}

export const STATE_KEY = "state/v1"
const MAX_ENDED = 20
const NAME_CHARS = 60
const MAX_FAILURES = 3
const RETRY_MS = 60_000
const MAX_PROMPT_CHARS = 20_000

export const emptyState = (): State => ({ jobs: [], ended: [] })

const newId = (): string => `sch_${randomBytes(4).toString("hex")}`

function defaultName(prompt: string): string {
  const line = (prompt.trim().split("\n")[0] ?? "").trim()
  return line.length > NAME_CHARS ? `${line.slice(0, NAME_CHARS - 1)}…` : line || "task"
}

export const isoLocal = (at: number): string => {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  const offset = -d.getTimezoneOffset()
  const sign = offset < 0 ? "-" : "+"
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
}

/** Missing sessions and archived ones end a job; anything else is treated as a passing failure. */
function gone(error: unknown): boolean {
  const text = `${(error as { name?: string })?.name ?? ""} ${(error as { _tag?: string })?._tag ?? ""} ${String((error as Error)?.message ?? error)}`
  return /not.?found|no such|does not exist|missing/i.test(text)
}

export class Scheduler {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly options: Options,
    private readonly clock: Clock,
    private readonly storage: Host["storage"],
    private readonly state: State,
    private readonly log: (message: string) => void,
    /** Any live host that can reach the session API; the server runs one plugin instance per project location. */
    private readonly anyHost: () => Host | undefined,
  ) {}

  static async create(options: Options, clock: Clock, storage: Host["storage"], log: (message: string) => void, anyHost: () => Host | undefined): Promise<Scheduler> {
    const stored = (await storage.get(STATE_KEY).catch(() => undefined)) as Partial<State> | undefined
    const state: State = { ...emptyState(), ...stored }
    return new Scheduler(options, clock, storage, state, log, anyHost)
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => {})
    return run
  }

  private save(): Promise<void> {
    return this.storage.set(STATE_KEY, this.state as never)
  }

  private end(job: Job, reason: string): void {
    this.state.jobs = this.state.jobs.filter((j) => j.id !== job.id)
    this.state.ended = [{ id: job.id, name: job.name, target: job.target, reason, at: this.clock.now(), runs: job.runs }, ...this.state.ended].slice(0, MAX_ENDED)
    this.log(`${job.id} "${job.name}" ended: ${reason}`)
  }

  /** Earliest time an active job is due, or undefined when nothing is waiting. */
  nextDueAt(): number | undefined {
    const due = this.state.jobs.filter((j) => j.status === "active").map((j) => j.nextRun)
    return due.length ? Math.min(...due) : undefined
  }

  private nextFor(job: Pick<Job, "kind" | "everyMs" | "cron">, from: number): number | undefined {
    if (job.kind === "every") return from + (job.everyMs ?? 0)
    if (job.kind === "cron") return nextCron(parseCron(job.cron ?? ""), from)
    return undefined
  }

  add(host: Host, caller: SessionInfo, input: AddInput): Promise<{ job: Job }> {
    return this.locked(async () => {
      const now = this.clock.now()
      const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
      if (!prompt) throw new Error("prompt must not be empty")
      if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt is longer than ${MAX_PROMPT_CHARS} characters`)
      const given = [input.at, input.every, input.cron].filter((v) => v !== undefined)
      if (given.length !== 1) throw new Error("Give exactly one of at (one-off), every (repeat every N minutes, hours or days) or cron (5-field)")
      if (this.state.jobs.length >= this.options.maxSchedules) throw new Error(`There are already ${this.state.jobs.length} schedules (limit ${this.options.maxSchedules}). Cancel some with cancel_schedule first.`)
      if (input.maxRuns !== undefined && (!Number.isInteger(input.maxRuns) || input.maxRuns < 1)) throw new Error("maxRuns must be a positive whole number")
      const minMs = this.options.minIntervalSeconds * 1000

      let kind: Kind
      let spec: string
      let nextRun: number
      let everyMs: number | undefined
      let cron: string | undefined
      if (input.at !== undefined) {
        kind = "once"
        nextRun = parseAt(String(input.at), now)
        if (nextRun <= now) throw new Error(`${input.at} is in the past (now is ${isoLocal(now)})`)
        spec = `at ${isoLocal(nextRun)}`
      } else if (input.every !== undefined) {
        kind = "every"
        everyMs = parseDuration(input.every)
        if (everyMs < minMs) throw new Error(`every must be at least ${formatSpan(minMs)} (plugin option minIntervalSeconds)`)
        nextRun = now + everyMs
        spec = `every ${formatSpan(everyMs)}`
      } else {
        kind = "cron"
        cron = String(input.cron).trim()
        const parsed = parseCron(cron)
        const first = nextCron(parsed, now)
        if (first === undefined) throw new Error(`cron "${cron}" never matches a real date`)
        const second = nextCron(parsed, first)
        if (second !== undefined && second - first < minMs) throw new Error(`cron "${cron}" runs more often than every ${formatSpan(minMs)} (plugin option minIntervalSeconds)`)
        nextRun = first
        spec = `cron ${cron}`
      }
      const target = await resolveTarget(host, caller, input.session, this.options.scope)
      if (target.time.archived !== undefined) throw new Error(`${label(target)} is archived`)
      const job: Job = {
        id: newId(),
        name: (input.name ?? "").trim() || defaultName(prompt),
        kind,
        prompt,
        sessionID: target.id,
        target: label(target),
        createdAt: now,
        spec,
        everyMs,
        cron,
        maxRuns: input.maxRuns,
        nextRun,
        runs: 0,
        fires: [],
        failures: 0,
        status: "active",
      }
      this.state.jobs.push(job)
      await this.save()
      this.log(`${job.id} "${job.name}" added for ${job.target}: ${spec}, next ${isoLocal(nextRun)}`)
      return { job }
    })
  }

  list(): { jobs: Job[]; ended: Ended[] } {
    return { jobs: [...this.state.jobs].sort((a, b) => a.nextRun - b.nextRun), ended: this.state.ended }
  }

  cancel(id: string): Promise<{ cancelled: Job | undefined }> {
    return this.locked(async () => {
      const job = this.state.jobs.find((j) => j.id === id.trim())
      if (!job) return { cancelled: undefined }
      this.end(job, "cancelled")
      await this.save()
      return { cancelled: job }
    })
  }

  /** Fire every active job that is due. After sleep or a restart the first call catches up: a missed recurring job fires once. */
  tick(): Promise<void> {
    return this.locked(async () => {
      const now = this.clock.now()
      const due = this.state.jobs.filter((j) => j.status === "active" && j.nextRun <= now).sort((a, b) => a.nextRun - b.nextRun)
      for (const job of due) await this.fire(job, now).catch((error) => this.log(`${job.id}: ${String(error)}`))
    })
  }

  private async fire(job: Job, now: number): Promise<void> {
    const host = this.anyHost()
    if (!host) return
    let info: SessionInfo
    try {
      info = await host.session.get({ sessionID: job.sessionID })
    } catch (error) {
      if (gone(error)) {
        this.end(job, "target session was deleted")
        return this.save()
      }
      return this.failed(job, now, `could not read the target session: ${String(error)}`)
    }
    if (info.time.archived !== undefined) {
      this.end(job, "target session was archived")
      return this.save()
    }

    const windowMs = this.options.loopWindowMinutes * 60_000
    job.fires = job.fires.filter((t) => now - t < windowMs)
    if (job.fires.length >= this.options.loopMaxFires) {
      job.status = "paused"
      job.pausedReason = `fired ${job.fires.length} times in the last ${this.options.loopWindowMinutes} minutes`
      this.log(`${job.id} "${job.name}" paused: ${job.pausedReason}`)
      await this.save()
      await this.notice(host, job.sessionID, `Scheduled task "${job.name}" (${job.id}) was paused: it ${job.pausedReason}. It stays in list_schedules; cancel_schedule removes it.`)
      return
    }

    const scheduled = job.nextRun
    const lateMs = now - scheduled
    const previous = { failures: job.failures, nextRun: job.nextRun, lastRun: job.lastRun, runs: job.runs, fires: job.fires }
    job.runs += 1
    job.lastRun = now
    job.fires = [...job.fires, now]
    const next = this.nextFor(job, now)
    const finished = next === undefined || (job.maxRuns !== undefined && job.runs >= job.maxRuns)
    if (finished) this.end(job, next === undefined ? "ran once" : `reached maxRuns (${job.maxRuns})`)
    else job.nextRun = next
    // Saved before the prompt: a crash between the two skips a run rather than repeating it.
    await this.save()

    const wake = { id: job.id, name: job.name, prompt: job.prompt, scheduled, lateMs, recurring: job.kind !== "once" }
    try {
      await host.session.prompt({
        sessionID: job.sessionID,
        text: deliver(wake, this.options.lateSeconds * 1000),
        delivery: "steer",
        metadata: wakeMetadata(wake, job.kind, now),
      })
      job.failures = 0
      this.log(`${job.id} "${job.name}" woke ${job.target}${lateMs > this.options.lateSeconds * 1000 ? ` (${formatSpan(lateMs)} late)` : ""}${finished ? "" : `, next ${isoLocal(job.nextRun)}`}`)
    } catch (error) {
      // Put the job back so the run is not lost.
      Object.assign(job, previous)
      if (finished) {
        this.state.jobs.push(job)
        this.state.ended = this.state.ended.filter((e) => e.id !== job.id)
      }
      job.nextRun = now + RETRY_MS
      await this.failed(job, now, `delivery failed: ${String(error)}`)
    }
  }

  private async failed(job: Job, now: number, why: string): Promise<void> {
    job.failures += 1
    job.nextRun = now + RETRY_MS
    this.log(`${job.id} "${job.name}": ${why} (${job.failures}/${MAX_FAILURES})`)
    if (job.failures >= MAX_FAILURES) this.end(job, why)
    await this.save()
  }

  private async notice(host: Host, sessionID: string, text: string): Promise<void> {
    await host.session.synthetic({ sessionID, text, description: text, delivery: "queue", resume: false }).catch((error) => this.log(`${sessionID}: notice failed: ${String(error)}`))
  }
}
