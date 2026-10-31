import assert from "node:assert/strict"
import { test } from "node:test"
import { customTime, presets, sessionKey, wakeReason, type Snooze, type Observation } from "./snooze"

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
test("presets use calendar boundaries across both DST changes", () => {
  const previous = process.env.TZ
  process.env.TZ = "America/New_York"
  try {
    for (const text of ["2026-03-07T23:30:00", "2026-10-31T23:30:00"]) {
      const now = new Date(text)
      const list = presets(now)
      assert.equal(list[0].until - +now, 3_600_000)
      assert.equal(list[1].until - +now, 10_800_000)
      const tomorrow = new Date(list.find((p) => p.label.startsWith("Tomorrow"))!.until)
      assert.equal(tomorrow.getHours(), 9)
      const day = new Date(now); day.setDate(day.getDate() + 1)
      assert.equal(tomorrow.getDate(), day.getDate())
      const monday = new Date(list.find((p) => p.label.startsWith("Next Monday"))!.until)
      assert.equal(monday.getDay(), 1)
      assert.equal(monday.getHours(), 9)
    }
    assert.equal(customTime("2026-03-08T02:30", new Date("2026-03-07T12:00")), undefined)
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
test("evening only future; Monday means next week when today is Monday", () => {
  assert.equal(presets(new Date("2026-11-02T18:01")).some((p) => p.label.startsWith("This evening")), false)
  const monday = presets(new Date("2026-11-02T08:00")).find((p) => p.label.startsWith("Next Monday"))!
  assert.equal(new Date(monday.until).getDate(), 9)
})
test("custom durations and dates reject malformed, rollover, past and zero input", () => {
  const now = new Date("2026-01-01T12:00")
  assert.equal(customTime("30m", now), +now + 1_800_000)
  assert.equal(customTime("2h", now), +now + 7_200_000)
  for (const input of ["0m", "-2h", "abc", "2026-02-30T12:00", "2025-01-01T12:00", "2026-01-02T25:00"]) assert.equal(customTime(input, now), undefined)
})
