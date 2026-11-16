import assert from "node:assert/strict"
import { test } from "node:test"
import { afterStep, coldGap, coldWarningDue, contextOf, emptyWatch, highestReached, stillFired, type Tokens } from "./measure.js"

const TIERS = [200_000, 400_000, 700_000]
const tokens = (total: number, write = 0): Tokens => ({ input: total - write, cache: { read: 0, write } })

test("context is input plus both cache subsets", () => {
  assert.equal(contextOf({ input: 2, cache: { read: 176_040, write: 136 } }), 176_178)
})

test("a tier fires once as the context crosses it, and a jump past several fires the highest", () => {
  const first = afterStep(emptyWatch(), tokens(210_000), TIERS)
  assert.equal(first.fired, 200_000)
  assert.equal(first.watch.tier, 200_000)
  const again = afterStep(first.watch, tokens(250_000), TIERS)
  assert.equal(again.fired, 0)
  assert.equal(again.watch.tier, 200_000)
  const jump = afterStep(again.watch, tokens(750_000), TIERS)
  assert.equal(jump.fired, 700_000)
  assert.equal(jump.watch.tier, 700_000)
})

test("a tier re-arms only after the context falls below half of it, then fires again", () => {
  const high = afterStep(emptyWatch(), tokens(750_000), TIERS).watch
  // 300k is below half of 700k (350k) but above half of 400k (200k): only the top tier re-arms.
  const mid = afterStep(high, tokens(300_000), TIERS)
  assert.equal(mid.watch.tier, 400_000)
  assert.equal(mid.fired, 0)
  const back = afterStep(mid.watch, tokens(720_000), TIERS)
  assert.equal(back.fired, 700_000)
  // 90k is below half of every tier.
  const low = afterStep(back.watch, tokens(90_000), TIERS)
  assert.equal(low.watch.tier, 0)
  const climb = afterStep(low.watch, tokens(210_000), TIERS)
  assert.equal(climb.fired, 200_000)
})

test("a tier exactly at its threshold fires; below it does not", () => {
  assert.equal(highestReached(TIERS, 199_999), 0)
  assert.equal(highestReached(TIERS, 200_000), 200_000)
  assert.equal(stillFired(200_000, TIERS, 99_999), 0)
  assert.equal(stillFired(200_000, TIERS, 100_000), 200_000)
})

test("a cold wake needs a gap over an hour from the previous step", () => {
  assert.equal(coldGap(undefined, 10), false)
  assert.equal(coldGap(0, 60 * 60_000), false)
  assert.equal(coldGap(0, 60 * 60_000 + 1), true)
})

test("the cold warning is due once per 24 hours and only above the write threshold", () => {
  assert.equal(coldWarningDue({ ...emptyWatch(), coldWrite: 160_000 }, 150_000, 0), true)
  assert.equal(coldWarningDue({ ...emptyWatch(), coldWrite: 100_000 }, 150_000, 0), false)
  const warned = { ...emptyWatch(), coldWrite: 160_000, coldWarnedAt: 1_000 }
  assert.equal(coldWarningDue(warned, 150_000, 1_000 + 22 * 3_600_000), false)
  assert.equal(coldWarningDue(warned, 150_000, 1_000 + 24 * 3_600_000), true)
})
