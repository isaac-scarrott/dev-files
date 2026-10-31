import assert from "node:assert/strict"
import { test } from "node:test"
import type { Host, MessageInfo, SessionInfo } from "./host.js"
import { DEFAULTS, parseOptions, type Options } from "./options.js"
import { Orchestrator, type Caller } from "./orchestrator.js"
import { waitForSessions } from "./wait.js"

type Event = { type: string; data: Record<string, unknown> }

interface Fake {
  readonly host: Host
  readonly sessions: Map<string, SessionInfo>
  readonly messages: Map<string, MessageInfo[]>
  readonly calls: { name: string; input: unknown }[]
  readonly storage: Map<string, unknown>
  emit(event: Event): void
  session(partial: Partial<SessionInfo> & { id: string }): SessionInfo
}

function session(partial: Partial<SessionInfo> & { id: string }): SessionInfo {
  const now = Date.now()
  return {
    projectID: "proj",
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: now, updated: now },
    location: { directory: "/work" },
    ...partial,
  } as unknown as SessionInfo
}

function fake(seed: SessionInfo[] = []): Fake {
  const sessions = new Map(seed.map((s) => [s.id, s]))
  const messages = new Map<string, MessageInfo[]>()
  const calls: Fake["calls"] = []
  const storage = new Map<string, unknown>()
  const listeners = new Set<(event: Event) => void>()
  let n = 0
  const host = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        const s = sessions.get(sessionID)
        if (!s) throw new Error(`not found: ${sessionID}`)
        return s
      },
      list: async (input?: { parentID?: string | null; project?: string }) => ({
        data: [...sessions.values()].filter((s) => {
          if (input?.project !== undefined) return s.projectID === input.project
          if (input?.parentID === undefined) return true
          return s.parentID === (input.parentID ?? undefined)
        }),
        cursor: {},
      }),
      create: async (input: Record<string, any> = {}) => {
        calls.push({ name: "create", input })
        const info = session({
          id: `ses_new${++n}`,
          parentID: input.parentID ?? undefined,
          agent: input.agent,
          model: input.model,
          title: input.title,
          metadata: input.metadata,
          permissions: input.permissions,
          location: { directory: input.location?.directory ?? "/work" },
        })
        sessions.set(info.id, info)
        return info
      },
      prompt: async (input: Record<string, any>) => {
        calls.push({ name: "prompt", input })
        return { id: `msg_${++n}`, sessionID: input.sessionID, type: "user", time: { created: Date.now() }, payload: {}, delivery: input.delivery }
      },
      interrupt: async (input: { sessionID: string }) => {
        calls.push({ name: "interrupt", input })
        return { interrupted: true }
      },
      context: async (input: { sessionID: string }) => {
        calls.push({ name: "context", input })
        return messages.get(input.sessionID) ?? []
      },
    },
    event: {
      subscribe: (options: { signal?: AbortSignal } = {}) => ({
        [Symbol.asyncIterator]() {
          const queue: Event[] = []
          let wake: (() => void) | undefined
          const push = (event: Event) => {
            queue.push(event)
            wake?.()
          }
          listeners.add(push)
          options.signal?.addEventListener("abort", () => {
            listeners.delete(push)
            wake?.()
          })
          return {
            async next() {
              for (;;) {
                const value = queue.shift()
                if (value) return { value, done: false as const }
                if (options.signal?.aborted) return { value: undefined, done: true as const }
                await new Promise<void>((resolve) => (wake = resolve))
              }
            },
            async return() {
              listeners.delete(push)
              return { value: undefined, done: true as const }
            },
          }
        },
      }),
    },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => {
        storage.set(key, value)
      },
      remove: async (key: string) => {
        storage.delete(key)
      },
      scan: async () => ({ entries: [] }),
    },
    permission: {
      assert: async (input: unknown) => {
        calls.push({ name: "assert", input })
      },
    },
  }
  return {
    host: host as unknown as Host,
    sessions,
    messages,
    calls,
    storage,
    emit: (event) => {
      for (const listener of [...listeners]) listener(event)
    },
    session,
  }
}

const caller = (sessionID: string, signal?: AbortSignal): Caller => ({ sessionID, agent: "build", messageID: "msg_caller", id: "call_1", signal })

function make(fakeHost: Fake, options: Partial<Options> = {}) {
  return new Orchestrator(fakeHost.host, { ...DEFAULTS, ...options })
}

const running = (id: string, partial: Partial<SessionInfo> = {}) => session({ id, time: { created: 1, updated: 2, busy: 10 }, ...partial })
const idle = (id: string, partial: Partial<SessionInfo> = {}) => session({ id, time: { created: 1, updated: 2, busy: 10, idle: 20 }, ...partial })

test("a child gets only the prompt and context, never the caller's messages", async () => {
  const f = fake([idle("ses_parent", { agent: "build", model: { providerID: "p", id: "m" } as any, permissions: [{ action: "edit", resource: "*", effect: "deny" }] as any })])
  f.messages.set("ses_parent", [{ id: "m1", type: "user", text: "secret history", time: { created: 1 } } as any])
  const result = await make(f).delegateTask(caller("ses_parent"), { prompt: "Do the thing", context: "Files: a.ts", wait: false })
  assert.equal(result.state, "running")
  const create = f.calls.find((c) => c.name === "create")?.input as any
  assert.equal(create.parentID, "ses_parent")
  assert.equal(create.agent, "build")
  assert.deepEqual(create.model, { providerID: "p", id: "m" })
  assert.deepEqual(create.permissions, [{ action: "edit", resource: "*", effect: "deny" }])
  assert.deepEqual(create.metadata, { orchestrator: { creator: "ses_parent", mode: "child", depth: 1 } })
  const prompt = f.calls.find((c) => c.name === "prompt")?.input as any
  assert.equal(prompt.text, "Do the thing\n\nFiles: a.ts")
  assert.equal(prompt.delivery, "queue")
  assert.ok(!f.calls.some((c) => c.name === "context" && (c.input as any).sessionID === "ses_parent"))
  assert.equal(f.calls.filter((c) => c.name === "assert").length, 1)
})

test("a session outside the tree is out of scope; project scope widens it", async () => {
  const f = fake([idle("ses_a"), idle("ses_other", { parentID: "ses_elsewhere" as any }), idle("ses_elsewhere")])
  await assert.rejects(make(f).readSession(caller("ses_a"), { sessionID: "ses_other" }), /outside this session's scope/)
  await assert.rejects(make(f).interruptSession(caller("ses_a"), { sessionID: "ses_other" }), /outside/)
  await assert.rejects(make(f).sendMessage(caller("ses_a"), { sessionID: "ses_other", text: "hi" }), /outside/)
  const read = await make(f, { scope: "project" }).readSession(caller("ses_a"), { sessionID: "ses_other" })
  assert.equal(read.session.id, "ses_other")
})

test("descendants, siblings and independents the caller created are in scope", async () => {
  const f = fake([
    idle("ses_root"),
    idle("ses_a", { parentID: "ses_root" as any }),
    idle("ses_b", { parentID: "ses_root" as any }),
    idle("ses_a_child", { parentID: "ses_a" as any }),
    idle("ses_a_grandchild", { parentID: "ses_a_child" as any }),
    idle("ses_free", { metadata: { orchestrator: { creator: "ses_a", mode: "independent", depth: 1 } } as any }),
    idle("ses_free_child", { parentID: "ses_free" as any }),
  ])
  const o = make(f)
  for (const id of ["ses_b", "ses_a_child", "ses_a_grandchild", "ses_free", "ses_free_child"]) {
    const read = await o.readSession(caller("ses_a"), { sessionID: id })
    assert.equal(read.session.id, id)
  }
  await assert.rejects(o.readSession(caller("ses_a"), { sessionID: "ses_root" }), /outside/)
})

test("depth limit counts ancestors", async () => {
  const f = fake([idle("ses_0"), idle("ses_1", { parentID: "ses_0" as any }), idle("ses_2", { parentID: "ses_1" as any })])
  await assert.rejects(make(f, { maxDepth: 2 }).createSessions(caller("ses_2"), { sessions: [{ prompt: "x" }] }), /Depth limit/)
  const ok = await make(f, { maxDepth: 2 }).createSessions(caller("ses_1"), { sessions: [{ prompt: "x" }] })
  assert.equal(ok.sessions[0]?.parentID, "ses_1")
  const free = await make(f, { maxDepth: 2 }).createSessions(caller("ses_2"), { sessions: [{ prompt: "x", mode: "independent" }] })
  assert.equal(free.sessions[0]?.parentID, undefined)
})

test("fan-out and concurrency limits", async () => {
  const f = fake([idle("ses_p"), idle("ses_c1", { parentID: "ses_p" as any }), running("ses_c2", { parentID: "ses_p" as any })])
  await assert.rejects(make(f, { maxChildren: 2 }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x" }] }), /maxChildren/)
  await assert.rejects(make(f, { maxChildren: 3 }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x" }, { prompt: "y" }] }), /maxChildren/)
  await assert.rejects(make(f, { maxConcurrent: 1 }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x" }] }), /maxConcurrent/)
  await assert.rejects(make(f, { maxConcurrent: 2 }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x" }, { prompt: "y" }] }), /maxConcurrent/)
  assert.equal(f.calls.filter((c) => c.name === "create").length, 0, "a batch over budget creates nothing")
  const ok = await make(f, { maxChildren: 4, maxConcurrent: 3 }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x" }, { prompt: "y" }] })
  assert.equal(ok.sessions.length, 2)
})

test("model allowlist and format", async () => {
  const f = fake([idle("ses_p")])
  await assert.rejects(make(f, { models: ["a/b"] }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x", model: "a/c" }] }), /not allowed/)
  await assert.rejects(make(f).createSessions(caller("ses_p"), { sessions: [{ prompt: "x", model: "nope" }] }), /provider\/model/)
  await make(f, { models: ["a/b"] }).createSessions(caller("ses_p"), { sessions: [{ prompt: "x", model: "a/b" }] })
  assert.deepEqual((f.calls.find((c) => c.name === "create")?.input as any).model, { providerID: "a", id: "b" })
})

test("clientRequestId reuses the session, and forgets it once the session is gone", async () => {
  const f = fake([idle("ses_p")])
  const o = make(f)
  const first = await o.createSessions(caller("ses_p"), { sessions: [{ prompt: "x", clientRequestId: "r1" }] })
  const second = await o.createSessions(caller("ses_p"), { sessions: [{ prompt: "x", clientRequestId: "r1" }] })
  assert.equal(second.sessions[0]?.id, first.sessions[0]?.id)
  assert.equal(second.sessions[0]?.reused, true)
  assert.equal(f.calls.filter((c) => c.name === "create").length, 1)
  assert.equal(f.calls.filter((c) => c.name === "prompt").length, 1)
  const other = await o.createSessions(caller("ses_q_absent").sessionID === "x" ? caller("ses_p") : caller("ses_p"), { sessions: [{ prompt: "x", clientRequestId: "r2" }] })
  assert.notEqual(other.sessions[0]?.id, first.sessions[0]?.id)
  f.sessions.delete(first.sessions[0]!.id)
  const third = await o.createSessions(caller("ses_p"), { sessions: [{ prompt: "x", clientRequestId: "r1" }] })
  assert.equal(third.sessions[0]?.reused, false)
  assert.notEqual(third.sessions[0]?.id, first.sessions[0]?.id)
})

test("send_message is idempotent per clientRequestId and refuses the caller itself", async () => {
  const f = fake([idle("ses_p"), idle("ses_c", { parentID: "ses_p" as any })])
  const o = make(f)
  const a = await o.sendMessage(caller("ses_p"), { sessionID: "ses_c", text: "go", delivery: "steer", clientRequestId: "m1" })
  const b = await o.sendMessage(caller("ses_p"), { sessionID: "ses_c", text: "go", delivery: "steer", clientRequestId: "m1" })
  assert.equal(a.messageID, b.messageID)
  assert.equal(f.calls.filter((c) => c.name === "prompt").length, 1)
  assert.equal((f.calls[0]?.input as any).delivery, "steer")
  await assert.rejects(o.sendMessage(caller("ses_p"), { sessionID: "ses_p", text: "go" }), /other sessions/)
})

test("waiting on the caller itself is refused", async () => {
  const f = fake([running("ses_p"), running("ses_c", { parentID: "ses_p" as any })])
  await assert.rejects(make(f).waitForSessions(caller("ses_p"), { sessionIDs: ["ses_c", "ses_p"] }), /running the call/)
})

test("interrupt targets a reachable session and never the caller", async () => {
  const f = fake([idle("ses_p"), running("ses_c", { parentID: "ses_p" as any })])
  const o = make(f)
  assert.deepEqual(await o.interruptSession(caller("ses_p"), { sessionID: "ses_c" }), { sessionID: "ses_c", interrupted: true })
  assert.deepEqual(f.calls.at(-1), { name: "interrupt", input: { sessionID: "ses_c" } })
  await assert.rejects(o.interruptSession(caller("ses_p"), { sessionID: "ses_p" }), /running the call/)
})

test("read_session pages from the end and caps size", async () => {
  const f = fake([idle("ses_p"), idle("ses_c", { parentID: "ses_p" as any })])
  const assistant = (id: string, text: string): MessageInfo =>
    ({ id, type: "assistant", time: { created: 1 }, agent: "build", model: {}, content: [{ type: "text", text }, { type: "tool", name: "read", state: { status: "completed" } }] }) as any
  f.messages.set("ses_c", [
    { id: "u1", type: "user", text: "task", time: { created: 1 } } as any,
    assistant("a1", "first"),
    { id: "u2", type: "user", text: "more", time: { created: 1 } } as any,
    assistant("a2", "x".repeat(100)),
  ])
  const capped = await make(f, { maxReadChars: 50 }).readSession(caller("ses_p"), { sessionID: "ses_c", limit: 2 })
  assert.equal(capped.total, 4)
  assert.deepEqual(
    capped.messages.map((m) => m.id),
    ["a2"],
  )
  assert.equal(capped.messages[0]?.text?.length, 50)
  assert.equal(capped.truncated, true)
  assert.deepEqual(capped.messages[0]?.tools, [{ name: "read", status: "completed" }])
  assert.equal(capped.finalText, "x".repeat(100))
  const o = make(f)
  const page = await o.readSession(caller("ses_p"), { sessionID: "ses_c", limit: 2 })
  assert.deepEqual(
    page.messages.map((m) => m.id),
    ["u2", "a2"],
  )
  assert.equal(page.truncated, false)
  const older = await o.readSession(caller("ses_p"), { sessionID: "ses_c", limit: 2, offset: 2 })
  assert.deepEqual(
    older.messages.map((m) => m.id),
    ["u1", "a1"],
  )
})

test("wait times out with state running", async () => {
  const f = fake([running("ses_c")])
  const started = Date.now()
  const outcome = await waitForSessions(f.host, ["ses_c"], { timeoutMs: 60, mode: "all" })
  assert.ok(Date.now() - started < 1_500)
  assert.equal(outcome.timedOut, true)
  assert.deepEqual(outcome.results, [{ sessionID: "ses_c", state: "running" }])
})

test("wait stops on the abort signal", async () => {
  const f = fake([running("ses_c")])
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 20)
  const outcome = await waitForSessions(f.host, ["ses_c"], { timeoutMs: 5_000, mode: "all", signal: controller.signal })
  assert.equal(outcome.aborted, true)
  assert.equal(outcome.timedOut, false)
  assert.equal(outcome.results[0]?.state, "running")
})

test("wait settles on terminal events, any mode returns at the first", async () => {
  const f = fake([running("ses_a"), running("ses_b")])
  setTimeout(() => f.emit({ type: "session.execution.failed", data: { sessionID: "ses_b", error: { message: "boom" } } }), 20)
  const any = await waitForSessions(f.host, ["ses_a", "ses_b"], { timeoutMs: 5_000, mode: "any" })
  assert.deepEqual(any.results, [
    { sessionID: "ses_a", state: "running" },
    { sessionID: "ses_b", state: "finished", outcome: "failed", reason: "boom" },
  ])
  setTimeout(() => f.emit({ type: "session.execution.succeeded", data: { sessionID: "ses_a" } }), 20)
  setTimeout(() => f.emit({ type: "session.deleted", data: { sessionID: "ses_b" } }), 30)
  const all = await waitForSessions(f.host, ["ses_a", "ses_b"], { timeoutMs: 5_000, mode: "all" })
  assert.equal(all.timedOut, false)
  assert.deepEqual(
    all.results.map((r) => r.state),
    ["finished", "deleted"],
  )
})

test("wait returns at once for an idle session, unless it must have run since the prompt", async () => {
  const f = fake([idle("ses_c")])
  const now = await waitForSessions(f.host, ["ses_c"], { timeoutMs: 5_000, mode: "all" })
  assert.equal(now.results[0]?.state, "finished")
  const later = await waitForSessions(f.host, ["ses_c"], { timeoutMs: 60, mode: "all", since: Date.now() })
  assert.equal(later.results[0]?.state, "running")
  assert.equal(later.timedOut, true)
})

test("delegate_task returns the child's final text", async () => {
  const f = fake([idle("ses_p")])
  const o = make(f, { defaultWaitMs: 5_000 })
  const run = o.delegateTask(caller("ses_p"), { prompt: "summarise", timeoutMs: 5_000 })
  await new Promise((resolve) => setTimeout(resolve, 10))
  const child = [...f.sessions.values()].find((s) => s.parentID === "ses_p")!
  f.messages.set(child.id, [{ id: "a1", type: "assistant", time: { created: 1 }, content: [{ type: "text", text: "done: 42" }] } as any])
  f.emit({ type: "session.execution.succeeded", data: { sessionID: child.id } })
  const result = await run
  assert.equal(result.state, "finished")
  assert.equal(result.outcome, "succeeded")
  assert.equal(result.result, "done: 42")
  assert.equal(result.session.id, child.id)
})

test("list_sessions covers children, independents and siblings; project needs the option", async () => {
  const f = fake([idle("ses_root"), idle("ses_p", { parentID: "ses_root" as any }), idle("ses_sib", { parentID: "ses_root" as any }), idle("ses_c", { parentID: "ses_p" as any })])
  const o = make(f)
  await o.createSessions(caller("ses_p"), { sessions: [{ prompt: "x", mode: "independent" }] })
  const children = await o.listSessions(caller("ses_p"), {})
  assert.deepEqual(
    children.sessions.map((s) => s.id).sort(),
    ["ses_c", "ses_new1"],
  )
  const siblings = await o.listSessions(caller("ses_p"), { scope: "siblings" })
  assert.deepEqual(
    siblings.sessions.map((s) => s.id),
    ["ses_sib"],
  )
  await assert.rejects(o.listSessions(caller("ses_p"), { scope: "project" }), /scope: "project"/)
  const all = await make(f, { scope: "project" }).listSessions(caller("ses_p"), { scope: "project" })
  assert.equal(all.sessions.length, 5)
})

test("options are validated", () => {
  assert.equal(parseOptions({}).maxDepth, 3)
  assert.equal(parseOptions({ maxDepth: 5, scope: "project" }).scope, "project")
  assert.throws(() => parseOptions({ maxDepth: 0 }), /positive integer/)
  assert.throws(() => parseOptions({ models: "x" }), /list/)
  assert.throws(() => parseOptions({ scope: "all" }), /scope/)
})
