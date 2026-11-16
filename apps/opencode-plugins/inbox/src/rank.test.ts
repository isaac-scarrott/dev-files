import assert from "node:assert/strict"
import { test } from "node:test"
import { cost, rank, type RankInput } from "./rank.js"

const item = (over: Partial<RankInput> = {}): RankInput => ({ key: "k", createdAt: 0, ageMin: 0, blocked: false, waiters: 0, asks: 1, ...over })

test("age counts in full for a blocked ask and a quarter otherwise, per waiting session", () => {
  assert.equal(cost(item({ ageMin: 20, blocked: true }), 30), 20)
  assert.equal(cost(item({ ageMin: 20, blocked: false }), 30), 5)
  assert.equal(cost(item({ ageMin: 20, blocked: true, waiters: 2 }), 30), 60)
  assert.equal(cost(item({ ageMin: 20, blocked: false, waiters: 2 }), 30), 15)
})

test("every ask after the first is worth reaskWeight minutes", () => {
  assert.equal(cost(item({ asks: 1 }), 30), 0)
  assert.equal(cost(item({ asks: 3 }), 30), 60)
  assert.equal(cost(item({ asks: 3, ageMin: 10, blocked: true }), 30), 70)
})

test("ranking is highest cost first, and ties go oldest then by key so the order is stable", () => {
  const ranked = rank(
    [
      item({ key: "cheap", ageMin: 1, blocked: false }),
      item({ key: "blocked", ageMin: 2, blocked: true }),
      item({ key: "old-tie", createdAt: 5, ageMin: 1, blocked: true }),
      item({ key: "new-tie", createdAt: 9, ageMin: 1, blocked: true }),
      item({ key: "asked", asks: 2 }),
    ],
    30,
  )
  assert.deepEqual(ranked.map((entry) => entry.key), ["asked", "blocked", "old-tie", "new-tie", "cheap"])
  assert.equal(ranked[0]!.cost, 30)
})

test("a waiting session multiplies, so one ask blocking three people outranks an older quiet one", () => {
  const ranked = rank([item({ key: "old", ageMin: 60 }), item({ key: "many", ageMin: 30, blocked: true, waiters: 3 })], 30)
  assert.deepEqual(ranked.map((entry) => entry.key), ["many", "old"])
})
