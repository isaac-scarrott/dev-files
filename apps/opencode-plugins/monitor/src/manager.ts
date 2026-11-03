import { claim, killParked, park, type Handoff, type Registry } from "./handoff.js"
import { Monitor, type Definition } from "./monitor.js"
import type { Options } from "./options.js"
import type { Clock, Spawn } from "./process.js"
import { oneLine } from "./diag.js"
import { downtimeWindow, parseRunState, type RunState } from "./state.js"
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
  /** Where monitors wait between a plugin reload's old and new instance; shared by every instance in the process. */
  readonly registry: Registry
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
  /** The cap on events over the monitor's life; absent when it has none. */
  readonly maxEvents?: number
  readonly lastEvent: string | null
  readonly expiresAt: string
  readonly rearmMinutes?: number
  readonly nextRunAt?: string
  /** When the schedule last started a fresh run (a re-arm, or the restart that satisfied a due one); absent until it has. */
  readonly lastRearm?: string
  readonly nextRearm?: string
  /** Service restarts this monitor has been through. */
  readonly restartCount: number
  readonly pid?: number
  readonly paused?: boolean
}

const PREFIX = "monitor/def/"
const STATE_PREFIX = "monitor/state/"

const randomID = () => `mon_${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}`

export class Monitors {
  private readonly running = new Map<string, Monitor>()
  /** Writes of one monitor's state, in order, so a late heartbeat cannot land after the removal. */
  private readonly writes = new Map<string, Promise<unknown>>()
  private readonly finishedIDs = new Set<string>()

  constructor(private readonly deps: ManagerDeps) {}

  get count(): number {
    return this.running.size
  }

  async start(input: StartInput): Promise<MonitorInfo> {
    const { options, clock } = this.deps
    if (this.running.size >= options.maxMonitors) throw new Error(`${this.running.size} monitors are running; maxMonitors is ${options.maxMonitors}. Stop one with monitor.stop first.`)
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
   * Monitors from a previous run. Every one still within its ttl and event cap comes back (its command starts fresh) and
   * the first wake says so. The rest are forgotten and their session is told once that they are gone.
   */
  async restore(): Promise<void> {
    const { store, clock, log, sessions, options } = this.deps
    const now = clock.now()
    for (const { key, value } of await store.scan(PREFIX)) {
      const def = value as Definition
      if (def.origin !== this.deps.origin) continue
      const previous = parseRunState(await store.get(STATE_PREFIX + def.id))
      const active = (await sessions.state(def.sessionID)) === "active"
      // Nothing awaits between this claim and the adoption below (which registers the new owner), so a monitor that
      // survived a reload always has exactly one owner, however many instances restore at once.
      const survivor = claim(this.deps.registry, def.id)
      const forget = async (why: string, notify: boolean) => {
        log(`${def.id} (${def.name}): not restored: ${why}`)
        // Removed before the wake, so a failed or repeated restart cannot announce it twice.
        if (survivor) this.release(survivor)
        await store.remove(key)
        await store.remove(STATE_PREFIX + def.id)
        if (notify && active) await this.announceLost(def, previous)
      }
      if (survivor && active) {
        // A plugin reload, not a restart: the process kept running, so nothing is counted or announced.
        log(`${def.id} (${def.name}): adopted after a plugin reload (pid ${survivor.child?.pid ?? "none"})`)
        this.create(def).adopt(survivor)
      } else if (def.expiresAt <= now) {
        await forget("its time limit passed", true)
      } else if (def.maxEvents !== undefined && (previous?.events ?? 0) >= def.maxEvents) {
        await forget(`it already reached its limit of ${def.maxEvents} events`, true)
      } else if (!active) {
        await forget(`session ${def.sessionID} is gone or archived`, false)
      } else if (this.running.size >= options.maxMonitors) {
        await forget(`maxMonitors ${options.maxMonitors} reached`, true)
      } else {
        const monitor = this.create(def)
        const restartCount = (previous?.restartCount ?? 0) + 1
        log(`${def.id} (${def.name}): restored after a restart (restart ${restartCount})`)
        monitor.start({
          state: { ...previous, seq: previous?.seq ?? 0, restartCount, aliveAt: now, events: previous?.events ?? 0 },
          note: `This monitor was restarted automatically after OpenCode restarted (restart ${restartCount}). ${downtimeWindow(previous?.aliveAt, now)} Output produced while it was down was not seen.`,
        })
      }
    }
  }

  private async announceLost(def: Definition, previous: RunState | undefined): Promise<void> {
    const now = this.deps.clock.now()
    // Continues the monitor's own seq, so this notice is never confused with an earlier wake.
    const seq = (previous?.seq ?? 0) + 1
    const restart = (previous?.restartCount ?? 0) + 1
    const text = renderWake({
      name: def.name,
      id: def.id,
      seq,
      lines: [],
      dropped: 0,
      restart,
      notes: [`Monitor gone: OpenCode restarted (restart ${restart}) and this monitor was lost with it. ${downtimeWindow(previous?.aliveAt, now)} It is no longer running and will not send anything more. Start it again with monitor.start if you still need it.`],
    })
    try {
      await this.deps.sessions.prompt(def.sessionID, text, { monitorID: def.id, seq })
    } catch (error) {
      this.deps.log(`${def.id} (${def.name}): could not tell ${def.sessionID} it is gone: ${String(error)}`)
    }
  }

  /**
   * Service shutdown ends every process. A plugin reload (the module loaded again in the same process) leaves them
   * running: they wait in the registry for the new instance, which adopts them.
   */
  async dispose(): Promise<void> {
    const { registry, clock, options } = this.deps
    const all = [...this.running.values()]
    this.running.clear()
    if (registry.shuttingDown) {
      for (const monitor of all) registry.live.delete(monitor.def.id)
      await Promise.all(all.map((monitor) => monitor.dispose()))
      return
    }
    await Promise.all(
      all.map(async (monitor) => {
        const id = monitor.def.id
        if (registry.live.get(id)?.owner !== this) return // taken by the new instance already
        registry.live.delete(id)
        park(registry, monitor.detach(), clock, options.killGraceSeconds * 1000, this.deps.log)
        this.deps.log(`${id} (${monitor.def.name}): handed over for a plugin reload`)
        await monitor.settle() // the last-alive time, and any wake still being delivered
      }),
    )
  }

  private release(handoff: Handoff): void {
    killParked(handoff, this.deps.clock, this.deps.options.killGraceSeconds * 1000)
  }

  private create(def: Definition): Monitor {
    const { options, clock, spawn, sessions, log, store } = this.deps
    const monitor = new Monitor(def, {
      options,
      clock,
      spawn,
      log,
      saveState: (done, state) => this.write(done.def.id, () => store.set(STATE_PREFIX + done.def.id, JSON.parse(JSON.stringify(state)))),
      deliver: (sessionID, text, meta) => sessions.prompt(sessionID, text, meta),
      finished: (done) => {
        if (this.running.get(done.def.id) === done) this.running.delete(done.def.id)
        if (this.deps.registry.live.get(done.def.id)?.owner === this) this.deps.registry.live.delete(done.def.id)
        this.finishedIDs.add(done.def.id)
        void this.write(done.def.id, () => store.remove(STATE_PREFIX + done.def.id), true).catch(() => {})
        void store.remove(PREFIX + done.def.id).catch(() => {})
      },
    })
    this.running.set(def.id, monitor)
    this.deps.registry.live.set(def.id, {
      owner: this,
      detach: () => {
        this.running.delete(def.id)
        return monitor.detach()
      },
      kill: (signal) => monitor.killNow(signal),
    })
    return monitor
  }

  private write(id: string, task: () => Promise<unknown>, force = false): Promise<void> {
    if (this.finishedIDs.has(id) && !force) return Promise.resolve()
    const next = (this.writes.get(id) ?? Promise.resolve()).then(task).then(() => undefined)
    this.writes.set(id, next.catch(() => {}))
    return next
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
      ...(def.maxEvents === undefined ? {} : { maxEvents: def.maxEvents }),
      lastEvent: monitor.lastEventAt === undefined ? null : iso(monitor.lastEventAt),
      expiresAt: iso(def.expiresAt),
      ...(def.rearmMinutes === undefined ? {} : { rearmMinutes: def.rearmMinutes }),
      ...(next === undefined ? {} : { nextRunAt: iso(next) }),
      ...(monitor.lastRearmAt === undefined ? {} : { lastRearm: iso(monitor.lastRearmAt) }),
      ...(def.rearmMinutes === undefined || monitor.nextRearmAt === undefined ? {} : { nextRearm: iso(monitor.nextRearmAt) }),
      restartCount: monitor.restartCount,
      ...(monitor.pid === undefined ? {} : { pid: monitor.pid }),
      ...(monitor.paused ? { paused: true } : {}),
    }
  }
}
