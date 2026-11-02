import assert from "node:assert/strict"
import { test } from "node:test"
import { scheduleControl } from "./control.js"
import type { Hub } from "./hub.js"

const hub = () => {
  const jobs = [
    { id: "sch_a", sessionID: "ses_1", status: "active" },
    { id: "sch_b", sessionID: "ses_2", status: "active" },
    { id: "sch_c", sessionID: "ses_1", status: "paused" },
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
