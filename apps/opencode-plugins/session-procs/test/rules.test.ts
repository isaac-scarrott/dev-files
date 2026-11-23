import assert from "node:assert/strict"
import { test } from "node:test"
import type { Group, View } from "../src/ledger.js"
import { decide, evaluateRunaway, type SessionFacts } from "../src/rules.js"
import { proc } from "./helpers.js"

const START = 1_700_000_000
const START_MS = START * 1000
const NOW = START_MS + 3_600_000
const options = { subagentIdleMinutes: 10, runawayCpu: 90, orphanKillMinutes: 30 }

const group = (over: Partial<Group> = {}): Group => ({
  pgid: 4494,
  leaderPid: 4494,
  leaderStart: START,
  sessionID: "ses_a",
  shellID: "sh_1",
  background: true,
  startedAt: START_MS,
  escapees: [],
  ...over,
})

/** A live background job by default: its shell still runs. */
const view = (over: Partial<View> = {}): View => ({
  group: group(),
  members: [proc({ pid: 4494, pgid: 4494, start: START, command: "/bin/bash -c sleep 600" })],
  escapees: [],
  cpu: 0,
  leaderAlive: true,
  orphan: false,
  ...over,
})

const leftover = (over: Partial<View> = {}): View =>
  view({
    members: [proc({ pid: 4495, ppid: 1, pgid: 4494, start: START + 1, command: "node server.js" })],
    leaderAlive: false,
    orphan: true,
    ...over,
  })

const active = (over: Partial<SessionFacts> = {}): SessionFacts => ({ exists: true, archived: false, busy: false, idleAt: NOW - 3_600_000, ...over })

const run = (input: { views: View[]; sessions?: Map<string, SessionFacts | undefined>; monitors?: Set<string>; now?: number; runawaySince?: (pgid: number) => number | undefined }) =>
  decide({
    views: input.views,
    sessions: input.sessions ?? new Map([["ses_a", active()]]),
    monitors: "monitors" in input ? input.monitors : new Set(),
    now: input.now ?? NOW,
    options,
    runawaySince: input.runawaySince ?? (() => undefined),
  })

test("session archived or deleted: every group of the session, live background jobs included", () => {
  for (const facts of [active({ archived: true }), active({ exists: false })]) {
    const decisions = run({ views: [view()], sessions: new Map([["ses_a", facts]]) })
    assert.equal(decisions.length, 1)
    assert.equal(decisions[0]!.rule, "session-end")
    assert.deepEqual(decisions[0]!.pids, [4494])
  }
})

test("a session the host could not be asked is left alone", () => {
  assert.deepEqual(run({ views: [view()], sessions: new Map([["ses_a", undefined]]) }), [])
})

test("a busy session is never idle-reaped", () => {
  assert.deepEqual(run({ views: [leftover()], sessions: new Map([["ses_a", active({ busy: true, parentID: "ses_parent" })]]) }), [])
})

const DAYS = 3 * 24 * 60

test("a top-level session idle for days is never idle-reaped, whatever its leftovers", () => {
  const line = leftover()
  // Not busy, no monitor, shell exited, members alive: exactly the facts the removed idle row reaped.
  assert.deepEqual(run({ views: [line], sessions: new Map([["ses_a", active({ idleAt: NOW - DAYS * 60_000 })]]) }), [])
  assert.deepEqual(run({ views: [line, view()], sessions: new Map([["ses_a", active({ idleAt: NOW - DAYS * 60_000 })]]) }), [])
})

test("a sub-agent with the same facts is reaped by subagent-idle", () => {
  const line = leftover()
  assert.deepEqual(run({ views: [line], sessions: new Map([["ses_a", active({ idleAt: NOW - 9 * 60_000, parentID: "ses_parent" })]]) }), [])
  const decisions = run({ views: [line], sessions: new Map([["ses_a", active({ idleAt: NOW - DAYS * 60_000, parentID: "ses_parent" })]]) })
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0]!.rule, "subagent-idle")
  assert.deepEqual(decisions[0]!.pids, [4495])
})

test("no monitor plugin loaded means never idle-reap; a monitor for the session means the same", () => {
  const line = leftover()
  const idle = new Map([["ses_a", active({ idleAt: NOW - 60 * 60_000, parentID: "ses_parent" })]])
  assert.deepEqual(run({ views: [line], sessions: idle, monitors: undefined }), [])
  assert.deepEqual(run({ views: [line], sessions: idle, monitors: new Set(["ses_a"]) }), [])
  assert.equal(run({ views: [line], sessions: idle, monitors: new Set(["ses_b"]) }).length, 1)
})

test("an orphan over the CPU line for orphanKillMinutes is ended while its session is not busy", () => {
  const orphan = leftover({ cpu: 95 })
  // Not idle long enough for the idle row: this is the group burning CPU between turns.
  const justIdle = new Map([["ses_a", active({ idleAt: NOW - 5 * 60_000 })]])
  assert.equal(run({ views: [orphan], sessions: justIdle, runawaySince: () => NOW - 31 * 60_000 }).at(0)?.rule, "orphan")
  assert.deepEqual(run({ views: [orphan], sessions: justIdle, runawaySince: () => NOW - 29 * 60_000 }), [])
  assert.deepEqual(run({ views: [leftover({ cpu: 50 })], sessions: justIdle, runawaySince: () => NOW - 60 * 60_000 }), [])
  assert.deepEqual(run({ views: [orphan], sessions: new Map([["ses_a", active({ busy: true })]]), runawaySince: () => NOW - 60 * 60_000 }), [])
  // A top-level session idle for days is not idle-reaped, so the orphan row still ends its runaway group.
  assert.equal(run({ views: [orphan], sessions: new Map([["ses_a", active({ idleAt: NOW - DAYS * 60_000 })]]), runawaySince: () => NOW - 31 * 60_000 }).at(0)?.rule, "orphan")
})

test("a group whose shell is alive is never an orphan, whatever its CPU", () => {
  assert.deepEqual(run({ views: [view({ cpu: 200, orphan: false })], runawaySince: () => NOW - 60 * 60_000 }), [])
})

test("one decision per group: the sub-agent idle row speaks first", () => {
  const line = leftover({ cpu: 95 })
  const decisions = run({ views: [line], sessions: new Map([["ses_a", active({ idleAt: NOW - 60 * 60_000, parentID: "ses_parent" })]]), runawaySince: () => NOW - 60 * 60_000 })
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0]!.rule, "subagent-idle")
})

test("an escapee travels with its group's decision", () => {
  const stuck = leftover({ escapees: [proc({ pid: 5000, ppid: 4495, pgid: 5000, start: START + 2, command: "detached" })] })
  const decisions = run({ views: [stuck], sessions: new Map([["ses_a", active({ idleAt: NOW - 60 * 60_000, parentID: "ses_parent" })]]) })
  assert.deepEqual(decisions[0]!.pids, [4495, 5000])
})

test("runaway: one report per over-threshold stretch", () => {
  const first = evaluateRunaway({ notified: false }, 95, 90, 10, NOW)
  assert.deepEqual(first, { state: { since: NOW, notified: false }, report: false })
  const later = evaluateRunaway(first.state, 95, 90, 10, NOW + 10 * 60_000)
  assert.deepEqual(later, { state: { since: NOW, notified: true }, report: true })
  const again = evaluateRunaway(later.state, 120, 90, 10, NOW + 20 * 60_000)
  assert.equal(again.report, false)
  const dropped = evaluateRunaway(again.state, 10, 90, 10, NOW + 30 * 60_000)
  assert.deepEqual(dropped, { state: { notified: false }, report: false })
  assert.equal(evaluateRunaway(dropped.state, 95, 90, 10, NOW + 40 * 60_000).report, false)
})
