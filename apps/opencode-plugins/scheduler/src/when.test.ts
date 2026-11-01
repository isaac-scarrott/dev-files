import assert from "node:assert/strict"
import { test } from "node:test"
import { formatSpan, parseAt, parseDuration } from "./when.js"

test("durations", () => {
  assert.equal(parseDuration("30m"), 1_800_000)
  assert.equal(parseDuration("+2h"), 7_200_000)
  assert.equal(parseDuration("1h30m"), 5_400_000)
  assert.equal(parseDuration("1 day"), 86_400_000)
  assert.equal(parseDuration("90"), 5_400_000) // bare number is minutes
  assert.equal(parseDuration(15), 900_000)
  assert.equal(parseDuration("1.5h"), 5_400_000)
  assert.throws(() => parseDuration("soon"), /Cannot read/)
  assert.throws(() => parseDuration("5x"), /Unknown time unit/)
  assert.throws(() => parseDuration("0m"), /Cannot read/)
  assert.throws(() => parseDuration(-3), /positive/)
})

test("at: relative and ISO", () => {
  const now = Date.parse("2026-11-01T12:00:00Z")
  assert.equal(parseAt("+2h", now), now + 7_200_000)
  assert.equal(parseAt("in 10m", now), now + 600_000)
  assert.equal(parseAt("2026-11-02T09:00:00Z", now), Date.parse("2026-11-02T09:00:00Z"))
  assert.equal(parseAt("2026-11-02T09:00", now), new Date(2026, 10, 2, 9, 0).getTime()) // local
  assert.throws(() => parseAt("2026-11-02", now), /no time/)
  assert.throws(() => parseAt("tomorrow", now), /Cannot read/)
})

test("span formatting", () => {
  assert.equal(formatSpan(45_000), "45s")
  assert.equal(formatSpan(3 * 3_600_000 + 10 * 60_000), "3h 10m")
  assert.equal(formatSpan(90_000_000), "1d 1h")
})
