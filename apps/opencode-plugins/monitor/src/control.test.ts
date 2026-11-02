import assert from "node:assert/strict"
import { test } from "node:test"
import { monitorControl } from "./control.js"
import type { Monitors } from "./manager.js"

const fake = () => {
  const stopped: string[] = []
  const monitors = {
    list: () => [{ id: "mon_a", session: "ses_1" }, { id: "mon_b", session: "ses_2" }],
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
