import assert from "node:assert/strict"
import { test } from "node:test"
import { springDuration, springEasing, springProgress, springRest } from "./spring"

test("springDuration follows the host: 0.3s * sqrt(distance / 480), clamped to 0.15..0.3", () => {
  assert.equal(springDuration(0), 0.3)
  assert.equal(springDuration(480), 0.3)
  assert.equal(springDuration(1200), 0.3)
  assert.equal(springDuration(1), 0.15)
  assert.ok(Math.abs(springDuration(328) - 0.3 * Math.sqrt(328 / 480)) < 1e-9)
})

test("springProgress is critically damped: starts at 0, no overshoot, ends at 1", () => {
  const d = 0.25
  assert.equal(springProgress(d, 0), 0)
  let last = 0
  for (let t = 0.005; t < 1; t += 0.005) {
    const p = springProgress(d, t)
    assert.ok(p >= last && p <= 1, `monotonic and never past the target at ${t}`)
    last = p
  }
  assert.ok(last > 0.9999)
})

test("springRest: the host's rest test passes there and not a little earlier", () => {
  const d = 0.25
  const rest = springRest(d)
  const omega = (2 * Math.PI) / d
  const restAt = (t: number) => (1 + omega * t) * Math.exp(-omega * t) * 100 < 0.005 && omega * omega * t * Math.exp(-omega * t) * 100 < 0.02
  assert.ok(restAt(rest))
  assert.ok(!restAt(rest - 0.01))
  assert.ok(rest > d && rest < d * 3)
})

test("springEasing is a monotonic linear() from 0 to 1 with ascending stops", () => {
  const css = springEasing(0.25)
  assert.match(css, /^linear\(0 0%, /)
  assert.match(css, /1 100%\)$/)
  const stops = [...css.matchAll(/([\d.]+) ([\d.]+)%/g)].map((m) => [Number(m[1]), Number(m[2])])
  for (let i = 1; i < stops.length; i++) {
    assert.ok(stops[i][0] >= stops[i - 1][0])
    assert.ok(stops[i][1] > stops[i - 1][1])
  }
})
