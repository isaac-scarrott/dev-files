import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import {
  NOTIFY_KEY, NOTIFY_PROTOCOL, acquirePublisher, activeSink, clearNotification, defaultKey, normalize, notify, notifyFromServer, provideSink,
  publishers, sourceOfEvent, type Notification, type NotifyContext, type NotifySink,
} from "./notify-contract.js"

const toasts: { title: string; description?: string; variant?: string; persistent?: boolean; actions?: readonly { label: string; run(): void }[]; dismissed: boolean }[] = []
const opened: unknown[] = []
const context = (id = "p", withTabs = true): NotifyContext => ({
  id,
  toast: { show: (o) => { const t = { ...o, dismissed: false }; toasts.push(t); return { dismiss: () => { t.dismissed = true } } } },
  tabs: withTabs ? { open: (s, o) => { opened.push([s, o]) } } : undefined,
})
const sink = (accepts: readonly number[] = [NOTIFY_PROTOCOL], got: Notification[] = [], cleared: string[] = []): NotifySink & { got: Notification[]; cleared: string[] } =>
  ({ id: "s", accepts, publish: (n) => { got.push(n) }, clear: (s, k) => { cleared.push(`${s}|${k}`) }, got, cleared })

afterEach(() => { toasts.length = 0; opened.length = 0; delete (globalThis as Record<symbol, unknown>)[NOTIFY_KEY] })

test("without a sink a needs-you notification is the plugin's own persistent toast with Open", () => {
  const c = context()
  assert.equal(notify(c, { kind: "needs-you", title: "Approve?", persistent: true, target: { server: "srv", session: "ses_1" } }), "fallback")
  assert.equal(toasts[0].persistent, true)
  toasts[0].actions![0].run()
  assert.deepEqual(opened, [[{ server: "srv", id: "ses_1" }, { focus: true }]])
})

test("info stays quiet without a hub; done and error toast with their variant", () => {
  const c = context()
  assert.equal(notify(c, { kind: "info", title: "woke" }), "none")
  assert.equal(toasts.length, 0)
  notify(c, { kind: "done", title: "ok" })
  notify(c, { kind: "error", title: "bad" })
  assert.deepEqual(toasts.map((t) => t.variant), ["success", "error"])
})

test("a toast without a target or without tabs has no action", () => {
  notify(context(), { kind: "error", title: "x" })
  notify(context("q", false), { kind: "error", title: "y", target: { server: "s", session: "a" } })
  assert.equal(toasts[0].actions, undefined)
  assert.equal(toasts[1].actions, undefined)
})

test("the same key replaces the fallback toast and clearNotification dismisses it", () => {
  const c = context()
  notify(c, { kind: "needs-you", title: "one", key: "k" })
  notify(c, { kind: "needs-you", title: "two", key: "k" })
  assert.deepEqual(toasts.map((t) => t.dismissed), [true, false])
  clearNotification(c, "k")
  assert.equal(toasts[1].dismissed, true)
})

test("a sink receives a fully formed notification and no toast shows", () => {
  const s = sink()
  provideSink(s)
  assert.equal(notify(context("monitor"), { kind: "done", title: "build", target: { server: "srv", session: "ses_1" } }), "hub")
  assert.equal(toasts.length, 0)
  const n = s.got[0]
  assert.equal(n.v, NOTIFY_PROTOCOL)
  assert.equal(n.source, "monitor")
  assert.equal(n.severity, "success")
  assert.equal(n.key, "monitor:done:srv/ses_1")
  assert.deepEqual(n.action, { type: "open-session" })
  assert.equal(n.persistent, false)
})

test("clearNotification reaches the sink with source and key", () => {
  const s = sink()
  provideSink(s)
  clearNotification(context("sched"), "k1")
  assert.deepEqual(s.cleared, ["sched|k1"])
})

test("a sink that throws falls back to the toast", () => {
  provideSink({ id: "bad", accepts: [1], publish: () => { throw new Error("boom") }, clear: () => {} })
  assert.equal(notify(context(), { kind: "error", title: "x" }), "fallback")
  assert.equal(toasts.length, 1)
})

test("a sink that speaks only another major is ignored; the older one answers again when the newer leaves", () => {
  const old = sink()
  const future = sink([2])
  const releaseOld = provideSink(old)
  const releaseFuture = provideSink(future)
  assert.equal(activeSink(), old)
  notify(context(), { kind: "done", title: "a" })
  assert.equal(old.got.length, 1)
  assert.equal(future.got.length, 0)
  const newer = sink()
  const releaseNewer = provideSink(newer)
  assert.equal(activeSink(), newer)
  releaseNewer()
  assert.equal(activeSink(), old)
  releaseFuture()
  releaseOld()
  assert.equal(activeSink(), undefined)
})

test("publishers are reference-counted per source and the registry is removed when nothing is left", () => {
  const a = acquirePublisher("monitor")
  const b = acquirePublisher("monitor")
  const c = acquirePublisher("scheduler")
  assert.deepEqual(publishers(), ["monitor", "scheduler"])
  a(); a()
  assert.deepEqual(publishers(), ["monitor", "scheduler"], "a double release counts once")
  b(); c()
  assert.deepEqual(publishers(), [])
  assert.equal((globalThis as Record<symbol, unknown>)[NOTIFY_KEY], undefined)
})

test("a hot reload (new run before the old cleanup) leaves one entry, then none", () => {
  const oldRun = acquirePublisher("monitor")
  const oldSink = provideSink(sink())
  const newRun = acquirePublisher("monitor")
  const newSink = provideSink(sink())
  oldRun(); oldSink()
  assert.deepEqual(publishers(), ["monitor"])
  assert.ok(activeSink())
  newRun(); newSink()
  assert.equal((globalThis as Record<symbol, unknown>)[NOTIFY_KEY], undefined)
})

test("normalize reads foreign payloads defensively", () => {
  assert.equal(normalize(null, "x"), undefined)
  assert.equal(normalize({ kind: "done" }, "x"), undefined, "no title, nothing to show")
  const n = normalize({ kind: "mystery", title: "t".repeat(500), body: "", extra: 1, target: { server: "s" }, severity: "loud", persistent: "yes" }, "x", 5)!
  assert.equal(n.kind, "info")
  assert.equal(n.title.length, 200)
  assert.equal(n.body, undefined)
  assert.equal(n.target, undefined, "half a target is no target")
  assert.equal(n.severity, "info")
  assert.equal(n.persistent, false)
  assert.equal(n.at, 5)
  assert.equal(n.key, defaultKey("x", "info", undefined))
})

test("a server half names only the session; the hub supplies the server", () => {
  const n = normalize({ kind: "error", title: "t", target: { session: "ses_1" } }, "scheduler", 1, "sidecar")!
  assert.deepEqual(n.target, { server: "sidecar", session: "ses_1" })
  assert.deepEqual(n.action, { type: "open-session" })
  assert.equal(normalize({ kind: "error", title: "t", target: { session: "ses_1" } }, "scheduler", 1)!.target, undefined, "no server known: no target")
})

test("open-message keeps its message and needs a message to count", () => {
  const t = { server: "s", session: "a" }
  assert.deepEqual(normalize({ kind: "info", title: "t", target: t, action: { type: "open-message", message: "msg_1" } }, "x")!.action, { type: "open-message", message: "msg_1" })
  assert.deepEqual(normalize({ kind: "info", title: "t", target: t, action: { type: "open-message" } }, "x")!.action, { type: "open-session" })
  assert.equal(normalize({ kind: "info", title: "t", action: { type: "open-session" } }, "x")!.action, undefined, "no target, nothing to open")
})

test("sourceOfEvent reads rpc.<source>.notify, dots in the source included", () => {
  assert.equal(sourceOfEvent("rpc.monitor.notify"), "monitor")
  assert.equal(sourceOfEvent("rpc.my.plugin.notify"), "my.plugin")
  assert.equal(sourceOfEvent("rpc.monitor.running"), undefined)
  assert.equal(sourceOfEvent("rpc..notify"), undefined)
  assert.equal(sourceOfEvent(3), undefined)
})

test("a server half's event reaches the sink with the desktop's own server filled in, or its own toast with Open without one", () => {
  const ctx: NotifyContext = { ...context("scheduler"), servers: { list: () => ["remote", "sidecar"], get: (id) => ({ builtin: id === "sidecar" }) } }
  const fallback = notifyFromServer(ctx, { kind: "error", title: "Dropped", key: "scheduler:failed:1", target: { session: "ses_1" } })
  assert.equal(fallback, "fallback")
  toasts[0].actions![0].run()
  assert.deepEqual(opened, [[{ server: "sidecar", id: "ses_1" }, { focus: true }]])
  const s = sink()
  provideSink(s)
  assert.equal(notifyFromServer(ctx, { kind: "error", title: "Dropped", target: { session: "ses_1" } }), "hub")
  assert.deepEqual(s.got[0].target, { server: "sidecar", session: "ses_1" })
  assert.equal(s.got[0].source, "scheduler")
  assert.equal(notifyFromServer(ctx, { kind: "error" }), "none", "no title, nothing to show")
})
