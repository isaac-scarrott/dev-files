import assert from "node:assert/strict"
import test from "node:test"
import { normalize, type Notification, type NotifyInput } from "../../native-ui/src/notify-contract"
import { createSink, type SinkDeps, type ToastOptions } from "./sink"
import { Ledger } from "./ledger"
import { defaultSettings, type Settings } from "./settings"

function rig(over: Partial<SinkDeps> = {}) {
  const state = { now: 10_000, settings: defaultSettings as Settings, presence: { focused: true, onScreen: false }, shown: [] as ToastOptions[], dismissed: [] as ToastOptions[], opened: [] as unknown[], attention: [] as unknown[], timers: [] as { fn: () => void; ms: number; live: boolean }[] }
  const ledger = new Ledger(() => {})
  const deps: SinkDeps = {
    self: "notifications",
    track: { put: (n, host) => ledger.put(n, host), remove: (source, key) => void ledger.remove(source, key) },
    now: () => state.now,
    later: (fn, ms) => {
      const timer = { fn, ms, live: true }
      state.timers.push(timer)
      return () => void (timer.live = false)
    },
    settings: () => state.settings,
    presence: () => state.presence,
    show: (options) => {
      state.shown.push(options)
      return { dismiss: () => void state.dismissed.push(options) }
    },
    open: (target) => void state.opened.push(target),
    attention: (options) => void state.attention.push(options),
    text: { open: "Open", more: (count, source) => `${count} more from ${source}` },
    ...over,
  }
  const hub = createSink(deps)
  const send = (input: NotifyInput, source = "scheduler") => hub.sink.publish(normalize(input, source, state.now)!)
  return { hub, state, send, ledger }
}

const target = { server: "sidecar", session: "ses_1" }

test("an error toast carries the error variant and an Open action that opens the session", () => {
  const { state, send } = rig()
  send({ kind: "error", title: "Scheduled task failed", body: "delivery failed", target })
  assert.equal(state.shown.length, 1)
  assert.equal(state.shown[0].variant, "error")
  assert.equal(state.shown[0].persistent, false)
  state.shown[0].actions![0].run()
  assert.deepEqual(state.opened, [target])
})

test("severity maps to variant and icon; needs-you is persistent", () => {
  const { state, send } = rig()
  send({ kind: "needs-you", title: "Q", persistent: true, target, key: "q" })
  send({ kind: "done", title: "D", target, key: "d" })
  assert.deepEqual(state.shown.map((t) => [t.variant, t.icon, t.persistent]), [["default", "warning", true], ["success", undefined, false]])
})

test("a cell turned off shows nothing; the next settings read applies at once", () => {
  const { state, send } = rig()
  state.settings = { ...defaultSettings, toast: { ...defaultSettings.toast, error: false } }
  send({ kind: "error", title: "x", target, key: "a" })
  assert.equal(state.shown.length, 0)
  state.settings = defaultSettings
  state.now += 3_000
  send({ kind: "error", title: "x", target, key: "b" })
  assert.equal(state.shown.length, 1)
})

test("the session on screen gets no done toast but does get an error", () => {
  const { state, send } = rig()
  state.presence = { focused: true, onScreen: true }
  send({ kind: "done", title: "d", target, key: "d" })
  send({ kind: "error", title: "e", target, key: "e" })
  assert.deepEqual(state.shown.map((t) => t.title), ["e"])
})

test("same key again replaces the live toast; clear retracts it", () => {
  const { hub, state, send } = rig()
  send({ kind: "needs-you", title: "first", persistent: true, target, key: "k" })
  state.now += 3_000
  send({ kind: "needs-you", title: "second", persistent: true, target, key: "k" })
  assert.deepEqual(state.dismissed.map((t) => t.title), ["first"])
  hub.sink.clear("scheduler", "k")
  assert.deepEqual(state.dismissed.map((t) => t.title), ["first", "second"])
})

test("a persistent alert with no focused window waits and appears when a window gains focus", () => {
  const { hub, state, send } = rig()
  state.presence = { focused: false, onScreen: false }
  send({ kind: "needs-you", title: "Q", persistent: true, target, key: "q" })
  assert.equal(state.shown.length, 0)
  state.presence = { focused: true, onScreen: false }
  hub.focusGained()
  hub.focusGained()
  assert.equal(state.shown.length, 1, "shown once")
})

test("a burst of identical notifications raises one toast; hundreds of distinct ones overflow into one summary", () => {
  const { state, send } = rig()
  for (let index = 0; index < 200; index++) send({ kind: "error", title: "same", target, key: "same" })
  assert.equal(state.shown.length, 1)
  for (let index = 0; index < 200; index++) send({ kind: "error", title: `e${index}`, target: { server: "sidecar", session: `s${index}` }, key: `k${index}` })
  const summaries = state.shown.filter((t) => t.title.includes("more from"))
  assert.equal(state.shown.length - summaries.length, 5, "five toasts, the rest summarised")
  assert.equal(summaries.length, 1, "one summary toast however many events overflow")
  assert.equal(state.timers.filter((t) => t.live).length, 1, "one pending refresh")
  state.timers.find((t) => t.live)!.fn()
  assert.equal(state.shown.at(-1)!.title, "196 more from scheduler")
  assert.equal(state.dismissed.filter((t) => t.title.includes("more from")).length, 1, "the refresh replaced the old summary")
})

test("a plugin error absorbs the host's run-failed toast for the same session, in either order", () => {
  const first = rig()
  first.send({ kind: "error", title: "Run failed", target, key: "host:error:ses_1" }, "notifications")
  first.state.now += 1_000
  first.send({ kind: "error", title: "Usage limit reached", target, key: "limit" }, "usage-resume")
  assert.deepEqual(first.state.dismissed.map((t) => t.title), ["Run failed"])
  assert.deepEqual(first.state.shown.map((t) => t.title), ["Run failed", "Usage limit reached"])

  const second = rig()
  second.send({ kind: "error", title: "Usage limit reached", target, key: "limit" }, "usage-resume")
  second.state.now += 1_000
  second.send({ kind: "error", title: "Run failed", target, key: "host:error:ses_1" }, "notifications")
  assert.deepEqual(second.state.shown.map((t) => t.title), ["Usage limit reached"])
})

test("host signals never repeat the host's system notification; plugin ones go through ctx.attention", () => {
  const { state, send } = rig()
  send({ kind: "error", title: "Run failed", target, key: "host:error:ses_1" }, "notifications")
  assert.equal(state.attention.length, 0)
  send({ kind: "error", title: "Task failed", target, key: "f" }, "scheduler")
  send({ kind: "info", title: "started", target, key: "i" }, "monitor")
  assert.equal(state.attention.length, 1)
  assert.deepEqual(state.attention[0], { title: "Task failed", message: undefined, variant: "error", session: { server: "sidecar", id: "ses_1" }, id: `scheduler\u0000f\u0000${10_000}` })
})

test("a muted source reaches neither toast nor system notification", () => {
  const { state, send } = rig()
  state.settings = { ...defaultSettings, muted: ["scheduler"] }
  send({ kind: "error", title: "x", target, key: "a" })
  assert.equal(state.shown.length + state.attention.length, 0)
})

test("transient entries do not accumulate", () => {
  const { hub, state, send } = rig()
  for (let index = 0; index < 50; index++) {
    state.now += 11_000
    send({ kind: "done", title: "d", target, key: `k${index}` })
  }
  assert.ok(hub.size() <= 2)
})

test("dispose closes everything it shows", () => {
  const { hub, state, send } = rig()
  send({ kind: "needs-you", title: "Q", persistent: true, target, key: "q" })
  hub.dispose()
  assert.equal(state.dismissed.length, 1)
  assert.equal(hub.size(), 0)
})

test("a notification typed as Notification is accepted by the sink", () => {
  const n: Notification = normalize({ kind: "info", title: "x" }, "monitor")!
  const { hub } = rig()
  assert.doesNotThrow(() => hub.sink.publish(n))
})

test("a persistent request asked again unchanged (a reconnect) is not shown twice", () => {
  const { state, send } = rig()
  send({ kind: "needs-you", title: "Q", persistent: true, target, key: "q" })
  state.now += 5_000
  send({ kind: "needs-you", title: "Q", persistent: true, target, key: "q" })
  assert.equal(state.shown.length, 1)
  assert.equal(state.dismissed.length, 0)
  state.now += 5_000
  send({ kind: "needs-you", title: "Q2", persistent: true, target, key: "q" })
  assert.equal(state.shown.length, 2, "a changed one replaces it")
})

test("what waits on a session is tracked even when its toast is off, and clear() retracts it", () => {
  const { state, send, hub, ledger } = rig()
  state.settings = { ...defaultSettings, toast: { ...defaultSettings.toast, info: false } }
  send({ kind: "info", title: "Monitor ended", target, key: "ended" }, "monitor")
  assert.equal(state.shown.length, 0)
  assert.equal(ledger.list().length, 1)
  assert.equal(ledger.list()[0]!.host, false)
  hub.sink.clear("monitor", "ended")
  assert.equal(ledger.list().length, 0)
})

test("the host-derived source is tracked as host; a muted source and a notification without a session are not tracked", () => {
  const { state, send, ledger } = rig()
  send({ kind: "done", title: "Run finished", target, key: "host:done:ses_1" }, "notifications")
  assert.equal(ledger.list()[0]!.host, true)
  state.settings = { ...defaultSettings, muted: ["scheduler"] }
  send({ kind: "error", title: "muted", target, key: "m" }, "scheduler")
  send({ kind: "error", title: "no session", key: "n" }, "monitor")
  assert.equal(ledger.list().length, 1)
})

test("the session on screen leaves nothing waiting except a request that needs an answer", () => {
  const { state, send, ledger } = rig()
  state.presence = { focused: true, onScreen: true }
  send({ kind: "done", title: "d", target, key: "d" }, "notifications")
  send({ kind: "error", title: "e", target, key: "e" }, "scheduler")
  send({ kind: "needs-you", title: "q", target, key: "q", persistent: true }, "notifications")
  assert.deepEqual(ledger.list().map((entry) => entry.key), ["q"])
  assert.equal(state.shown.length, 2, "the error toast and the request still show")
})
