import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { acquire } from "./hub.js"
import { DEFAULTS } from "./options.js"
import type { Host } from "./host.js"

test("release of the last instance clears the timer: no tick fires afterwards", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  try {
    const gets: string[] = []
    const host = {
      session: { get: async () => ({}), prompt: async () => ({}), synthetic: async () => {} },
      storage: { get: async (k: string) => void gets.push(k), set: async () => {}, remove: async () => {} },
    } as unknown as Host
    const options = { ...DEFAULTS, logDir: "/nonexistent-scheduler-test", tickSeconds: 1 }
    const { release } = await acquire(host, options, { now: () => Date.now() }, () => {})
    await new Promise((r) => setImmediate(r))
    release()
    const before = gets.length
    mock.timers.tick(10_000)
    await new Promise((r) => setImmediate(r))
    assert.equal(gets.length, before)
  } finally {
    mock.timers.reset()
  }
})
