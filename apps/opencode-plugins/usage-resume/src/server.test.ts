import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import plugin from "./server.js"

type Handler = (input: any) => Promise<any>

/** A fake plugin context with an event bus: drives the real `setup` the way the server does. */
async function boot(directory: string, storage: Map<string, unknown>, bus: Bus, options: Record<string, unknown>, sessions: Map<string, any>) {
  const prompts: any[] = []
  const handlers: Record<string, Handler> = {}
  let retry: ((event: any) => Promise<void> | void) | undefined
  const events: any[] = []
  const ctx = {
    options,
    location: { directory },
    storage: {
      get: async (k: string) => storage.get(k),
      set: async (k: string, v: unknown) => void storage.set(k, JSON.parse(JSON.stringify(v))),
      remove: async (k: string) => void storage.delete(k),
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const s = sessions.get(sessionID)
        if (!s) throw new Error("missing")
        return s
      },
      prompt: async (input: any) => (prompts.push(input), { id: "x" }),
      synthetic: async () => ({ id: "n" }),
      hook: async (name: string, cb: any) => {
        if (name === "retry") retry = cb
        return { dispose: async () => {} }
      },
    },
    rpc: {
      register: async (_def: unknown, impl: Record<string, Handler>) => {
        Object.assign(handlers, impl)
        return { events: { emit: async (name: string, data: unknown) => void events.push([name, data]) }, dispose: async () => {} }
      },
    },
    event: { subscribe: (opts: { types: string[]; signal: AbortSignal }) => bus.subscribe(opts.types, opts.signal) },
  }
  const cleanup = (await plugin.setup(ctx as never)) as () => Promise<void>
  return { prompts, handlers, retry: () => retry, cleanup, events }
}

class Bus {
  private listeners = new Set<(event: any) => void>()
  emit(event: any) {
    for (const l of this.listeners) l(event)
  }
  async *subscribe(types: string[], signal: AbortSignal) {
    const queue: any[] = []
    let wake: (() => void) | undefined
    const listener = (event: any) => {
      if (!types.includes(event.type)) return
      queue.push(event)
      wake?.()
    }
    this.listeners.add(listener)
    signal.addEventListener("abort", () => wake?.())
    try {
      while (!signal.aborted) {
        if (!queue.length) await new Promise<void>((resolve) => (wake = resolve))
        while (queue.length) yield queue.shift()
      }
    } finally {
      this.listeners.delete(listener)
    }
  }
}

const free = { five_hour: { utilization: 10, resets_at: new Date(Date.now() + 5 * 3_600_000).toISOString() }, seven_day: { utilization: 20, resets_at: new Date(Date.now() + 90 * 3_600_000).toISOString() } }
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("wiring: toggle over rpc, session.created seeding, a limit failure, resume only when on, subagents never", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "usage-resume-server-"))
  await writeFile(path.join(dir, "claude-a.json"), JSON.stringify({ access_token: "tok-a" }))
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify(free))) as typeof fetch
  const storage = new Map<string, unknown>()
  const bus = new Bus()
  const now = Date.now()
  const sessions = new Map<string, any>()
  const make = (id: string, extra: Record<string, any> = {}) =>
    sessions.set(id, { id, outcome: "failed", location: { directory: "/work" }, time: { created: now, busy: now - 10, idle: now }, ...extra })
  make("on")
  make("off")
  make("child", { parentID: "on" })
  const options = { authDir: dir, snapshotPath: "", sampleDir: path.join(dir, "samples"), marginSeconds: 0, tickSeconds: 1, staggerSeconds: 0, notices: false }
  const a = await boot("/work", storage, bus, options, sessions)
  // A second location's instance over the same storage hears the same events and must stay out of it.
  const b = await boot("/other", storage, bus, options, sessions)
  try {
    assert.deepEqual(await a.handlers.get({ sessionID: "on" }), { enabled: false, available: true, limited: false })
    assert.deepEqual(await a.handlers.get({ sessionID: "child" }), { enabled: false, available: false, limited: false })
    assert.deepEqual(await a.handlers.getDefault({}), { enabled: false })
    await a.handlers.set({ sessionID: "on", enabled: true })
    await a.handlers.set({ sessionID: "child", enabled: true })
    assert.deepEqual(await b.handlers.get({ sessionID: "on" }), { enabled: true, available: true, limited: false })
    assert.deepEqual(await a.handlers.get({ sessionID: "child" }), { enabled: false, available: false, limited: false })

    // The default turns on: a session created afterwards starts on without anyone touching it.
    await a.handlers.setDefault({ enabled: true })
    make("fresh")
    bus.emit({ type: "session.created", created: Date.now(), data: { sessionID: "fresh", location: { directory: "/work" } } })
    await wait(100)
    assert.deepEqual(await a.handlers.get({ sessionID: "fresh" }), { enabled: true, available: true, limited: false })

    const failed = (sessionID: string) =>
      bus.emit({
        type: "session.execution.failed",
        created: Date.now(),
        data: { sessionID, error: { type: "unknown", message: `Claude Code subscription limit reached (five hour). Resets at ${new Date(Date.now() + 500).toISOString()}.` } },
      })
    for (const id of ["on", "off", "child", "fresh"]) failed(id)
    // "off" has no choice and was created before the default: not resumed. The child is never resumed.
    await wait(3500)
    assert.deepEqual(a.prompts.map((p) => p.sessionID).sort(), ["fresh", "on"])
    assert.equal(b.prompts.length, 0)
    assert.equal(a.prompts[0].text, "Continue.")
    assert.equal(a.prompts[0].delivery, "queue")

    // The retry hook ends a run for an opted-in session only.
    const decision = { retry: true as boolean }
    const event = { sessionID: "on", error: { type: "unknown", message: "Claude Code subscription limit reached." }, decision } as any
    await a.retry()!(event)
    assert.deepEqual(event.decision, { retry: false })
    const offEvent = { sessionID: "off", error: { type: "unknown", message: "Claude Code subscription limit reached." }, decision: { retry: true } } as any
    await a.retry()!(offEvent)
    assert.deepEqual(offEvent.decision, { retry: true })

    const log = await readFile(path.join(dir, "samples", "usage-resume.log"), "utf8")
    assert.match(log, /loaded for \/work: auto-resume is opt-in/)
    assert.match(log, /off: not resuming: toggle off/)
    assert.match(log, /child: not resuming: subagent/)
    assert.match(log, /on: resumed/)
  } finally {
    await a.cleanup()
    await b.cleanup()
    globalThis.fetch = realFetch
  }
})

test("the pill state: limited only while stopped at a limit, opt in while limited, cleared when the session moves on", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "usage-resume-pill-"))
  await writeFile(path.join(dir, "claude-a.json"), JSON.stringify({ access_token: "tok-a" }))
  const realFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify(free))) as typeof fetch
  const storage = new Map<string, unknown>()
  const bus = new Bus()
  const now = Date.now()
  const sessions = new Map<string, any>()
  const make = (id: string, extra: Record<string, any> = {}) =>
    sessions.set(id, { id, outcome: "failed", location: { directory: "/work" }, time: { created: now, busy: now - 10, idle: now }, ...extra })
  make("s")
  make("child", { parentID: "s" })
  const options = { authDir: dir, snapshotPath: "", sampleDir: path.join(dir, "samples"), marginSeconds: 3600, tickSeconds: 60, staggerSeconds: 0, notices: false }
  const a = await boot("/work", storage, bus, options, sessions)
  const get = (sessionID: string) => a.handlers.get({ sessionID })
  const resetsAt = new Date(Date.now() + 3_600_000).toISOString()
  const failed = (sessionID: string) =>
    bus.emit({
      type: "session.execution.failed",
      created: Date.now(),
      data: { sessionID, error: { type: "unknown", message: `Claude Code subscription limit reached (five hour). Resets at ${resetsAt}.` } },
    })
  try {
    assert.equal((await get("s")).limited, false)
    failed("s")
    failed("child")
    await wait(100)
    // Visible although the session never opted in; a subagent never.
    assert.deepEqual(await get("s"), { enabled: false, available: true, limited: true })
    assert.deepEqual(await get("child"), { enabled: false, available: false, limited: false })
    assert.ok(a.events.some(([name, data]) => name === "changed" && data.sessionID === "s"))

    // Opting in while limited starts the wait; opting out stops it.
    await a.handlers.set({ sessionID: "s", enabled: true })
    const on = await get("s")
    assert.equal(on.enabled, true)
    assert.equal(on.limited, true)
    assert.equal(typeof on.resumesAt, "number")
    await a.handlers.set({ sessionID: "s", enabled: false })
    assert.deepEqual(await get("s"), { enabled: false, available: true, limited: true })

    // Running again clears it.
    bus.emit({ type: "session.execution.started", created: Date.now(), data: { sessionID: "s" } })
    await wait(100)
    assert.equal((await get("s")).limited, false)

    // A deleted session loses its stored choice.
    await a.handlers.set({ sessionID: "s", enabled: true })
    assert.ok([...storage.keys()].some((key) => key.endsWith("/s")))
    bus.emit({ type: "session.deleted", created: Date.now(), data: { sessionID: "s" } })
    await wait(100)
    assert.ok(![...storage.keys()].some((key) => key.endsWith("/s")))
  } finally {
    await a.cleanup()
    globalThis.fetch = realFetch
  }
})
