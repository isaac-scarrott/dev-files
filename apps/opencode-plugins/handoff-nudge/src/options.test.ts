import assert from "node:assert/strict"
import { test } from "node:test"
import { DEFAULTS, modelMatches, parseOptions } from "./options.js"

test("models are globs, so the default picks every opus id", () => {
  for (const id of ["opus", "claude-opus-5-5", "claude-opus-4-5"]) assert.equal(modelMatches(id, DEFAULTS.models), true, id)
  for (const id of ["sonnet", "claude-sonnet-5-5", "haiku", undefined]) assert.equal(modelMatches(id, DEFAULTS.models), false, String(id))
  assert.equal(modelMatches("gpt-6-astra", ["gpt-*", "opus"]), true)
  assert.equal(modelMatches("a.b", ["a.b"]), true)
  assert.equal(modelMatches("axb", ["a.b"]), false)
})

test("options default, validate and sort", () => {
  const defaults = parseOptions()
  assert.deepEqual(defaults.tiers, [200_000, 400_000, 700_000])
  assert.equal(defaults.coldWrite, 150_000)
  assert.deepEqual(defaults.models, ["*opus*"])

  const given = parseOptions({ models: ["opus", "claude-*"], tiers: [700_000, 100_000], coldWrite: 10_000 })
  assert.deepEqual(given.tiers, [100_000, 700_000])
  assert.equal(given.coldWrite, 10_000)
  assert.deepEqual(given.models, ["opus", "claude-*"])

  for (const bad of [{ models: [] }, { models: [""] }, { tiers: [] }, { tiers: [0] }, { tiers: [Number.NaN] }, { coldWrite: -1 }, { coldWrite: "x" }]) {
    assert.throws(() => parseOptions(bad), /handoff-nudge option/, JSON.stringify(bad))
  }
})
