import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseOptions } from "../src/options.js"
import { diskFiles } from "../src/files.js"
import { type Deps, type Notice, type Store, Tracker } from "../src/tracker.js"

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

export function harness(overrides: { boot?: string; location?: string; store?: ReturnType<typeof memoryStore>; options?: Record<string, unknown>; dir?: string; clock?: { now: number }; restartedAt?: number } = {}) {
  const dir = overrides.dir ?? mkdtempSync(join(tmpdir(), "shell-handoff-"))
  const store = overrides.store ?? memoryStore()
  const clock = overrides.clock ?? { now: 1_700_000_000_000 }
  const sent: { sessionID: string; text: string }[] = []
  const notices: Notice[] = []
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = []
  const state = { sessions: new Set<string>(["ses_a", "ses_b"]), failSynthetic: false }
  const deps: Deps = {
    options: parseOptions({ dir, ...overrides.options }),
    boot: overrides.boot ?? "100:1",
    location: overrides.location ?? "/work",
    now: () => clock.now,
    restartedAt: () => overrides.restartedAt ?? clock.now,
    store,
    files: diskFiles(dir),
    host: {
      sessionExists: async (id) => state.sessions.has(id),
      synthetic: async (sessionID, text) => {
        if (state.failSynthetic) throw new Error("host not ready")
        sent.push({ sessionID, text })
      },
    },
    notify: (notice) => void notices.push(notice),
    later: (run, ms) => {
      const timer = { run, ms, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    log: () => {},
  }
  const tracker = new Tracker(deps)
  return { tracker, deps, store, dir, clock, sent, notices, timers, state }
}

export const background = (shellID: string, extra: Record<string, unknown> = {}) => ({
  tool: "shell",
  sessionID: "ses_a",
  messageID: "msg_1",
  callID: "call_1",
  input: { command: "sleep 600", background: true, ...extra },
  status: "completed" as const,
  result: { output: `Command moved to the background (shell ID: ${shellID}).`, metadata: { status: "running", shellID } },
})
