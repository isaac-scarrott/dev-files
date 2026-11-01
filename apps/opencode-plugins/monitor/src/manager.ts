import { Monitor, type Definition } from "./monitor.js"
import type { Options } from "./options.js"
import type { Clock, Spawn } from "./process.js"
import { oneLine } from "./diag.js"
import { renderWake } from "./wrap.js"

export interface Store {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
  scan(prefix: string): Promise<{ key: string; value: unknown }[]>
}

export interface Sessions {
  /** The session's state, or undefined when it no longer exists. */
  state(sessionID: string): Promise<"active" | "archived" | undefined>
  prompt(sessionID: string, text: string, meta: { monitorID: string; seq: number }): Promise<void>
}

export interface ManagerDeps {
  readonly options: Options
  readonly clock: Clock
  readonly spawn: Spawn
  readonly store: Store
  readonly sessions: Sessions
  readonly log: (message: string) => void
  readonly newID?: () => string
  /** The plugin instance's directory: the plugin loads once per directory and they share storage. */
  readonly origin: string
}

export interface StartInput {
  readonly command: string
  readonly name?: string
  readonly cwd: string
  readonly sessionID: string
  readonly match?: string
  readonly batchSeconds: number
  readonly maxEvents?: number
  readonly ttlMinutes: number
  readonly rearmMinutes?: number
}

export interface MonitorInfo {
  readonly id: string
  readonly name: string
  readonly command: string
  readonly cwd: string
  readonly session: string
  readonly state: string
  readonly runningSince: string
  readonly events: number
  readonly lastEvent: string | null
  readonly expiresAt: string
  readonly rearmMinutes?: number
  readonly nextRunAt?: string
  readonly paused?: boolean
}

const PREFIX = "monitor/def/"

const randomID = () => `mon_${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}`

export class Monitors {
  private readonly running = new Map<string, Monitor>()

  constructor(private readonly deps: ManagerDeps) {}

  get count(): number {
    return this.running.size
  }

  async start(input: StartInput): Promise<MonitorInfo> {
    const { options, clock } = this.deps
    if (this.running.size >= options.maxMonitors) throw new Error(`${this.running.size} monitors are running; maxMonitors is ${options.maxMonitors}. Stop one with stop_monitor first.`)
    let id = (this.deps.newID ?? randomID)()
    while (this.running.has(id)) id = (this.deps.newID ?? randomID)()
    const now = clock.now()
    const def: Definition = {
      id,
      name: input.name?.trim() || oneLine(input.command, 40),
      command: input.command,
      cwd: input.cwd,
      sessionID: input.sessionID,
      match: input.match,
      batchSeconds: input.batchSeconds,
      maxEvents: input.maxEvents,
      rearmMinutes: input.rearmMinutes,
      createdAt: now,
      origin: this.deps.origin,
      expiresAt: now + input.ttlMinutes * 60_000,
    }
    const monitor = this.create(def)
    await this.deps.store.set(PREFIX + id, JSON.parse(JSON.stringify(def)))
    this.deps.log(`${id} (${def.name}): started for ${def.sessionID} in ${def.cwd}: ${oneLine(def.command)}`)
    monitor.start()
    return this.describe(monitor)
  }

  list(): MonitorInfo[] {
    return [...this.running.values()].map((monitor) => this.describe(monitor))
  }

  async stop(id: string): Promise<MonitorInfo | undefined> {
    const monitor = this.running.get(id)
    if (!monitor) return undefined
    const info = this.describe(monitor)
    await monitor.stop("stopped by request")
    return info
  }

  /** The session was archived or deleted: its monitors have no one to wake. */
  async removeSession(sessionID: string): Promise<void> {
    const mine = [...this.running.values()].filter((monitor) => monitor.def.sessionID === sessionID)
    await Promise.all(mine.map((monitor) => monitor.stop(`session ${sessionID} was archived or deleted`)))
  }

  /**
   * Monitors from a previous run. Only those with a re-arm schedule come back, and the first wake says so. The rest are
   * forgotten, because a command nobody asked for in this run must not start by itself, and their session is told once
   * that they are gone.
   */
  async restore(): Promise<void> {
    const { store, clock, log, sessions, options } = this.deps
    const now = clock.now()
    for (const { key, value } of await store.scan(PREFIX)) {
      const def = value as Definition
      if (def.origin !== this.deps.origin) continue
      const active = (await sessions.state(def.sessionID)) === "active"
      const forget = async (why: string, notify: boolean) => {
        log(`${def.id} (${def.name}): not restored: ${why}`)
        // Removed before the wake, so a failed or repeated restart cannot announce it twice.
        await store.remove(key)
        if (notify && active) await this.announceLost(def)
      }
      if (def.rearmMinutes === undefined) {
        await forget("no re-arm schedule, so it does not survive a restart", true)
      } else if (def.expiresAt <= now) {
        await forget("its time limit passed", true)
      } else if (!active) {
        await forget(`session ${def.sessionID} is gone or archived`, false)
      } else if (this.running.size >= options.maxMonitors) {
        await forget(`maxMonitors ${options.maxMonitors} reached`, true)
      } else {
        const monitor = this.create(def)
        log(`${def.id} (${def.name}): restored after a restart`)
        monitor.start("This monitor was restarted automatically after OpenCode restarted. Output produced while it was down was not seen.")
      }
    }
  }

  private async announceLost(def: Definition): Promise<void> {
    const text = renderWake({
      name: def.name,
      id: def.id,
      seq: 1,
      lines: [],
      dropped: 0,
      notes: [`Monitor gone: OpenCode restarted and this monitor was lost with it. It is no longer running and will not send anything more. Start it again with the monitor tool if you still need it.`],
    })
    try {
      await this.deps.sessions.prompt(def.sessionID, text, { monitorID: def.id, seq: 1 })
    } catch (error) {
      this.deps.log(`${def.id} (${def.name}): could not tell ${def.sessionID} it is gone: ${String(error)}`)
    }
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.running.values()].map((monitor) => monitor.dispose()))
    this.running.clear()
  }

  private create(def: Definition): Monitor {
    const { options, clock, spawn, sessions, log, store } = this.deps
    const monitor = new Monitor(def, {
      options,
      clock,
      spawn,
      log,
      deliver: (sessionID, text, meta) => sessions.prompt(sessionID, text, meta),
      finished: (done) => {
        if (this.running.get(done.def.id) === done) this.running.delete(done.def.id)
        void store.remove(PREFIX + done.def.id).catch(() => {})
      },
    })
    this.running.set(def.id, monitor)
    return monitor
  }

  private describe(monitor: Monitor): MonitorInfo {
    const { def } = monitor
    const iso = (ms: number) => new Date(ms).toISOString()
    const next = monitor.nextRunAt()
    return {
      id: def.id,
      name: def.name,
      command: def.command,
      cwd: def.cwd,
      session: def.sessionID,
      state: monitor.paused ? "paused" : monitor.state,
      runningSince: iso(monitor.startedAt),
      events: monitor.events,
      lastEvent: monitor.lastEventAt === undefined ? null : iso(monitor.lastEventAt),
      expiresAt: iso(def.expiresAt),
      ...(def.rearmMinutes === undefined ? {} : { rearmMinutes: def.rearmMinutes }),
      ...(next === undefined ? {} : { nextRunAt: iso(next) }),
      ...(monitor.paused ? { paused: true } : {}),
    }
  }
}
