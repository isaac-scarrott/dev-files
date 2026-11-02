import assert from "node:assert/strict"
import { test } from "node:test"
import { monitorControl } from "./control.js"
import type { Monitors } from "./manager.js"

const fake = () => {
  const stopped: string[] = []
  const monitors = {
    list: () => [
      { id: "mon_a", name: "watch a", session: "ses_1", state: "running", events: 3, maxEvents: 50, expiresAt: "2026-11-02T10:00:00.000Z", paused: false },
      { id: "mon_b", name: "watch b", session: "ses_2", state: "running", events: 0, expiresAt: "2026-11-02T11:00:00.000Z" },
      { id: "mon_c", name: "watch c", session: "ses_1", state: "waiting", events: 1, expiresAt: "2026-11-02T12:00:00.000Z", nextRearm: "2026-11-02T09:30:00.000Z" },
      { id: "mon_d", name: "watch d", session: "ses_1", state: "running", events: 9, expiresAt: "2026-11-02T12:00:00.000Z", paused: true },
    ],
    stop: async (id: string) => (stopped.push(id), { id }),
  } as unknown as Pick<Monitors, "list" | "stop">
  return { monitors, stopped }
}

test("running answers for the asked ids that still run", async () => {
  assert.deepEqual(await monitorControl(fake().monitors).running({ ids: ["mon_a", "mon_gone"] }), { ids: ["mon_a"] })
})

test("stop needs the monitor's own session", async () => {
  const { monitors, stopped } = fake()
  const control = monitorControl(monitors)
  assert.deepEqual(await control.stop({ id: "mon_a", sessionID: "ses_2" }), { stopped: false })
  assert.deepEqual(await control.stop({ id: "mon_gone", sessionID: "ses_1" }), { stopped: false })
  assert.deepEqual(stopped, [])
  assert.deepEqual(await control.stop({ id: "mon_a", sessionID: "ses_1" }), { stopped: true })
  assert.deepEqual(stopped, ["mon_a"])
})

test("list answers only the monitors aimed at the session, as names and numbers", async () => {
  assert.deepEqual(await monitorControl(fake().monitors).list({ sessionID: "ses_1" }), {
    items: [
      { id: "mon_a", name: "watch a", state: "running", events: 3, maxEvents: 50, expiresAt: Date.parse("2026-11-02T10:00:00.000Z") },
      { id: "mon_c", name: "watch c", state: "waiting", events: 1, expiresAt: Date.parse("2026-11-02T12:00:00.000Z"), nextRearmAt: Date.parse("2026-11-02T09:30:00.000Z") },
      { id: "mon_d", name: "watch d", state: "paused", events: 9, expiresAt: Date.parse("2026-11-02T12:00:00.000Z") },
    ],
  })
  assert.deepEqual(await monitorControl(fake().monitors).list({ sessionID: "ses_none" }), { items: [] })
})
