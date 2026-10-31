import assert from "node:assert/strict"
import { test } from "node:test"
import { sessionKey, wakeReason, type Snooze, type Observation } from "./snooze"

const snooze: Snooze = { server: "one", id: "same", title: "Work", at: 100, until: 200, busy: 50, updated: 90 }
const idle: Observation = { archived: false, attention: false, busy: 50, idle: 40, updated: 90 }
test("server and session form a collision-free key", () => assert.notEqual(sessionKey("one", "same"), sessionKey("two", "same")))
test("snooze survives ordinary metadata updates, wakes only at deadline", () => {
  assert.equal(wakeReason(snooze, { ...idle, updated: 150 }, 199), undefined)
  assert.equal(wakeReason(snooze, idle, 200), "scheduled")
})
test("attention, new work, completion and native archive wake early", () => {
  assert.equal(wakeReason(snooze, { ...idle, attention: true }, 101), "attention")
  assert.equal(wakeReason(snooze, { ...idle, busy: 101 }, 102), "new work")
  assert.equal(wakeReason(snooze, { ...idle, idle: 101 }, 102), "completed")
  assert.equal(wakeReason(snooze, { ...idle, archived: true }, 102), "archived")
})
