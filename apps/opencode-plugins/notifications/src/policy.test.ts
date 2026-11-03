import assert from "node:assert/strict"
import test from "node:test"
import { normalize, type Notification, type NotifyKind } from "../../native-ui/src/notify-contract"
import { Admission, RATE_MAX, toastVerdict } from "./policy"
import { defaultSettings, type Settings } from "./settings"

const make = (kind: NotifyKind, extra: Record<string, unknown> = {}): Notification =>
  normalize({ kind, title: "t", target: { server: "s", session: "a" }, ...extra }, "scheduler", 1_000)!

const away = { focused: true, onScreen: false }
const here = { focused: true, onScreen: true }
const blurred = { focused: false, onScreen: false }

const settings = (change: (draft: { toast: Record<NotifyKind, boolean>; onScreen: { done: boolean; info: boolean }; muted: string[] }) => void): Settings => {
  const draft = structuredClone(defaultSettings) as unknown as Parameters<typeof change>[0]
  change(draft)
  return draft as unknown as Settings
}

test("defaults: needs-you, error and done toast; info is quiet", () => {
  assert.equal(toastVerdict(make("needs-you"), defaultSettings, away).show, true)
  assert.equal(toastVerdict(make("error"), defaultSettings, away).show, true)
  assert.equal(toastVerdict(make("done"), defaultSettings, away).show, true)
  assert.deepEqual(toastVerdict(make("info"), defaultSettings, away), { show: false, hold: false, reason: "off" })
})

test("the focus rule hides done and info for the session on screen, never error or needs-you", () => {
  const all = settings((d) => void (d.toast.info = true))
  assert.equal(toastVerdict(make("done"), all, here).reason, "on-screen")
  assert.equal(toastVerdict(make("info"), all, here).reason, "on-screen")
  assert.equal(toastVerdict(make("error"), all, here).show, true)
  assert.equal(toastVerdict(make("needs-you"), all, here).show, true)
})

test("a switch brings done back for the session on screen", () => {
  assert.equal(toastVerdict(make("done"), settings((d) => void (d.onScreen.done = true)), here).show, true)
})

test("a cell turned off wins over everything", () => {
  const off = settings((d) => void (d.toast.error = false))
  assert.equal(toastVerdict(make("error"), off, away).reason, "off")
})

test("a muted source is dropped before anything else", () => {
  const muted = settings((d) => void (d.muted = ["scheduler"]))
  assert.equal(toastVerdict(make("error"), muted, away).reason, "muted")
})

test("no focused window: transient toasts are skipped, persistent ones wait", () => {
  assert.equal(toastVerdict(make("error"), defaultSettings, blurred).reason, "unfocused")
  assert.deepEqual(toastVerdict(make("needs-you", { persistent: true }), defaultSettings, blurred), { show: false, hold: true, reason: "hold" })
})

test("burst: the same key, or the same kind and session, inside 2 s is one", () => {
  let now = 0
  const admission = new Admission(() => now)
  assert.equal(admission.admit(make("error", { key: "a" })), true)
  assert.equal(admission.admit(make("error", { key: "a" })), false)
  assert.equal(admission.admit(make("error", { key: "b" })), false, "same source, kind and session")
  now = 2_001
  assert.equal(admission.admit(make("error", { key: "a" })), true, "the window passed")
})

test("a duplicate does not extend the window", () => {
  let now = 0
  const admission = new Admission(() => now)
  admission.admit(make("error", { key: "a" }))
  now = 1_500
  admission.admit(make("error", { key: "a" }))
  now = 2_100
  assert.equal(admission.admit(make("error", { key: "a" })), true)
})

test("two persistent requests for one session are two notifications", () => {
  const admission = new Admission(() => 0)
  assert.equal(admission.admit(make("needs-you", { key: "p1", persistent: true })), true)
  assert.equal(admission.admit(make("needs-you", { key: "p2", persistent: true })), true)
})

test("different sources and sessions do not collapse", () => {
  const admission = new Admission(() => 0)
  assert.equal(admission.admit(make("error", { key: "a" })), true)
  assert.equal(admission.admit(normalize({ kind: "error", title: "t", key: "a", target: { server: "s", session: "a" } }, "monitor")!), true)
  assert.equal(admission.admit(normalize({ kind: "error", title: "t", key: "c", target: { server: "s", session: "z" } }, "scheduler")!), true)
})

test("rate: the sixth toast of a source in a minute overflows; a minute later it is clear", () => {
  let now = 0
  const admission = new Admission(() => now)
  const counts = Array.from({ length: RATE_MAX + 2 }, () => admission.overflow("scheduler"))
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 1, 2])
  assert.equal(admission.overflow("monitor"), 0)
  now = 61_000
  assert.equal(admission.overflow("scheduler"), 0)
})

test("system notifications: one per session per 30 s, six a minute", () => {
  let now = 0
  const admission = new Admission(() => now)
  assert.equal(admission.system(make("error")), true)
  assert.equal(admission.system(make("error")), false)
  now = 30_001
  assert.equal(admission.system(make("error")), true)
  now = 31_000
  const sessions = Array.from({ length: 6 }, (_, index) => admission.system(normalize({ kind: "error", title: "t", target: { server: "s", session: `x${index}` } }, "m")!))
  assert.deepEqual(sessions, [true, true, true, true, false, false], "two earlier ones count toward the six")
})
