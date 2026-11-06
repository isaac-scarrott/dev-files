import assert from "node:assert/strict"
import test from "node:test"
import { createGuard, isTyped, limitFrom, refusal } from "./server.js"

const HOUR = 60 * 60_000
const clock = (start = 10 * HOUR) => {
  let t = start
  return { now: () => t, tick: (ms) => (t += ms) }
}

test("a fan-out to cold sessions is refused past the limit", () => {
  const c = clock()
  const guard = createGuard({ limit: 10, now: c.now })
  const results = Array.from({ length: 52 }, (_, i) => guard.check(`ses_${i}`, { peerMessage: {} }))
  assert.equal(results.filter((r) => r === undefined).length, 10)
  assert.deepEqual(results[10], { count: 10, limit: 10 })
})

test("typed messages are never refused", () => {
  const guard = createGuard({ limit: 2, now: clock().now })
  for (let i = 0; i < 2; i++) guard.check(`cold_${i}`, undefined)
  assert.equal(guard.check("mine", { displayText: "hi" }), undefined)
})

test("waking a warm session does not count", () => {
  const c = clock()
  const guard = createGuard({ limit: 1, now: c.now })
  guard.seen("sender")
  c.tick(5 * 60_000)
  assert.equal(guard.check("cold", undefined), undefined)
  assert.equal(guard.check("sender", { peerMessage: {} }), undefined, "replies to an active sender pass")
  assert.ok(guard.check("cold2", undefined), "a second cold wake is refused")
})

test("the window slides: after 60 s cold wakes are admitted again", () => {
  const c = clock()
  const guard = createGuard({ limit: 1, now: c.now })
  assert.equal(guard.check("a", undefined), undefined)
  assert.ok(guard.check("b", undefined))
  c.tick(61_000)
  assert.equal(guard.check("b", undefined), undefined)
})

test("a refused session stays cold, so a retry is refused too", () => {
  const c = clock()
  const guard = createGuard({ limit: 1, now: c.now })
  guard.check("a", undefined)
  assert.ok(guard.check("b", undefined))
  c.tick(1_000)
  assert.ok(guard.check("b", undefined))
})

test("a session idle over an hour counts as cold again", () => {
  const c = clock()
  const guard = createGuard({ limit: 1, now: c.now })
  guard.seen("old")
  c.tick(HOUR + 1)
  guard.check("x", undefined)
  assert.ok(guard.check("old", undefined))
})

test("limit is max(floor, multiplier × p99)", () => {
  const counts = [...Array(990).fill(1), ...Array(8).fill(5), 38, 40]
  assert.equal(limitFrom(counts), 10)
  assert.equal(limitFrom([1, 1, 2]), 8, "floor")
  assert.equal(limitFrom([]), 8)
})

test("isTyped only trusts displayText", () => {
  assert.equal(isTyped({ displayText: "x" }), true)
  assert.equal(isTyped(undefined), false)
  assert.equal(isTyped({ peerMessage: {} }), false)
})

test("refusal text names the count and limit", () => {
  assert.match(refusal({ count: 10, limit: 10 }), /10 idle sessions .*\(limit 10,/)
})
