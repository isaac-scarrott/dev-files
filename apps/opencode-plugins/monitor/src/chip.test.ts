import assert from "node:assert/strict"
import { test } from "node:test"
import { monitorDeadlines, monitorStatus, type MonitorWords } from "./chip.js"
import type { MonitorItem } from "./control.js"

const words: MonitorWords = {
  events: (count, max) => (max === undefined ? `${count} events` : `${count} of ${max} events`),
  rearm: (span) => `re-arms in ${span}`,
  expires: (span) => `expires in ${span}`,
  paused: "paused",
}
const MIN = 60_000
const base: MonitorItem = { id: "mon_a", name: "watch", state: "running", events: 3, maxEvents: 50, expiresAt: 65 * MIN }

test("a running monitor reads events, then when it expires", () => {
  assert.equal(monitorStatus(base, 0, words), "3 of 50 events · expires in 1h 5m")
  assert.equal(monitorStatus({ ...base, events: 0, maxEvents: undefined }, 0, words), "0 events · expires in 1h 5m")
})

test("a waiting monitor says when it re-arms; a paused one says paused", () => {
  assert.equal(monitorStatus({ ...base, state: "waiting", nextRearmAt: 12 * MIN }, 0, words), "3 of 50 events · re-arms in 12m · expires in 1h 5m")
  assert.equal(monitorStatus({ ...base, state: "paused" }, 0, words), "3 of 50 events · paused · expires in 1h 5m")
})

test("deadlines are the times the line counts down to", () => {
  assert.deepEqual(monitorDeadlines([base, { ...base, state: "waiting", nextRearmAt: 7 }]), [65 * MIN, 65 * MIN, 7])
})
