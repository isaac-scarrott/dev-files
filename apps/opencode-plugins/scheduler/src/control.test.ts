import assert from "node:assert/strict"
import { test } from "node:test"
import { scheduleControl } from "./control.js"
import type { Hub } from "./hub.js"

const hub = () => {
  const jobs = [
    { id: "sch_a", sessionID: "ses_1", status: "active", name: "Daily", kind: "every", spec: "every 1h", nextRun: 1000, runs: 2, maxRuns: 5, prompt: "secret prompt" },
    { id: "sch_b", sessionID: "ses_2", status: "active", name: "Other", kind: "once", spec: "at 10:00", nextRun: 2000, runs: 0 },
    { id: "sch_c", sessionID: "ses_1", status: "paused", name: "Held", kind: "cron", spec: "0 9 * * *", nextRun: 3000, runs: 0 },
  ]
  const cancelled: string[] = []
  const fake = {
    list: () => ({ jobs, ended: [] }),
    cancel: async (id: string) => {
      cancelled.push(id)
      const job = jobs.find((item) => item.id === id)
      return { cancelled: job }
    },
  } as unknown as Pick<Hub, "list" | "cancel">
  return { fake, cancelled }
}

test("active answers only for scheduled, active tasks among the asked ids", async () => {
  const { fake } = hub()
  assert.deepEqual(await scheduleControl(fake).active({ ids: ["sch_a", "sch_c", "sch_zzz"] }), { ids: ["sch_a"] })
})

test("cancel needs the task's own session", async () => {
  const { fake, cancelled } = hub()
  const control = scheduleControl(fake)
  assert.deepEqual(await control.cancel({ id: "sch_a", sessionID: "ses_2" }), { cancelled: false })
  assert.deepEqual(await control.cancel({ id: "sch_nope", sessionID: "ses_1" }), { cancelled: false })
  assert.deepEqual(cancelled, [])
  assert.deepEqual(await control.cancel({ id: "sch_a", sessionID: "ses_1" }), { cancelled: true })
  assert.deepEqual(cancelled, ["sch_a"])
})

test("pending answers the tasks aimed at the session, never their prompts", async () => {
  assert.deepEqual(await scheduleControl(hub().fake).pending({ sessionID: "ses_1" }), {
    items: [
      { id: "sch_a", name: "Daily", kind: "every", spec: "every 1h", paused: false, nextRun: 1000, runs: 2, maxRuns: 5 },
      { id: "sch_c", name: "Held", kind: "cron", spec: "0 9 * * *", paused: true, nextRun: 3000, runs: 0 },
    ],
  })
})
