import assert from "node:assert/strict"
import { test } from "node:test"
import type { Host, SessionInfo } from "./host.js"
import { acquire } from "./hub.js"
import { DEFAULTS } from "./options.js"
import { registerTools } from "./tools.js"

const T0 = Date.parse("2026-11-01T12:00:00Z")

test("registers schedule_task, list_schedules and cancel_schedule under the scheduler namespace, round trip through the hub", async () => {
  const sessions = new Map<string, SessionInfo>([["ses_aaaaaaaa11111111", { id: "ses_aaaaaaaa11111111", title: "Main", projectID: "p", time: { created: T0, updated: T0 }, location: { directory: "/w" } } as unknown as SessionInfo]])
  const store = new Map<string, unknown>()
  const prompts: Record<string, any>[] = []
  const host = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const s = sessions.get(sessionID)
        if (!s) throw new Error("not found")
        return s
      },
      list: async () => ({ data: [...sessions.values()], cursor: {} }),
      prompt: async (input: Record<string, any>) => void prompts.push(input),
      synthetic: async () => {},
    },
    storage: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v), remove: async (k: string) => void store.delete(k) },
  } as unknown as Host

  const logs: string[] = []
  const options = { ...DEFAULTS, tickSeconds: 3600 }
  const { hub, release } = await acquire(host, options, { now: () => Date.now() }, (m) => logs.push(m))
  try {
    const added: any[] = []
    const editor = { namespace: (n: unknown) => void added.push({ namespace: n }), add: (t: any) => void added.push(t) }
    registerTools(editor as never, host, hub, options)
    const tools = Object.fromEntries(added.filter((t) => t.name).map((t) => [t.name, t]))
    assert.deepEqual(Object.keys(tools), ["schedule_task", "list_schedules", "cancel_schedule"])
    for (const t of Object.values<any>(tools)) {
      assert.deepEqual(t.options, { namespace: "scheduler", codemode: true })
      assert.doesNotMatch(t.description, /steer|queue|delivery/i)
    }
    const ctx = { sessionID: "ses_aaaaaaaa11111111" }
    const made = await tools.schedule_task.execute({ prompt: "ping", every: "2h", name: "pinger" }, ctx)
    assert.equal(made.output.name, "pinger")
    assert.equal(made.output.kind, "every")
    assert.equal(made.output.target, "Main [11111111]")
    const listed = await tools.list_schedules.execute({}, ctx)
    assert.equal(listed.output.schedules.length, 1)
    assert.equal(listed.output.schedules[0].id, made.output.id)
    await assert.rejects(tools.schedule_task.execute({ prompt: "x" }, ctx), /exactly one of/)
    await assert.rejects(tools.cancel_schedule.execute({ id: "sch_missing" }, ctx), /No schedule with id/)
    const cancelled = await tools.cancel_schedule.execute({ id: made.output.id }, ctx)
    assert.equal(cancelled.output.cancelled.id, made.output.id)
    assert.equal((await tools.list_schedules.execute({}, ctx)).output.recentlyEnded[0].reason, "cancelled")
  } finally {
    release()
  }
})
