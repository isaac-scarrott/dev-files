import assert from "node:assert/strict"
import { test } from "node:test"
import { activeMonitors, publishActive } from "./active.js"

const KEY = Symbol.for("opencode.monitor.active")
const slot = () => globalThis as unknown as Record<symbol, unknown>

test("without the plugin the query is absent", () => {
  delete slot()[KEY]
  assert.equal(activeMonitors(), undefined)
})

test("the global is a function, and every instance's monitors are in its answer", () => {
  delete slot()[KEY]
  assert.equal(activeMonitors(), undefined)
  const unpublishA = publishActive(() => [{ sessionID: "ses_a", pgid: 100 }])
  assert.equal(typeof slot()[KEY], "function")
  const unpublishB = publishActive(() => [{ sessionID: "ses_b", pgid: 200 }])
  assert.deepEqual(activeMonitors(), [
    { sessionID: "ses_a", pgid: 100 },
    { sessionID: "ses_b", pgid: 200 },
  ])

  const unpublishC = publishActive(() => [{ sessionID: "ses_c", pgid: 300 }])
  assert.equal(activeMonitors()?.length, 3)
  unpublishC()
  unpublishA()
  assert.deepEqual(activeMonitors(), [{ sessionID: "ses_b", pgid: 200 }])

  // A source may end between two calls: an empty answer is a real answer, not "no plugin".
  unpublishB()
  assert.deepEqual(activeMonitors(), [])
  delete slot()[KEY]
  assert.equal(activeMonitors(), undefined)
})
