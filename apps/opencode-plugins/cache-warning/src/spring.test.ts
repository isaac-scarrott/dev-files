import assert from "node:assert/strict"
import test from "node:test"
import { SETTLE, easing, fadeIn, fadeOut, move, progress } from "./spring"

test("the spring starts at rest and ends at its target", () => {
  assert.equal(progress(0), 0)
  assert.ok(progress(SETTLE) > 0.99)
  assert.ok(progress(10) > 0.9999)
})

test("critical damping never overshoots", () => {
  for (let t = 0; t < 1; t += 0.005) assert.ok(progress(t) <= 1)
})

test("the host's 0.4 s smooth spring settles in about 0.42 s", () => {
  assert.ok(SETTLE > 0.4 && SETTLE < 0.45, String(SETTLE))
})

test("a linear() easing starts at 0 and ends at 1", () => {
  const curve = easing(move)
  assert.match(curve, /^linear\(0, /)
  assert.match(curve, /, 1\)$/)
  assert.equal(curve.split(",").length, 25)
})

test("opacity opens as the square and closes after the box is 60% retracted", () => {
  assert.equal(fadeIn(0.5), 0.25)
  assert.equal(fadeOut(0.5), 0)
  assert.equal(fadeOut(0.6), 0)
  assert.ok(Math.abs(fadeOut(0.8) - 0.5) < 1e-9)
  assert.equal(fadeOut(1), 1)
})
