import assert from "node:assert/strict"
import { after, test } from "node:test"
import { nextCron, parseCron } from "./cron.js"

const original = process.env.TZ
after(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

const at = (iso: string) => new Date(iso).getTime()
const next = (expr: string, from: string) => {
  const n = nextCron(parseCron(expr), at(from))
  return n === undefined ? undefined : new Date(n)
}
const local = (d: Date | undefined) => d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

test("parses lists, ranges, steps, names and aliases", () => {
  const c = parseCron("0,30 9-17/4 * jan,mar mon-fri")
  assert.deepEqual([...c.minutes], [0, 30])
  assert.deepEqual([...c.hours], [9, 13, 17])
  assert.deepEqual([...c.months], [1, 3])
  assert.deepEqual([...c.weekdays], [1, 2, 3, 4, 5])
  assert.equal(parseCron("*/20 * * * *").minutes.size, 3)
  assert.deepEqual([...parseCron("0 0 * * 7").weekdays], [0])
  assert.equal(parseCron("@daily").hours.size, 1)
})

test("rejects malformed expressions with a reason", () => {
  assert.throws(() => parseCron("* * * *"), /5 fields/)
  assert.throws(() => parseCron("60 * * * *"), /outside 0-59/)
  assert.throws(() => parseCron("*/0 * * * *"), /step/)
  assert.throws(() => parseCron("5-1 * * * *"), /backwards/)
  assert.throws(() => parseCron("x * * * *"), /not a number/)
})

test("next run is strictly after the given time, on the minute", () => {
  process.env.TZ = "UTC"
  assert.equal(next("*/15 * * * *", "2026-03-10T10:15:00Z")?.toISOString(), "2026-03-10T10:30:00.000Z")
  assert.equal(next("*/15 * * * *", "2026-03-10T10:14:59.999Z")?.toISOString(), "2026-03-10T10:15:00.000Z")
  assert.equal(next("0 9 * * 1-5", "2026-03-13T09:00:00Z")?.toISOString(), "2026-03-16T09:00:00.000Z") // Friday to Monday
})

test("day-of-month and day-of-week are ORed when both are restricted", () => {
  process.env.TZ = "UTC"
  // 2026-03-02 is a Monday; the 15th is a Sunday.
  assert.equal(next("0 0 15 * 1", "2026-03-02T00:00:00Z")?.toISOString(), "2026-03-09T00:00:00.000Z")
  assert.equal(next("0 0 15 * 1", "2026-03-10T00:00:00Z")?.toISOString(), "2026-03-15T00:00:00.000Z")
})

test("month ends: day 31 skips short months, Feb 29 waits for a leap year, impossible dates give up", () => {
  process.env.TZ = "UTC"
  assert.equal(next("0 0 31 * *", "2026-04-01T00:00:00Z")?.toISOString(), "2026-05-31T00:00:00.000Z")
  assert.equal(next("0 0 31 * *", "2026-01-31T00:00:00Z")?.toISOString(), "2026-03-31T00:00:00.000Z")
  assert.equal(next("0 0 29 2 *", "2026-03-01T00:00:00Z")?.toISOString(), "2028-02-29T00:00:00.000Z")
  assert.equal(next("0 0 31 2 *", "2026-01-01T00:00:00Z"), undefined)
  assert.equal(next("59 23 31 12 *", "2026-12-31T23:59:00Z")?.toISOString(), "2027-12-31T23:59:00.000Z")
})

test("daily local time stays at the same wall clock across DST changes (Europe/London)", () => {
  process.env.TZ = "Europe/London"
  // Clocks went forward on 2026-03-29 and back on 2026-10-25.
  assert.equal(local(next("0 9 * * *", "2026-03-28T10:00:00Z")), "2026-03-29 09:00")
  assert.equal(next("0 9 * * *", "2026-03-28T10:00:00Z")?.toISOString(), "2026-03-29T08:00:00.000Z")
  assert.equal(next("0 9 * * *", "2026-10-24T10:00:00Z")?.toISOString(), "2026-10-25T09:00:00.000Z")
  // The gap between consecutive runs is 23h and 25h on those days.
  const spring = next("0 9 * * *", "2026-03-28T08:30:00Z")!.getTime()
  assert.equal((nextCron(parseCron("0 9 * * *"), spring)! - spring) / 3_600_000, 23)
})

test("spring-forward gap: a wall time that does not exist fires once, when the clock lands after the gap", () => {
  process.env.TZ = "Europe/London"
  const first = next("30 1 * * *", "2026-03-28T12:00:00Z")
  assert.equal(first?.toISOString(), "2026-03-29T01:30:00.000Z") // 01:30 does not exist; 02:30 BST
  assert.equal(local(first), "2026-03-29 02:30")
  const again = nextCron(parseCron("30 1 * * *"), first!.getTime())
  assert.equal(new Date(again!).toISOString(), "2026-03-30T00:30:00.000Z") // the next day's 01:30 BST
})

test("fall-back overlap: a repeated wall time fires once, at its first occurrence", () => {
  process.env.TZ = "Europe/London"
  const first = next("30 1 * * *", "2026-10-24T12:00:00Z")!
  assert.equal(first.toISOString(), "2026-10-25T00:30:00.000Z") // 01:30 BST
  const after = nextCron(parseCron("30 1 * * *"), first.getTime())!
  assert.equal(new Date(after).toISOString(), "2026-10-26T01:30:00.000Z") // not the second 01:30 (GMT)
})

test("wall-clock semantics: an hourly job skips the repeated hour rather than firing twice in it", () => {
  process.env.TZ = "Europe/London"
  let t = at("2026-10-25T00:00:00Z") // 01:00 BST
  const seen: string[] = []
  for (let i = 0; i < 3; i++) {
    t = nextCron(parseCron("0 * * * *"), t)!
    seen.push(new Date(t).toISOString())
  }
  assert.deepEqual(seen, ["2026-10-25T02:00:00.000Z", "2026-10-25T03:00:00.000Z", "2026-10-25T04:00:00.000Z"])
})
