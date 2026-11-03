import assert from "node:assert/strict"
import { test } from "node:test"
import { humanizeLine, humanTime, parseIso } from "./humanize-line.js"

const at = (iso: string) => Date.parse(iso)
const NOW = new Date(2026, 10, 3, 20, 28, 0).getTime() // local 20:28 on Nov 3

test("parseIso reads Z, offsets, milliseconds and no zone; rejects anything else", () => {
  assert.equal(parseIso("2026-11-03T20:24:29Z"), at("2026-11-03T20:24:29Z"))
  assert.equal(parseIso("2026-11-03T20:24:29.123Z"), at("2026-11-03T20:24:29.123Z"))
  assert.equal(parseIso("2026-11-03T20:24:29+0100"), at("2026-11-03T20:24:29+01:00"))
  assert.equal(parseIso("2026-11-03T20:24:29-05:30"), at("2026-11-03T20:24:29-05:30"))
  assert.equal(parseIso("2026-11-03T20:24"), new Date(2026, 10, 3, 20, 24).getTime())
  assert.equal(parseIso("2026-13-03T20:24:29Z"), undefined)
  assert.equal(parseIso("2026-11-03"), undefined)
  assert.equal(parseIso("v2026-11-03T20:24:29Z"), undefined)
})

test("humanTime: relative within the hour, then clock, yesterday, date, year", () => {
  assert.equal(humanTime(NOW - 20_000, NOW), "just now")
  assert.equal(humanTime(NOW - 3 * 60_000 - 5000, NOW), "3m ago")
  assert.equal(humanTime(NOW + 5 * 60_000 - 1000, NOW), "in 5m")
  assert.equal(humanTime(new Date(2026, 10, 3, 9, 5).getTime(), NOW), "09:05")
  assert.equal(humanTime(new Date(2026, 10, 2, 23, 59).getTime(), NOW), "yesterday 23:59")
  assert.equal(humanTime(new Date(2026, 9, 30, 8, 0).getTime(), NOW), "Oct 30, 08:00")
  assert.equal(humanTime(new Date(2025, 11, 31, 8, 0).getTime(), NOW), "Dec 31 2025, 08:00")
})

test("humanizeLine rewrites the screenshot line", () => {
  const ago = new Date(NOW - 3 * 60_000).toISOString()
  const line = `storefront watch  DEPLOY run 41712278303 #8216 in_progress - (created ${ago})`
  assert.equal(humanizeLine(line, NOW), "storefront watch  DEPLOY run 41712278303 #8216 in progress - (created 3m ago)")
  assert.equal(humanizeLine("#8216 timed_out, then queued", NOW), "#8216 timed out, then queued")
})

test("humanizeLine handles key=value and punctuation, keeps unknown words", () => {
  assert.equal(humanizeLine("status=in_progress at=" + new Date(NOW - 2 * 60_000).toISOString(), NOW), "status=in progress at=2m ago")
  assert.equal(humanizeLine("done: in_progress.", NOW), "done: in progress.")
  assert.equal(humanizeLine("my_var and some_other_thing", NOW), "my_var and some_other_thing")
})

test("humanizeLine leaves URLs, backticks and partial matches alone", () => {
  const iso = new Date(NOW - 120_000).toISOString()
  assert.equal(humanizeLine(`see https://x.dev/run?at=${iso} now`, NOW), `see https://x.dev/run?at=${iso} now`)
  assert.equal(humanizeLine(`ran \`date -d ${iso} in_progress\` ok ${iso}`, NOW), `ran \`date -d ${iso} in_progress\` ok 2m ago`)
  assert.equal(humanizeLine(`x${iso}y ${iso}z`, NOW), `x${iso}y ${iso}z`)
  assert.equal(humanizeLine(`${iso}`, NOW), "2m ago")
})

test("humanizeLine returns the same string for plain lines and caches per minute", () => {
  assert.equal(humanizeLine("Deploy #8216 succeeded in 4m", NOW), "Deploy #8216 succeeded in 4m")
  assert.equal(humanizeLine("", NOW), "")
  const iso = new Date(NOW - 60_000).toISOString()
  assert.equal(humanizeLine(iso, NOW), "1m ago")
  assert.equal(humanizeLine(iso, NOW + 60_000), "2m ago")
})
