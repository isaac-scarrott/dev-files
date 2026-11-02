import assert from "node:assert/strict"
import { test } from "node:test"
import { messageSignature } from "./chip-signature.js"
import { nextChange, span } from "./chip-time.js"

const MIN = 60_000

test("span rounds up to the minute and reads in the largest two units", () => {
  assert.equal(span(0), "0m")
  assert.equal(span(1), "1m")
  assert.equal(span(MIN), "1m")
  assert.equal(span(MIN + 1), "2m")
  assert.equal(span(12 * MIN), "12m")
  assert.equal(span(65 * MIN), "1h 5m")
  assert.equal(span(120 * MIN), "2h")
  assert.equal(span((2 * 24 * 60 + 3 * 60 + 10) * MIN), "2d 3h")
  assert.equal(span(2 * 24 * 60 * MIN), "2d")
})

test("nextChange waits for the soonest span to tick over, never polls", () => {
  assert.equal(nextChange([], 0), undefined)
  assert.equal(nextChange([100], 200), undefined)
  // 12m30s left reads 13m; it reads 12m once 30s have passed.
  assert.equal(nextChange([12 * MIN + 30_000], 0), 30_020)
  // Exactly on a minute the next change is a full minute away.
  assert.equal(nextChange([5 * MIN], 0), MIN + 20)
  assert.equal(nextChange([12 * MIN + 30_000, 3 * MIN + 5_000], 0), 5_020)
})

test("messageSignature reads only the tail and moves when a message arrives or completes", () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ id: `m${i}`, content: [] }))
  const before = messageSignature(many)
  assert.equal(messageSignature(many), before)
  assert.notEqual(messageSignature([...many, { id: "wake", content: [] }]), before)
  const running = { id: "a", content: [{}] }
  assert.notEqual(messageSignature([running]), messageSignature([{ ...running, time: { completed: 5 } }]))
  assert.notEqual(messageSignature([running]), messageSignature([{ ...running, content: [{}, {}] }]))
  assert.equal(messageSignature([]), "0|")
})
