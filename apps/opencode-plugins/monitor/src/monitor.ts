import { LineSplitter } from "./lines.js"
import type { Options } from "./options.js"
import type { Child, Clock, Spawn } from "./process.js"
import type { RunState } from "./state.js"
import { renderWake } from "./wrap.js"

/** What is stored: the definition of a monitor, never its output. */
export interface Definition {
  readonly id: string
  readonly name: string
  readonly command: string
  readonly cwd: string
  /** The session that receives the wakes. */
  readonly sessionID: string
  readonly match?: string
  readonly batchSeconds: number
  readonly maxEvents?: number
  readonly rearmMinutes?: number
  readonly createdAt: number
  /** Directory of the plugin instance that started it; only that instance restores it. */
  readonly origin: string
  readonly expiresAt: number
}

export interface Deps {
  readonly options: Options
  readonly clock: Clock
  readonly spawn: Spawn
  readonly deliver: (sessionID: string, text: string, meta: { monitorID: string; seq: number }) => Promise<void>
  readonly log: (message: string) => void
  /** Persists the run state (re-arm clock, seq, last-alive time). Failures are the caller's to swallow. */
  readonly saveState: (monitor: Monitor, state: RunState) => Promise<void>
  /** The monitor is over for good; the manager forgets it. */
  readonly finished: (monitor: Monitor, reason: string) => void
}

export type State = "running" | "waiting" | "ended"

const HOUR = 3_600_000
const MAX_DELIVERY_FAILURES = 3
const HEARTBEAT_MS = 60_000

/** A restore: the previous run state (restartCount already counting this restart) and the note for the first wake. */
export interface Resume {
  readonly state: RunState
  readonly note: string
}

export class Monitor {
  state: State = "ended"
  startedAt = 0
  events = 0
  lastEventAt: number | undefined
  paused = false
  restartCount = 0
  lastRearmAt: number | undefined
  nextRearmAt: number | undefined

  private seq = 0
  private restartNotice: number | undefined
  private heartbeatTimer: unknown
  private child: Child | undefined
  private exited: Promise<void> = Promise.resolve()
  private splitter: LineSplitter
  private pending: string[] = []
  private pendingBytes = 0
  private dropped = 0
  private notes: string[] = []
  private window: number[] = []
  private batchTimer: unknown
  private cycleTimer: unknown
  private ttlTimer: unknown
  private cycling = false
  private closing = false
  private chain: Promise<void> = Promise.resolve()
  private failures = 0
  private readonly matcher: RegExp | undefined

  constructor(readonly def: Definition, private readonly deps: Deps) {
    this.splitter = new LineSplitter(deps.options.maxLineChars)
    this.matcher = def.match === undefined ? undefined : new RegExp(def.match)
  }

  /**
   * A fresh start, or (with `resume`) a restore after a service restart. The process is always new; what is kept is the
   * re-arm clock: a mark still ahead keeps its remaining time, a mark that passed while the service was down counts as
   * satisfied by this fresh start and the next one is set from now. The ttl is the stored absolute `expiresAt`, so
   * neither a re-arm nor a restart extends it.
   */
  start(resume?: Resume): void {
    const { clock } = this.deps
    const now = clock.now()
    this.startedAt = now
    let keepMark: number | undefined
    if (resume) {
      this.seq = resume.state.seq
      this.restartCount = resume.state.restartCount
      this.events = resume.state.events
      this.lastEventAt = resume.state.lastEventAt
      this.restartNotice = resume.state.restartCount
      this.lastRearmAt = resume.state.lastRearmAt
      this.notes.push(resume.note)
      const mark = resume.state.nextRearmAt
      if (this.def.rearmMinutes !== undefined && mark !== undefined && mark > now) keepMark = mark
    }
    this.ttlTimer = clock.setTimeout(() => void this.end("it reached its time limit (start it again to keep watching)"), Math.max(0, this.def.expiresAt - now))
    this.heartbeatTimer = clock.setTimeout(() => this.heartbeat(), HEARTBEAT_MS)
    this.spawnRun({ rearmed: resume !== undefined && keepMark === undefined, mark: keepMark })
    if (resume) this.scheduleFlush()
  }

  get pid(): number | undefined {
    return this.child?.pid
  }

  private snapshot(): RunState {
    return {
      seq: this.seq,
      restartCount: this.restartCount,
      aliveAt: this.deps.clock.now(),
      events: this.events,
      ...(this.lastEventAt === undefined ? {} : { lastEventAt: this.lastEventAt }),
      ...(this.lastRearmAt === undefined ? {} : { lastRearmAt: this.lastRearmAt }),
      ...(this.nextRearmAt === undefined ? {} : { nextRearmAt: this.nextRearmAt }),
    }
  }

  private save(): Promise<void> {
    return this.deps.saveState(this, this.snapshot()).catch((error) => this.deps.log(`${this.def.id} (${this.def.name}): could not save state: ${String(error)}`))
  }

  private heartbeat(): void {
    if (this.closing) return
    void this.save()
    this.heartbeatTimer = this.deps.clock.setTimeout(() => this.heartbeat(), HEARTBEAT_MS)
  }

  nextRunAt(): number | undefined {
    return this.state === "waiting" ? this.nextRearmAt : undefined
  }

  /** Ends the monitor on request or because its session went away. No wake. */
  async stop(reason: string): Promise<void> {
    if (this.closing) return
    this.closing = true
    this.clearTimers()
    this.deps.log(`${this.def.id} (${this.def.name}): stopped: ${reason}`)
    await this.terminate()
    this.state = "ended"
    await this.chain
    this.deps.finished(this, reason)
  }

  /** Shutdown path: end the process and wait for it, nothing else. */
  async dispose(): Promise<void> {
    this.closing = true
    this.clearTimers()
    await this.terminate()
    this.state = "ended"
    await this.chain
    await this.save() // last-alive time for the downtime window of the next start
  }

  private spawnRun(how: { rearmed: boolean; mark?: number } = { rearmed: false }): void {
    const { clock, spawn, log } = this.deps
    const now = clock.now()
    if (how.rearmed) this.lastRearmAt = now
    this.splitter = new LineSplitter(this.deps.options.maxLineChars)
    this.state = "running"
    let release!: () => void
    this.exited = new Promise<void>((resolve) => (release = resolve))
    const child = spawn(
      { command: this.def.command, cwd: this.def.cwd },
      {
        data: (chunk) => {
          if (this.child === child) for (const line of this.splitter.push(chunk)) this.accept(line)
        },
        exit: (code, signal) => {
          if (this.child !== child) return
          this.child = undefined
          child.kill("SIGKILL") // stray members of the process group
          for (const line of this.splitter.flush()) this.accept(line)
          log(`${this.def.id} (${this.def.name}): process ended with ${signal ?? `code ${code}`}`)
          release()
          this.onExit(code, signal)
        },
      },
    )
    this.child = child
    if (this.def.rearmMinutes !== undefined) {
      this.nextRearmAt = how.mark ?? now + this.def.rearmMinutes * 60_000
      this.cycleTimer = clock.setTimeout(() => this.cycle(), this.nextRearmAt - now)
    }
    void this.save()
  }

  private onExit(code: number | null, signal: string | null): void {
    if (this.closing) return
    const how = signal ? `was killed by ${signal}` : `exited with code ${code}`
    if (this.cycling) {
      this.cycling = false
      this.spawnRun({ rearmed: true })
      return
    }
    if (this.def.rearmMinutes === undefined) {
      void this.end(`the command ${how}`)
      return
    }
    this.state = "waiting"
    if (code !== 0) this.notes.push(`The command ${how}; it starts again at ${new Date(this.nextRunAt() ?? 0).toISOString()}.`)
    this.flush()
  }

  /** The re-arm schedule fired: start a fresh run, ending the current one first if it is still going. */
  private cycle(): void {
    if (this.closing) return
    if (this.child) {
      this.cycling = true
      this.signalChild()
    } else {
      this.spawnRun({ rearmed: true })
    }
  }

  private accept(line: string): void {
    if (this.closing || this.state === "ended") return
    if (this.matcher && !this.matcher.test(line)) return
    const { options, clock } = this.deps
    const now = clock.now()
    while (this.window.length > 0 && now - this.window[0]! >= HOUR) this.window.shift()
    if (this.window.length >= options.maxEventsPerHour) {
      if (!this.paused) {
        this.paused = true
        this.notes.push(`Paused: more than ${options.maxEventsPerHour} lines in an hour. Lines are dropped, and counted, until the rate falls.`)
        this.deps.log(`${this.def.id} (${this.def.name}): paused after ${options.maxEventsPerHour} events in an hour`)
      }
      this.dropped += 1
      this.scheduleFlush()
      return
    }
    if (this.paused) {
      this.paused = false
      this.notes.push("Resumed: the rate fell below the limit.")
    }
    this.window.push(now)
    this.events += 1
    this.lastEventAt = now
    const size = Buffer.byteLength(line)
    if (this.pending.length >= options.maxLinesPerWake || this.pendingBytes + size > options.maxBufferBytes) {
      this.dropped += 1
    } else {
      this.pending.push(line)
      this.pendingBytes += size
    }
    this.scheduleFlush()
    if (this.def.maxEvents !== undefined && this.events >= this.def.maxEvents) void this.end(`it reached its limit of ${this.def.maxEvents} events`)
  }

  private scheduleFlush(): void {
    if (this.batchTimer !== undefined) return
    this.batchTimer = this.deps.clock.setTimeout(() => this.flush(), this.def.batchSeconds * 1000)
  }

  private flush(extra: readonly string[] = []): void {
    if (this.batchTimer !== undefined) this.deps.clock.clearTimeout(this.batchTimer)
    this.batchTimer = undefined
    const notes = [...this.notes, ...extra]
    if (this.pending.length === 0 && this.dropped === 0 && notes.length === 0) return
    this.seq += 1
    const seq = this.seq
    const restart = this.restartNotice
    this.restartNotice = undefined
    const text = renderWake({ name: this.def.name, id: this.def.id, seq, lines: this.pending, dropped: this.dropped, notes, restart })
    void this.save()
    this.deps.log(`${this.def.id} (${this.def.name}): wake ${seq}: ${this.pending.length} line(s), ${this.dropped} dropped`)
    this.pending = []
    this.pendingBytes = 0
    this.dropped = 0
    this.notes = []
    this.chain = this.chain.then(async () => {
      if (this.failures >= MAX_DELIVERY_FAILURES) return
      try {
        await this.deps.deliver(this.def.sessionID, text, { monitorID: this.def.id, seq })
        this.failures = 0
      } catch (error) {
        this.failures += 1
        this.deps.log(`${this.def.id} (${this.def.name}): could not wake ${this.def.sessionID}: ${String(error)}`)
        if (this.failures >= MAX_DELIVERY_FAILURES && !this.closing) void this.stop(`session ${this.def.sessionID} did not accept ${MAX_DELIVERY_FAILURES} wakes in a row`)
      }
    })
  }

  /** The monitor is finished by itself (exit, ttl, event limit): last wake with what is left, then forget it. */
  private async end(reason: string): Promise<void> {
    if (this.closing) return
    this.closing = true
    this.clearTimers()
    await this.terminate()
    this.state = "ended"
    this.deps.log(`${this.def.id} (${this.def.name}): ${reason}`)
    this.flush([`Monitor ended: ${reason}.`])
    await this.chain
    this.deps.finished(this, reason)
  }

  private clearTimers(): void {
    const { clock } = this.deps
    for (const handle of [this.batchTimer, this.cycleTimer, this.ttlTimer, this.heartbeatTimer]) if (handle !== undefined) clock.clearTimeout(handle)
    this.batchTimer = this.cycleTimer = this.ttlTimer = this.heartbeatTimer = undefined
  }

  private signalChild(): void {
    const child = this.child
    if (!child) return
    child.kill("SIGTERM")
    const grace = this.deps.clock.setTimeout(() => child.kill("SIGKILL"), this.deps.options.killGraceSeconds * 1000)
    void this.exited.then(() => this.deps.clock.clearTimeout(grace))
  }

  private async terminate(): Promise<void> {
    if (!this.child) return
    this.signalChild()
    await this.exited
  }
}
