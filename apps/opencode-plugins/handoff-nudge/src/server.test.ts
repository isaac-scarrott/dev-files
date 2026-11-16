import assert from "node:assert/strict"
import { test } from "node:test"
import plugin from "./server.js"
import { fake } from "../../test-utils/fake.js"

type Handler = (input: any) => Promise<any>

class Bus {
  private listeners = new Set<(event: any) => void>()
  emit(event: any) {
    for (const listener of this.listeners) listener(event)
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function boot(directory: string, storage: Map<string, unknown>, bus: Bus, sessions: Map<string, any>) {
  const synthetic: any[] = []
  const prompts: any[] = []
  const handlers: Record<string, Handler> = {}
  const events: [string, any][] = []
  const ctx = fake<Parameters<typeof plugin.setup>[0]>({
    options: { tiers: [200_000, 400_000, 700_000], coldWrite: 150_000, models: ["*opus*"] },
    location: { directory },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => void storage.set(key, JSON.parse(JSON.stringify(value))),
      remove: async (key: string) => void storage.delete(key),
    },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const session = sessions.get(sessionID)
        if (!session) throw new Error("missing")
        return session
      },
      synthetic: async (input: any) => (synthetic.push(input), { id: "n" }),
      prompt: async (input: any) => (prompts.push(input), { id: "p" }),
    },
    rpc: {
      register: async (_definition: unknown, impl: Record<string, Handler>) => {
        Object.assign(handlers, impl)
        return { events: { emit: async (name: string, data: unknown) => void events.push([name, data]) }, dispose: async () => {} }
      },
    },
    event: { subscribe: (options) => bus.subscribe([...options!.types!], options!.signal!) },
  })
  const quiet = console.log
  console.log = () => {}
  try {
    const cleanup = (await plugin.setup(ctx)) as () => Promise<void>
    return { synthetic, prompts, handlers, events, cleanup }
  } finally {
    console.log = quiet
  }
}

const now = Date.now()
const sessions = () => {
  const map = new Map<string, any>()
  const make = (id: string, extra: Record<string, any> = {}) =>
    map.set(id, {
      id,
      parentID: undefined,
      location: { directory: "/work" },
      model: { id: "opus", providerID: "claude-agent" },
      time: { created: now, busy: now, idle: now },
      ...extra,
    })
  make("s")
  make("child", { parentID: "s" })
  make("sonnet", { model: { id: "sonnet", providerID: "claude-agent" } })
  make("away", { location: { directory: "/elsewhere" } })
  return map
}

const tokens = (total: number) => ({ input: total, output: 10, reasoning: 0, cache: { read: 0, write: 0 } })

test("wiring: a step over a tier warns once, the pill reads it, hand off queues the prompt, delete forgets it", async () => {
  const storage = new Map<string, unknown>()
  const bus = new Bus()
  const map = sessions()
  const a = await boot("/work", storage, bus, map)
  const b = await boot("/other", storage, bus, map)
  try {
    bus.emit({ type: "session.step.ended", created: Date.now(), data: { sessionID: "s", tokens: tokens(412_000) } })
    await wait(50)
    assert.equal(a.synthetic.length, 1)
    assert.match(a.synthetic[0].text, /^<handoff-nudge>/)
    assert.equal(a.synthetic[0].delivery, "queue")
    assert.equal(a.synthetic[0].resume, false)
    assert.equal(b.synthetic.length, 0)
    const notify = a.events.find(([name]) => name === "notify")
    assert.equal(notify?.[1].kind, "info")
    assert.equal(notify?.[1].target.session, "s")
    assert.equal(notify?.[1].title, "Context is 412k")
    assert.ok(a.events.some(([name]) => name === "changed"))

    assert.deepEqual(await a.handlers.get({ sessionID: "s" }), { available: true, context: 412_000, tier: 400_000, dismissed: 0 })
    assert.deepEqual(await a.handlers.get({ sessionID: "child" }), { available: false, context: 0, tier: 0, dismissed: 0 })
    assert.deepEqual(await a.handlers.get({ sessionID: "sonnet" }), { available: false, context: 0, tier: 0, dismissed: 0 })

    // Another turn at the same size says nothing.
    bus.emit({ type: "session.execution.succeeded", created: Date.now(), data: { sessionID: "s" } })
    bus.emit({ type: "session.step.ended", created: Date.now(), data: { sessionID: "s", tokens: tokens(430_000) } })
    await wait(50)
    assert.equal(a.synthetic.length, 1)

    assert.deepEqual(await a.handlers.handoff({ sessionID: "s" }), { queued: true })
    assert.equal(a.prompts.length, 1)
    assert.equal(a.prompts[0].delivery, "queue")
    assert.match(a.prompts[0].text, /HANDOFF-<date>\.md/)
    assert.match(a.prompts[0].text, /Advice only; continue if mid-task\./)
    assert.equal((await a.handlers.get({ sessionID: "s" })).dismissed, 400_000)

    bus.emit({ type: "session.deleted", created: Date.now(), data: { sessionID: "s" } })
    await wait(50)
    assert.deepEqual(await a.handlers.get({ sessionID: "s" }), { available: true, context: 0, tier: 0, dismissed: 0 })
  } finally {
    await a.cleanup()
    await b.cleanup()
  }
})
