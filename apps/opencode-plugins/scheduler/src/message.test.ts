import assert from "node:assert/strict"
import { test } from "node:test"
import { scheduledOf } from "./message.js"
import { wakeMetadata } from "./wake.js"

const wake = { id: "sch_1a2b3c4d", name: "Daily PR review", prompt: "Check <open> PRs & list them", scheduled: 1_700_000_000_000, lateMs: 0, recurring: true }

test("scheduledOf reads what the scheduler writes, with the real task text", () => {
  assert.deepEqual(scheduledOf({ type: "user", metadata: wakeMetadata(wake, "every", 1_700_000_000_500) }), { id: "sch_1a2b3c4d", name: "Daily PR review", kind: "every", text: "Check <open> PRs & list them" })
})

test("a typed look-alike or a malformed stamp is not a scheduled run", () => {
  assert.equal(scheduledOf({ type: "user" }), undefined)
  assert.equal(scheduledOf({ type: "user", metadata: {} }), undefined)
  assert.equal(scheduledOf({ type: "assistant", metadata: wakeMetadata(wake, "every", 1) }), undefined)
  assert.equal(scheduledOf({ type: "user", metadata: wakeMetadata(wake, "weekly", 1) }), undefined)
  assert.equal(scheduledOf({ type: "user", metadata: { scheduledTask: "x" } }), undefined)
  assert.equal(scheduledOf({ type: "user", metadata: { scheduledTask: { id: 1, name: "n", kind: "once", text: "t" } } }), undefined)
})
