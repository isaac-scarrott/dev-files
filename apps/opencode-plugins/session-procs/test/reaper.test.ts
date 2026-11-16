import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { test } from "node:test"
import type { Group } from "../src/ledger.js"
import { readPs, type Proc, type Snapshot } from "../src/ps.js"
import { apply, reap, verified, type ReapDeps } from "../src/reaper.js"
import type { ReapDecision } from "../src/rules.js"
import { proc, snapshot } from "./helpers.js"

const START = 1_700_000_000
const group = (over: Partial<Group> = {}): Group => ({ pgid: 4494, leaderPid: 4494, leaderStart: START, sessionID: "ses_a", shellID: "sh_1", background: false, startedAt: START * 1000, escapees: [], ...over })

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitFor(check: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await check()) return true
    await sleep(50)
  }
  return false
}

const spawnDetached = (command: string) => spawn("/bin/bash", ["-c", command], { detached: true, stdio: "ignore" })

const never = (): ReadonlySet<number> | undefined => undefined

/** Real processes: a detached shell whose child outlives it, and an unrelated detached group. */
test("a leftover child is killed after its shell is gone; another detached group survives", async () => {
  const leader = spawnDetached("yes >/dev/null & wait")
  const unrelated = spawnDetached("exec yes >/dev/null")
  const leaderPid = leader.pid!
  const unrelatedPid = unrelated.pid!
  leader.unref()
  unrelated.unref()
  try {
    let table = await readPs()()
    const leaderProc = table.byPid.get(leaderPid)
    assert.ok(leaderProc, "the shell leads its own group")
    const found = await waitFor(async () => {
      table = await readPs()()
      return table.procs.some((entry) => entry.pgid === leaderPid && entry.pid !== leaderPid)
    }, 3000)
    assert.ok(found, "the yes child is in the shell's group")
    const leftover = table.procs.find((entry) => entry.pgid === leaderPid && entry.pid !== leaderPid)!
    assert.equal(leftover.command, "yes")
    assert.deepEqual(table.procs.filter((entry) => entry.pgid === leaderPid).map((entry) => entry.pid).sort(), [leaderPid, leftover.pid].sort())

    // Out of band: only the shell dies, the child stays and is reparented.
    process.kill(leaderPid, "SIGKILL")
    assert.ok(await waitFor(() => (readPs()().then((next) => next.byPid.get(leaderPid) === undefined)) as unknown as boolean, 3000))
    const afterLeader = await readPs()()
    assert.equal(afterLeader.byPid.get(leaderPid), undefined)
    assert.equal(afterLeader.byPid.get(leftover.pid)?.ppid, 1)
    assert.equal(afterLeader.byPid.get(unrelatedPid)?.command, "yes")

    const outcome = await reap(group({ pgid: leaderPid, leaderPid, leaderStart: leaderProc.start }), {
      ps: readPs(),
      kill: (pid, signal) => {
        try {
          process.kill(pid, signal)
        } catch {}
      },
      sleep,
      log: () => {},
      uid: process.getuid!(),
      servicePid: 1,
      selfPid: process.pid,
      graceMs: 200,
      monitorGroups: never,
    })
    assert.equal(outcome.state, "reaped")
    assert.deepEqual(outcome.signaled, [leftover.pid])
    assert.deepEqual(outcome.survivors, [])
    const final = await readPs()()
    assert.equal(final.byPid.get(leftover.pid), undefined)
    assert.equal(final.byPid.get(unrelatedPid)?.command, "yes", "an unrelated detached group is never touched")
  } finally {
    for (const pid of [leaderPid, unrelatedPid]) {
      try {
        process.kill(-pid, "SIGKILL")
      } catch {}
    }
  }
})

test("a killed group leaves nothing behind, and an already-gone group reports none", async () => {
  const child = spawnDetached("sleep 60")
  const pid = child.pid!
  child.unref()
  try {
    const table = await readPs()()
    const leader = table.byPid.get(pid)
    assert.ok(leader)
    const outcome = await reap(group({ pgid: pid, leaderPid: pid, leaderStart: leader.start }), {
      ps: readPs(),
      kill: (target, signal) => {
        try {
          process.kill(target, signal)
        } catch {}
      },
      sleep,
      log: () => {},
      uid: process.getuid!(),
      servicePid: 1,
      selfPid: process.pid,
      graceMs: 200,
      monitorGroups: never,
    })
    assert.equal(outcome.state, "reaped")
    const gone = await reap(group({ pgid: pid, leaderPid: pid, leaderStart: leader.start }), {
      ps: readPs(),
      kill: () => assert.fail("nothing to signal"),
      sleep,
      log: () => {},
      uid: process.getuid!(),
      servicePid: 1,
      selfPid: process.pid,
      graceMs: 200,
      monitorGroups: never,
    })
    assert.equal(gone.state, "gone")
  } finally {
    try {
      process.kill(-pid, "SIGKILL")
    } catch {}
  }
})

test("verified keeps only our uid, at or after the group start, and never 1, the service or itself", () => {
  const table = snapshot([
    proc({ pid: 4494, pgid: 4494, start: START }),
    proc({ pid: 4495, pgid: 4494, start: START + 1 }),
    proc({ pid: 4496, pgid: 4494, start: START + 1, uid: 502 }),
    proc({ pid: 4497, pgid: 4494, start: START - 600 }),
    proc({ pid: 4498, pgid: 4494, start: START + 1 }),
    proc({ pid: 1, pgid: 1, start: START }),
  ])
  assert.deepEqual(verified(group({ leaderPid: 4494 }), table, { uid: 501, servicePid: 4498, selfPid: 4499 }).map((entry) => entry.pid), [4494, 4495])
  assert.deepEqual(verified(group({ pgid: 4494, escapees: [4497, 5000] }), table, { uid: 501, servicePid: 4498, selfPid: 4499 }).map((entry) => entry.pid), [4494, 4495])
  const monitor = { ...group({ pgid: 4494 }) }
  assert.equal(verified(monitor, table, { uid: 501, servicePid: 4498, selfPid: 4499 }).length, 2)
})

const decision = (over: Partial<ReapDecision> = {}): ReapDecision => ({ group: group(), rule: "idle", pids: [4494], reason: "idle for 31m", ...over })

interface FakeReap {
  readonly signals: { pid: number; signal: string }[]
  deps: ReapDeps
  readonly notices: { sessionID: string; text: string }[]
  readonly reported: Set<string>
  readonly dropped: number[]
  table: Snapshot
}

function fakeReap(over: { alive?: Proc[]; ignoreTerm?: boolean } = {}): FakeReap {
  const state: FakeReap = {
    signals: [],
    notices: [],
    reported: new Set(),
    dropped: [],
    table: snapshot([proc({ pid: 4494, pgid: 4494, start: START }), ...(over.alive ?? [])]),
    deps: undefined as unknown as ReapDeps,
  }
  const first = state.table
  state.deps = {
    ps: async () => state.table,
    kill: (pid, signal) => {
      state.signals.push({ pid, signal })
      if (over.ignoreTerm && signal === "SIGTERM") return
      // A real kill changes the table: everything signalled is gone by the next snapshot.
      if (pid < 0) state.table = snapshot(state.table.procs.filter((entry) => entry.pgid !== -pid))
      else state.table = snapshot(state.table.procs.filter((entry) => entry.pid !== pid))
    },
    sleep: async () => {},
    log: () => {},
    uid: 501,
    servicePid: 900,
    selfPid: 901,
    graceMs: 5,
    monitorGroups: never,
  }
  state.table = first
  return state
}

const applier = (state: FakeReap, dryRun: boolean) => ({
  dryRun,
  now: () => START * 1000 + 60_000,
  log: () => {},
  reap: state.deps,
  ledger: {
    reported: (pgid: number, rule: string) => state.reported.has(`${pgid}:${rule}`),
    markReported: (pgid: number, rule: string) => void state.reported.add(`${pgid}:${rule}`),
    drop: async (pgid: number) => void state.dropped.push(pgid),
  },
  reporter: {
    queue: (sessionID: string, text: string) => void state.notices.push({ sessionID, text }),
    notice: () => ({ title: "t", body: "b", key: "k", session: "ses_a" }),
  },
})

test("dryRun signals nothing, says what it would end, and says it once", async () => {
  const state = fakeReap()
  const deps = applier(state, true)
  await apply(decision(), [...state.table.procs], true, deps)
  assert.deepEqual(state.signals, [])
  assert.equal(state.notices.length, 1)
  assert.match(state.notices[0]!.text, /Dry run: would end 1 leftover process/)
  assert.equal(state.dropped.length, 0)
  await apply(decision(), [...state.table.procs], true, deps)
  assert.equal(state.notices.length, 1)
})

test("a real reap SIGTERMs the group, then SIGKILLs what ignored it", async () => {
  const state = fakeReap({ ignoreTerm: true })
  await apply(decision(), [...state.table.procs], true, applier(state, false))
  assert.deepEqual(state.signals, [
    { pid: -4494, signal: "SIGTERM" },
    { pid: 4494, signal: "SIGKILL" },
    { pid: -4494, signal: "SIGKILL" },
  ])
  assert.match(state.notices[0]!.text, /^Ended 1 leftover process \(idle for 31m\): 4494/)
  assert.deepEqual(state.dropped, [4494])
})

test("a monitor's group is skipped, and nothing is reported for it", async () => {
  const state = fakeReap()
  const deps = { ...state.deps, monitorGroups: () => new Set([4494]) }
  const outcome = await reap(group(), deps)
  assert.equal(outcome.state, "skipped")
  assert.deepEqual(state.signals, [])
})
