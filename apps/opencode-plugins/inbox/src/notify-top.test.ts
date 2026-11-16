import assert from "node:assert/strict"
import { test } from "node:test"
import { createTopNotifier } from "./notify-top.js"

const EVERY = 10 * 60_000

const notifier = (options: Partial<{ everyMs: number; escalateMin: readonly number[] }> = {}) =>
  createTopNotifier({ everyMs: EVERY, escalateMin: [15, 60], ...options })

test("nothing waiting says nothing", () => {
  const top = notifier()
  assert.deepEqual(top.consider({ now: 0 }), { notify: false, reason: "none", passed: [] })
})

test("the first item notifies once, and the same top item every minute after says nothing", () => {
  const top = notifier()
  assert.equal(top.consider({ now: 1_000_000, top: { id: "a", blocked: false, ageMin: 1 } }).reason, "top")
  for (let minute = 2; minute < 10; minute++) {
    assert.equal(top.consider({ now: 1_000_000 + minute * 60_000, top: { id: "a", blocked: false, ageMin: minute } }).notify, false)
  }
})

test("a new top item notifies, but no more often than notifyEveryMin", () => {
  const top = notifier()
  assert.equal(top.consider({ now: 0, top: { id: "a", blocked: false, ageMin: 1 } }).notify, true)
  const early = top.consider({ now: 5 * 60_000, top: { id: "b", blocked: false, ageMin: 1 } })
  assert.deepEqual([early.notify, early.reason], [false, "throttled"])
  const later = top.consider({ now: 10 * 60_000, top: { id: "b", blocked: false, ageMin: 6 } })
  assert.deepEqual([later.notify, later.reason], [true, "top"], "a throttled change is not lost")
})

test("a blocked item notifies at 15 and at 60 minutes, once each, even while it is not the top", () => {
  const top = notifier()
  assert.equal(top.consider({ now: 0, top: { id: "other", blocked: false, ageMin: 1 }, blocked: [{ id: "b", ageMin: 14 }] }).notify, true)
  assert.equal(top.consider({ now: 5 * 60_000, top: { id: "other", blocked: true, ageMin: 11 }, blocked: [{ id: "b", ageMin: 15 }] }).notify, false, "inside notifyEveryMin")
  const fifteen = top.consider({ now: 12 * 60_000, top: { id: "other", blocked: true, ageMin: 13 }, blocked: [{ id: "b", ageMin: 17 }] })
  assert.deepEqual([fifteen.notify, fifteen.reason, fifteen.passed], [true, "escalate", [15]])
  assert.equal(top.consider({ now: 20 * 60_000, top: { id: "other", blocked: true, ageMin: 21 }, blocked: [{ id: "b", ageMin: 25 }] }).notify, false, "15 already fired")
  const sixty = top.consider({ now: 65 * 60_000, top: { id: "other", blocked: true, ageMin: 66 }, blocked: [{ id: "b", ageMin: 70 }] })
  assert.deepEqual([sixty.notify, sixty.reason, sixty.passed], [true, "escalate", [60]])
})

test("an unblocked item never escalates, and an empty list resets what it knew", () => {
  const top = notifier()
  top.consider({ now: 0, top: { id: "a", blocked: false, ageMin: 1 } })
  assert.equal(top.consider({ now: 61 * 60_000, top: { id: "a", blocked: false, ageMin: 90 }, blocked: [] }).notify, false)
  assert.equal(top.consider({ now: 62 * 60_000 }).notify, false)
  const again = top.consider({ now: 63 * 60_000, top: { id: "a", blocked: true, ageMin: 20 }, blocked: [{ id: "a", ageMin: 20 }] })
  assert.deepEqual([again.notify, again.reason, again.passed], [true, "top", [15]], "a reset list notifies and may escalate the same ask")
})
