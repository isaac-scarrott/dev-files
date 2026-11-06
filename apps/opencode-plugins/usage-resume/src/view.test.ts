import assert from "node:assert/strict"
import { test } from "node:test"
import { type Loaded, pillFor, type PillText } from "./view.js"

const text: PillText = { title: "Auto-resume after usage limit", waiting: (time) => `Resuming ${time}`, off: "Resume after limit", failed: "Auto-resume unavailable" }
const NOW = Date.UTC(2026, 9, 31, 12)
const loaded = (state: Partial<Loaded["state"]>, sessionID = "ses_a"): Loaded => ({
  sessionID,
  state: { enabled: false, available: true, limited: true, ...state },
})
const pill = (input: { loaded?: Loaded; failed?: boolean; sessionID?: string }) =>
  pillFor({ sessionID: input.sessionID ?? "ses_a", loaded: input.loaded, failed: input.failed ?? false, now: NOW, text })

test("no pill while the session is not stopped at a limit, loading, or a subagent", () => {
  assert.equal(pill({}), undefined)
  assert.equal(pill({ loaded: loaded({ limited: false }) }), undefined)
  assert.equal(pill({ loaded: loaded({ available: false }) }), undefined)
})

test("a reading for another session is not shown while the routed one loads", () => {
  assert.equal(pill({ loaded: loaded({}, "ses_b") }), undefined)
})

test("limited and off: a warning pill whose click opts in", () => {
  assert.deepEqual(pill({ loaded: loaded({}) }), { label: "Resume after limit", icon: "refresh", tone: "warning", title: text.title, toggleTo: true })
})

test("limited and on: a success pill with the resume time whose click opts out", () => {
  const spec = pill({ loaded: loaded({ enabled: true, resumesAt: NOW + 3_600_000 }) })!
  assert.equal(spec.tone, "success")
  assert.match(spec.label, /^Resuming /)
  assert.equal(spec.toggleTo, false)
  assert.equal(pill({ loaded: loaded({ enabled: true }) })!.label, text.title)
})

test("a failed read is a danger pill that does nothing", () => {
  assert.deepEqual(pill({ failed: true }), { label: "Auto-resume unavailable", icon: "refresh", tone: "danger", title: text.title })
})
