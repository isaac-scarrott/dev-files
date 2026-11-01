import assert from "node:assert/strict"
import test from "node:test"
import { readConfig } from "./options"

test("defaults: a 5 minute cache and a 20k floor", () => {
  assert.deepEqual(readConfig(undefined), { ttlMs: 300_000, minTokens: 20_000 })
  assert.deepEqual(readConfig({}), { ttlMs: 300_000, minTokens: 20_000 })
})

test("options override, in minutes and tokens", () => {
  assert.deepEqual(readConfig({ cacheTtlMinutes: 60, minTokens: 5000 }), { ttlMs: 3_600_000, minTokens: 5000 })
  assert.deepEqual(readConfig({ cacheTtlMinutes: 0.5 }), { ttlMs: 30_000, minTokens: 20_000 })
})

test("anything that is not a positive number falls back", () => {
  const bad = { cacheTtlMinutes: "60", minTokens: -1 }
  assert.deepEqual(readConfig(bad), { ttlMs: 300_000, minTokens: 20_000 })
  assert.deepEqual(readConfig({ cacheTtlMinutes: Number.NaN, minTokens: 0 }), { ttlMs: 300_000, minTokens: 20_000 })
})
