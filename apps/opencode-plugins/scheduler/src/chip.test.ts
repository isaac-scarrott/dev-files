import assert from "node:assert/strict"
import { test } from "node:test"
import { scheduleDeadlines, scheduleStatus, type ScheduleWords } from "./chip.js"
import type { ScheduleItem } from "./control.js"

const words: ScheduleWords = {
  once: "once",
  next: (span) => `next in ${span}`,
  runs: (count, max) => (max === undefined ? `${count} runs` : `${count} of ${max} runs`),
  paused: "paused",
}
const MIN = 60_000
const base: ScheduleItem = { id: "sch_a", name: "Daily", kind: "every", spec: "every 1h", paused: false, nextRun: 12 * MIN, runs: 2, maxRuns: 5 }

test("a repeating task reads its schedule, the next run and its runs", () => {
  assert.equal(scheduleStatus(base, 0, words), "every 1h · next in 12m · 2 of 5 runs")
  assert.equal(scheduleStatus({ ...base, runs: 0, maxRuns: undefined, kind: "cron", spec: "0 9 * * *" }, 0, words), "0 9 * * * · next in 12m")
})

test("a one-off says once and never counts runs; a paused task says paused", () => {
  assert.equal(scheduleStatus({ ...base, kind: "once", runs: 0, maxRuns: undefined }, 0, words), "once · next in 12m")
  assert.equal(scheduleStatus({ ...base, paused: true }, 0, words), "every 1h · paused · 2 of 5 runs")
})

test("only a task that will run counts down", () => {
  assert.deepEqual(scheduleDeadlines([base, { ...base, paused: true, nextRun: 1 }]), [12 * MIN])
})
