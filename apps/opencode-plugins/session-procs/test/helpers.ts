import { parseOptions, type Options } from "../src/options.js"
import type { Store, LedgerDeps } from "../src/ledger.js"
import type { LogEntry } from "../src/log.js"
import { parsePs, type Proc, type Snapshot } from "../src/ps.js"

export const memoryStore = (): Store & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, JSON.parse(JSON.stringify(value))),
    remove: async (key) => void data.delete(key),
    scan: async (prefix) => [...data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })),
  }
}

export interface ProcBits {
  pid: number
  ppid?: number
  pgid?: number
  uid?: number
  start?: number
  cpu?: number
  zombie?: boolean
  command?: string
}

export const proc = (bits: ProcBits): Proc => ({
  pid: bits.pid,
  ppid: bits.ppid ?? 1,
  pgid: bits.pgid ?? bits.pid,
  uid: bits.uid ?? 501,
  start: bits.start ?? 1_700_000_000,
  cpu: bits.cpu ?? 0,
  zombie: bits.zombie ?? false,
  command: bits.command ?? "sleep 60",
})

/** A snapshot from bare processes, with the same indexes `ps.ts` builds. */
export const snapshot = (procs: Proc[], at = 1_700_000_000_000): Snapshot => {
  const byPid = new Map(procs.map((entry) => [entry.pid, entry]))
  const byPgid = new Map<number, Proc[]>()
  for (const entry of procs) byPgid.set(entry.pgid, [...(byPgid.get(entry.pgid) ?? []), entry])
  return { at, procs, byPid, byPgid }
}

export const parse = (text: string) => parsePs(text, 1_700_000_000_000)

export interface Harness {
  readonly deps: LedgerDeps
  readonly store: ReturnType<typeof memoryStore>
  readonly logs: LogEntry[]
  readonly clock: { now: number }
  readonly options: Options
  table: Snapshot
  set(table: Snapshot): void
}

/** A ledger's dependencies over a fake process table and a fake clock: every rule runs without spawning anything. */
export function ledgerHarness(overrides: { options?: Record<string, unknown>; uid?: number; table?: Snapshot } = {}): Harness {
  const store = memoryStore()
  const logs: LogEntry[] = []
  const clock = { now: 1_700_000_000_000 }
  const options = parseOptions({ dir: "/tmp/session-procs-test", ...overrides.options })
  const state: Harness = {
    deps: {
      store,
      ps: async () => state.table,
      now: () => clock.now,
      log: (entry) => void logs.push(entry),
      options,
      servicePid: 900,
      uid: overrides.uid ?? 501,
    },
    store,
    logs,
    clock,
    options,
    table: overrides.table ?? snapshot([]),
    set(table) {
      state.table = table
    },
  }
  return state
}
