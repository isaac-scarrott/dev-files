import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULTS, parseOptions } from "./options.js"

test("nothing configured takes the documented defaults", () => {
  assert.deepEqual(parseOptions(), DEFAULTS)
  assert.deepEqual(parseOptions({}), { notifyEveryMin: 10, escalateMin: [15, 60], rememberAnsweredH: 24, reaskWeight: 30 })
})

test("configured values are read, and escalation minutes are sorted", () => {
  assert.deepEqual(parseOptions({ notifyEveryMin: 5, escalateMin: [90, 20], rememberAnsweredH: 2, reaskWeight: 0 }), {
    notifyEveryMin: 5,
    escalateMin: [20, 90],
    rememberAnsweredH: 2,
    reaskWeight: 0,
  })
})

test("a wrong type or a value out of range is an error naming the option", () => {
  assert.throws(() => parseOptions({ notifyEveryMin: 0 }), /notifyEveryMin/)
  assert.throws(() => parseOptions({ escalateMin: [] }), /escalateMin/)
  assert.throws(() => parseOptions({ escalateMin: [0] }), /escalateMin/)
  assert.throws(() => parseOptions({ rememberAnsweredH: "24" }), /rememberAnsweredH/)
  assert.throws(() => parseOptions({ reaskWeight: -1 }), /reaskWeight/)
})
