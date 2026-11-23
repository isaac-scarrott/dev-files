import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULTS, parseOptions } from "../src/options.js"

test("an old config that still passes idleMinutes is ignored without error", () => {
  const options = parseOptions({ idleMinutes: 30 })
  assert.equal("idleMinutes" in options, false)
  assert.equal(options.subagentIdleMinutes, DEFAULTS.subagentIdleMinutes)
  // Unknown keys are ignored, not validated: even a value the old option would have rejected does not throw.
  assert.equal(parseOptions({ idleMinutes: "not a number" }).subagentIdleMinutes, DEFAULTS.subagentIdleMinutes)
})
