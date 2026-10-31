import assert from "node:assert/strict"
import { test } from "node:test"
import { checkWake, firstDayOfWeek, formatHint, formatTimeOfDay, formatWake, monthGrid, parseDuration, parseTimeOfDay, presets, resolveLocal, weekdayLabels, zoneLabel, HOUR, MAX_HORIZON, MINUTE } from "./time"

function zone<T>(tz: string, run: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = tz
  try { return run() } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
}
const at = (y: number, mo: number, d: number, h: number, mi = 0) => ({ y, mo: mo - 1, d, h, mi })
const clock = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` }

const ZONES = ["Europe/London", "America/New_York", "Asia/Kolkata", "Asia/Kathmandu", "Australia/Lord_Howe", "Pacific/Auckland", "UTC"]

test("elapsed presets are exact durations; calendar presets are wall-clock 09:00 / 18:00 in every zone", () => {
  for (const tz of ZONES) zone(tz, () => {
    for (const text of ["2026-03-07T23:30:00", "2026-03-28T23:30:00", "2026-10-03T12:00:00", "2026-10-24T23:30:00", "2026-10-31T23:30:00", "2026-04-04T12:00:00"]) {
      const now = new Date(text)
      const list = presets(now)
      assert.equal(list[0].until - +now, HOUR)
      assert.equal(list[1].until - +now, 3 * HOUR)
      const tomorrow = new Date(list.find((p) => p.id === "tomorrow")!.until)
      assert.equal(tomorrow.getHours(), 9, `${tz} ${text}`)
      const next = new Date(now); next.setDate(next.getDate() + 1)
      assert.equal(tomorrow.getDate(), next.getDate())
      const week = new Date(list.find((p) => p.id === "week")!.until)
      assert.equal(week.getDay(), 1); assert.equal(week.getHours(), 9)
      assert.ok(+week > +now && +week - +now <= 7 * 86_400_000 + 3 * HOUR)
    }
  })
})

test("This evening only while 18:00 is ahead; next week is a week out on a Monday", () => zone("Europe/London", () => {
  assert.ok(presets(new Date("2026-11-02T17:59")).some((p) => p.id === "evening"))
  assert.equal(presets(new Date("2026-11-02T18:00")).some((p) => p.id === "evening"), false)
  assert.equal(presets(new Date("2026-11-02T23:59")).some((p) => p.id === "evening"), false)
  assert.equal(clock(presets(new Date("2026-11-02T08:00")).find((p) => p.id === "week")!.until), "2026-11-09 09:00")
  assert.equal(clock(presets(new Date("2026-11-01T08:00")).find((p) => p.id === "week")!.until), "2026-11-02 09:00", "Sunday → next day")
  assert.equal(clock(presets(new Date("2026-11-07T08:00")).find((p) => p.id === "week")!.until), "2026-11-09 09:00", "Saturday")
  assert.equal(clock(presets(new Date("2026-12-31T20:00")).find((p) => p.id === "tomorrow")!.until), "2027-01-01 09:00", "year rollover")
}))

test("spring-forward gap: a nonexistent wall time moves ahead by the jump; neighbours are exact", () => {
  zone("America/New_York", () => {
    const r = resolveLocal(at(2026, 3, 8, 2, 30))
    assert.equal(r.resolution, "gap"); assert.equal(clock(r.at), "2026-03-08 03:30")
    assert.equal(resolveLocal(at(2026, 3, 8, 1, 59)).resolution, "exact")
    assert.equal(resolveLocal(at(2026, 3, 8, 3, 0)).resolution, "exact")
    // Tomorrow 09:00 across the change is 23 elapsed hours, not 24.
    const now = new Date("2026-03-07T10:00:00"); const t = presets(now).find((p) => p.id === "tomorrow")!
    assert.equal(clock(t.until), "2026-03-08 09:00")
  })
  zone("Europe/London", () => {
    const r = resolveLocal(at(2026, 3, 29, 1, 30))
    assert.equal(r.resolution, "gap"); assert.equal(clock(r.at), "2026-03-29 02:30")
  })
  zone("Australia/Lord_Howe", () => {
    const r = resolveLocal(at(2026, 10, 4, 2, 15))
    assert.equal(r.resolution, "gap", "30-minute jump"); assert.equal(clock(r.at), "2026-10-04 02:45")
  })
})

test("fall-back overlap: a repeated wall time picks the first occurrence", () => {
  zone("America/New_York", () => {
    const r = resolveLocal(at(2026, 11, 1, 1, 30))
    assert.equal(r.resolution, "overlap")
    assert.equal(r.at, Date.parse("2026-11-01T05:30:00Z"), "EDT, before the clocks go back")
    assert.equal(resolveLocal(at(2026, 11, 1, 0, 59)).resolution, "exact")
    assert.equal(resolveLocal(at(2026, 11, 1, 2, 0)).resolution, "exact")
  })
  zone("Europe/London", () => {
    const r = resolveLocal(at(2026, 10, 25, 1, 15))
    assert.equal(r.resolution, "overlap"); assert.equal(r.at, Date.parse("2026-10-25T00:15:00Z"))
  })
  zone("Australia/Lord_Howe", () => {
    const r = resolveLocal(at(2026, 4, 5, 1, 45))
    assert.equal(r.resolution, "overlap", "30-minute overlap"); assert.equal(r.at, Date.parse("2026-04-04T14:45:00Z"))
  })
})

test("zones without DST and with odd offsets are exact", () => {
  zone("Asia/Kathmandu", () => { const r = resolveLocal(at(2026, 6, 1, 9, 5)); assert.equal(r.resolution, "exact"); assert.equal(r.at, Date.parse("2026-06-01T03:20:00Z")) })
  zone("Asia/Kolkata", () => assert.equal(resolveLocal(at(2026, 6, 1, 9, 0)).at, Date.parse("2026-06-01T03:30:00Z")))
})

test("overflowing fields roll over", () => zone("UTC", () => assert.equal(clock(resolveLocal(at(2026, 1, 32, 25, 61)).at), "2026-02-02 02:01")))

test("zoneLabel shows the offset in force at the instant", () => {
  zone("Europe/London", () => { assert.equal(zoneLabel(Date.parse("2026-07-01T12:00Z"), "en-GB"), "GMT+1 · Europe/London"); assert.equal(zoneLabel(Date.parse("2026-01-01T12:00Z"), "en-GB"), "GMT · Europe/London") })
  zone("Asia/Kolkata", () => assert.match(zoneLabel(Date.now(), "en-GB"), /^GMT\+5:30 · Asia\/(Kolkata|Calcutta)$/))
})

test("hints: time today and tomorrow, weekday for later days; 12/24 hour honoured", () => zone("Europe/London", () => {
  const now = Date.parse("2026-11-02T10:00:00Z")
  const list = presets(new Date(now))
  const hint = (id: string, o = {}) => formatHint(list.find((p) => p.id === id)!, now, { locale: "en-GB", ...o })
  assert.equal(hint("1h"), "11:00"); assert.equal(hint("evening"), "18:00"); assert.equal(hint("tomorrow"), "9:00"); assert.equal(hint("week"), "Mon 9:00")
  assert.equal(hint("evening", { locale: "en-US", hour12: true }), "6:00 PM")
  assert.match(formatWake(Date.parse("2026-11-04T14:05:00Z"), now, { locale: "en-GB" }), /Wed.*4 Nov.*14:05/)
  assert.match(formatWake(Date.parse("2027-01-04T14:05:00Z"), now, { locale: "en-GB" }), /2027/)
}))

test("durations parse natural input", () => {
  const ok = (text: string, ms: number) => assert.deepEqual(parseDuration(text), { ms }, text)
  ok("30m", 30 * MINUTE); ok("90m", 90 * MINUTE); ok("1h30", 90 * MINUTE); ok("1h 30m", 90 * MINUTE); ok("1.5h", 90 * MINUTE)
  ok("2 days", 2 * 86_400_000); ok("2d", 2 * 86_400_000); ok("1w", 7 * 86_400_000); ok("45", 45 * MINUTE); ok("in 2 hours", 2 * HOUR); ok("1d2", 86_400_000 + 2 * HOUR)
  ok("1,5h", 90 * MINUTE); ok("2 hours and 15 minutes", 135 * MINUTE); ok("  3H ", 3 * HOUR)
})

test("invalid durations explain themselves", () => {
  for (const text of ["", "abc", "0m", "0", "-5m", "1h1h", "1.5h30m", "5x", "1m30", "h", "12:30"]) assert.ok("error" in parseDuration(text), text)
  assert.match((parseDuration("5x") as { error: string }).error, /Unknown unit/)
})

test("wake validation: past, now and beyond a year are rejected", () => {
  const now = 1_000_000_000_000
  assert.deepEqual(checkWake(now + MINUTE, now), { ok: true })
  assert.deepEqual(checkWake(now + MAX_HORIZON, now), { ok: true })
  for (const until of [now, now - 1, NaN]) assert.equal(checkWake(until, now).ok, false)
  assert.match((checkWake(now + MAX_HORIZON + 1, now) as { reason: string }).reason, /within the next year/)
})

test("month grids start on the locale's first day and flag other months", () => {
  const sun = monthGrid(2026, 10, 0); const mon = monthGrid(2026, 10, 1)
  assert.deepEqual(sun[0][0], { y: 2026, mo: 10, d: 1, inMonth: true }, "1 Nov 2026 is a Sunday")
  assert.deepEqual(mon[0][0], { y: 2026, mo: 9, d: 26, inMonth: false })
  assert.ok(sun.every((w) => w.length === 7)); assert.equal(sun.length, 5); assert.equal(mon.length, 6)
  assert.equal(monthGrid(2026, 1, 0).length, 4, "Feb 2026 fits four weeks")
  assert.deepEqual(weekdayLabels(1, "en-GB").slice(0, 2), ["Mon", "Tue"])
  assert.equal(firstDayOfWeek("en-GB"), 1); assert.equal(firstDayOfWeek("en-US"), 0)
})

test("time of day parses typed forms and formats for 12/24 hour", () => {
  const p = (t: string) => parseTimeOfDay(t)
  assert.deepEqual(p("9"), { h: 9, mi: 0 }); assert.deepEqual(p("930"), { h: 9, mi: 30 }); assert.deepEqual(p("9:30"), { h: 9, mi: 30 }); assert.deepEqual(p("14:05"), { h: 14, mi: 5 })
  assert.deepEqual(p("2:05pm"), { h: 14, mi: 5 }); assert.deepEqual(p("12am"), { h: 0, mi: 0 }); assert.deepEqual(p("12:30 PM"), { h: 12, mi: 30 }); assert.deepEqual(p("9 a.m."), { h: 9, mi: 0 })
  for (const t of ["", "25:00", "9:60", "13pm", "0am", "ab"]) assert.equal(p(t), undefined, t)
  assert.equal(formatTimeOfDay(14, 5, false), "14:05"); assert.equal(formatTimeOfDay(0, 5, true), "12:05 AM"); assert.equal(formatTimeOfDay(12, 0, true), "12:00 PM")
})
