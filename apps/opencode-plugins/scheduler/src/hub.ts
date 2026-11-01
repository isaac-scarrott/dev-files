import type { Host, SessionInfo } from "./host.js"
import type { Options } from "./options.js"
import { Scheduler, type AddInput, type Clock } from "./scheduler.js"

/** What the tools talk to: one scheduler for the whole process, with a timer that keeps it ticking. */
export interface Hub {
  add(host: Host, caller: SessionInfo, input: AddInput): ReturnType<Scheduler["add"]>
  list: Scheduler["list"]
  cancel: Scheduler["cancel"]
}

interface Entry {
  readonly scheduler: Promise<Scheduler>
  readonly hosts: Set<Host>
  timer?: ReturnType<typeof setTimeout>
  started: boolean
  stopped: boolean
}

let shared: Entry | undefined

/**
 * The server loads this plugin once per project location, all in one process over one shared storage. Two schedulers
 * would each fire every due job and overwrite each other's state, so instances share one scheduler and one timer; any
 * live instance's host can reach every session. The last instance out stops the timer.
 */
export async function acquire(host: Host, options: Options, clock: Clock, log: (message: string) => void): Promise<{ hub: Hub; release(): void }> {
  if (!shared || shared.stopped) {
    const hosts = new Set<Host>()
    const entry: Entry = {
      hosts,
      started: false,
      stopped: false,
      scheduler: Scheduler.create(options, clock, host.storage, log, () => hosts.values().next().value),
    }
    shared = entry
  }
  const entry = shared
  entry.hosts.add(host)
  const scheduler = await entry.scheduler
  const tickMs = options.tickSeconds * 1000

  // Wake at the next due time or after one tick, whichever is sooner. A timer that slept with the machine fires on wake.
  const arm = () => {
    if (entry.stopped) return
    clearTimeout(entry.timer)
    const due = scheduler.nextDueAt()
    const delay = due === undefined ? tickMs : Math.min(tickMs, Math.max(due - clock.now(), 0) + 25)
    entry.timer = setTimeout(() => void scheduler.tick().finally(arm), delay)
  }
  if (!entry.started) {
    entry.started = true
    log(`loaded: ${scheduler.list().jobs.length} schedule(s) kept, checking every ${options.tickSeconds}s`)
    void scheduler.tick().finally(arm)
  }

  const hub: Hub = {
    add: async (h, caller, input) => {
      const result = await scheduler.add(h, caller, input)
      arm()
      return result
    },
    list: () => scheduler.list(),
    cancel: async (id) => {
      const result = await scheduler.cancel(id)
      arm()
      return result
    },
  }
  return {
    hub,
    release() {
      entry.hosts.delete(host)
      if (entry.hosts.size === 0) {
        entry.stopped = true
        clearTimeout(entry.timer)
        if (shared === entry) shared = undefined
      }
    },
  }
}
