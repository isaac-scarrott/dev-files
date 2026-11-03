import assert from "node:assert/strict"
import test from "node:test"
import type { NotifyInput } from "../../native-ui/src/notify-contract"
import { createHostSignals, keys, REQUEST_DELAY_MS, type SignalData } from "./signals"

type Handler = (event: { data: unknown }) => void

function rig(opts: { tabs?: string[]; sessions?: Record<string, { title?: string; parentID?: string }>; permissions?: Record<string, string[]>; forms?: Record<string, { id: string; metadata?: Record<string, unknown> }[]>; running?: string[] } = {}) {
  const handlers = new Map<string, Handler>()
  const sessions = opts.sessions ?? { ses_1: { title: "Fix bug" } }
  const permissions = opts.permissions ?? {}
  const forms = opts.forms ?? {}
  const published: NotifyInput[] = []
  const cleared: string[] = []
  const timers: { fn: () => void; ms: number; live: boolean }[] = []
  const synced: string[] = []
  const data: SignalData = {
    on: (type, handler) => {
      handlers.set(type, handler)
      return () => void handlers.delete(type)
    },
    session: {
      get: (id) => sessions[id],
      root: (id) => sessions[id]?.parentID ?? id,
      family: (id) => [id, ...Object.keys(sessions).filter((child) => sessions[child].parentID === id)],
      status: (id) => (opts.running?.includes(id) ? "running" : "idle"),
      sync: async (id) => void synced.push(`session:${id}`),
      permission: { list: (id) => permissions[id]?.map((rid) => ({ id: rid })), sync: async (id) => void synced.push(`perm:${id}`) },
      form: { list: (id) => forms[id], sync: async (id) => void synced.push(`form:${id}`) },
    },
  }
  const signals = createHostSignals({
    server: "sidecar",
    data,
    hasTab: (id) => (opts.tabs ?? ["ses_1"]).includes(id),
    publish: (input) => void published.push(input),
    clear: (key) => void cleared.push(key),
    later: (fn, ms) => {
      const timer = { fn, ms, live: true }
      timers.push(timer)
      return () => void (timer.live = false)
    },
    text: { done: "Run finished", failed: "Run failed", permission: "Permission needed", question: "Question waiting", fallbackTitle: "Session" },
  })
  const emit = (type: string, payload: unknown) => handlers.get(type)!({ data: payload })
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }
  const fire = () => timers.filter((t) => t.live).forEach((t) => ((t.live = false), t.fn()))
  return { signals, emit, flush, fire, published, cleared, timers, handlers, synced, permissions, forms }
}

test("execution.succeeded on a root session with a tab is a done notification", async () => {
  const r = rig()
  r.signals.attach()
  r.emit("session.execution.succeeded", { sessionID: "ses_1" })
  await r.flush()
  assert.deepEqual(r.published, [{ kind: "done", title: "Run finished", body: "Fix bug", key: "host:done:ses_1", target: { server: "sidecar", session: "ses_1" } }])
})

test("done is skipped for a subagent, a session without a tab, and a parent whose child still runs", async () => {
  const r = rig({ tabs: ["ses_1", "ses_3"], sessions: { ses_1: { title: "a" }, ses_2: { parentID: "ses_1" }, ses_3: { title: "b" }, ses_9: { title: "no tab" } }, running: ["ses_2"] })
  r.signals.attach()
  for (const sessionID of ["ses_2", "ses_9", "ses_1"]) r.emit("session.execution.succeeded", { sessionID })
  await r.flush()
  assert.deepEqual(r.published, [])
})

test("execution.failed is an error with the failure message, aimed at the root for a subagent", async () => {
  const r = rig({ sessions: { ses_1: { title: "Fix bug" }, ses_2: { parentID: "ses_1", title: "child" } } })
  r.signals.attach()
  r.emit("session.execution.failed", { sessionID: "ses_2", error: { type: "x", message: "Rate limited" } })
  await r.flush()
  assert.deepEqual(r.published, [{ kind: "error", title: "Run failed", body: "Rate limited", key: "host:error:ses_2", target: { server: "sidecar", session: "ses_1" } }])
})

test("permission.asked raises a persistent needs-you only if it is still pending after the settle delay", async () => {
  const r = rig({ permissions: { ses_1: ["per_1"] } })
  r.signals.attach()
  r.emit("permission.asked", { sessionID: "ses_1", id: "per_1" })
  await r.flush()
  assert.equal(r.published.length, 0, "not at once")
  assert.equal(r.timers[0].ms, REQUEST_DELAY_MS)
  r.fire()
  assert.deepEqual(r.published, [{ kind: "needs-you", persistent: true, title: "Permission needed", body: "Fix bug", key: keys.permission("per_1"), target: { server: "sidecar", session: "ses_1" } }])
})

test("a permission answered within the delay (auto-approve) never toasts", async () => {
  const r = rig({ permissions: { ses_1: ["per_1"] } })
  r.signals.attach()
  r.emit("permission.asked", { sessionID: "ses_1", id: "per_1" })
  await r.flush()
  r.permissions.ses_1 = []
  r.emit("permission.replied", { sessionID: "ses_1", requestID: "per_1", reply: "once" })
  r.fire()
  assert.equal(r.published.length, 0)
  assert.deepEqual(r.cleared, ["host:perm:per_1"])
})

test("form.created for a question is needs-you, cleared by replied and by cancelled; other form kinds are ignored", async () => {
  const r = rig({ forms: { ses_1: [{ id: "frm_1" }] } })
  r.signals.attach()
  r.emit("form.created", { form: { id: "frm_x", sessionID: "ses_1", metadata: { kind: "auth" } } })
  r.emit("form.created", { form: { id: "frm_1", sessionID: "ses_1", metadata: { kind: "question" } } })
  await r.flush()
  r.fire()
  assert.deepEqual(r.published.map((n) => n.key), ["host:form:frm_1"])
  r.emit("form.replied", { id: "frm_1", sessionID: "ses_1", answer: {} })
  r.emit("form.cancelled", { id: "frm_2", sessionID: "ses_1" })
  assert.deepEqual(r.cleared, ["host:form:frm_1", "host:form:frm_2"])
})

test("a request for a subagent without its own tab is shown on the root's tab", async () => {
  const r = rig({ sessions: { ses_1: { title: "p" }, ses_2: { parentID: "ses_1", title: "c" } }, permissions: { ses_2: ["per_1"] } })
  r.signals.attach()
  r.emit("permission.asked", { sessionID: "ses_2", id: "per_1" })
  await r.flush()
  r.fire()
  assert.equal(r.published[0].target?.session, "ses_1")
})

test("reconcile syncs a session and raises what is still waiting, with no events", async () => {
  const r = rig({ permissions: { ses_1: ["per_1"] }, forms: { ses_1: [{ id: "frm_1", metadata: { kind: "mcp-elicitation" } }, { id: "frm_2", metadata: { kind: "auth" } }] } })
  await r.signals.reconcile("ses_1")
  assert.deepEqual(r.synced, ["perm:ses_1", "form:ses_1"])
  assert.deepEqual(r.published.map((n) => n.key), ["host:perm:per_1", "host:form:frm_1"])
})

test("detaching removes every listener and cancels pending timers", async () => {
  const r = rig({ permissions: { ses_1: ["per_1"] } })
  const stop = r.signals.attach()
  r.emit("permission.asked", { sessionID: "ses_1", id: "per_1" })
  await r.flush()
  stop()
  assert.equal(r.handlers.size, 0)
  assert.equal(r.timers.filter((t) => t.live).length, 0)
})

test("idle: attaching registers handlers and nothing else", () => {
  const r = rig()
  r.signals.attach()
  assert.equal(r.timers.length, 0)
  assert.equal(r.handlers.size, 7)
})
