import assert from "node:assert/strict"
import { test } from "node:test"
import { Ledger, parseGroup, type Group } from "../src/ledger.js"
import type { ShellCreated } from "../src/match.js"
import { proc, snapshot, ledgerHarness } from "./helpers.js"

const START = 1_700_000_000
const START_MS = START * 1000
const DAEMON = "/tmp/opencode-pty daemon --runtime-dir /tmp/pty"

const table = (over: { command?: string; pid?: number } = {}) =>
  snapshot([
    proc({ pid: 900, pgid: 900 }),
    proc({ pid: 448, ppid: 900, pgid: 448, command: DAEMON }),
    proc({ pid: over.pid ?? 4494, ppid: 448, pgid: over.pid ?? 4494, start: START, command: over.command ?? "/bin/bash -c sleep 30 & sleep 1; echo ok" }),
  ])

const created = (over: Partial<ShellCreated> = {}): ShellCreated => ({
  shellID: "sh_1",
  sessionID: "ses_a",
  command: "sleep 30 & sleep 1; echo ok",
  cwd: "/work",
  shell: "/bin/bash",
  started: START_MS,
  pid: 4494,
  ...over,
})

test("adoption matches the shell, records the group and writes one ledger entry", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  const group = ledger.groups.get(4494)
  assert.deepEqual(group, { pgid: 4494, leaderPid: 4494, leaderStart: START, sessionID: "ses_a", shellID: "sh_1", background: false, startedAt: START_MS, cwd: "/work", escapees: [] })
  assert.deepEqual(h.store.data.get("ledger/4494"), group)
})

test("every instance hears shell.created: the shell is adopted once", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await Promise.all([ledger.adopt(created(), new Set()), ledger.adopt(created(), new Set()), ledger.adopt(created(), new Set())])
  assert.equal(ledger.groups.size, 1)
  assert.equal(h.logs.filter((entry) => entry.event === "adopt").length, 1)
})

test("a monitor's group is excluded, and an unmatched shell is logged and not tracked", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set([4494]))
  assert.equal(ledger.groups.size, 0)
  assert.equal(h.logs.filter((entry) => entry.event === "adopt-miss").length, 1)
  assert.deepEqual([...h.store.data.keys()], [])

  h.set(snapshot([proc({ pid: 900, pgid: 900 })]))
  await ledger.adopt(created({ pid: undefined }), new Set())
  assert.equal(ledger.groups.size, 0)
})

test("no session id means no adoption", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created({ sessionID: undefined }), new Set())
  assert.equal(ledger.groups.size, 0)
})

test("the background mark waits for the adoption, and arrives after it too", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  ledger.markBackground("sh_1")
  await ledger.adopt(created(), new Set())
  assert.equal(ledger.groups.get(4494)?.background, true)

  h.set(table({ pid: 4600, command: "/bin/zsh -c npm test" }))
  await ledger.adopt(created({ shellID: "sh_2", pid: 4600, shell: "/bin/zsh", command: "npm test" }), new Set())
  assert.equal(ledger.groups.get(4600)?.background, false)
  ledger.markBackground("sh_2")
  assert.equal(ledger.groups.get(4600)?.background, true)
  assert.equal((h.store.data.get("ledger/4600") as Group).background, true)
})

test("shell.exited marks the leader gone and keeps the group for its leftovers", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  ledger.exit("sh_1", "exited")
  assert.equal(ledger.groups.get(4494)?.exitedAt, h.clock.now)
  assert.equal((h.store.data.get("ledger/4494") as Group).exitedAt, h.clock.now)
  assert.equal(ledger.groups.size, 1)
})

test("a child that leaves its group is followed as an escapee", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  h.set(
    snapshot([
      ...table().procs,
      proc({ pid: 5000, ppid: 4494, pgid: 5000, start: START + 1, command: "setsid-server" }),
      proc({ pid: 5001, ppid: 900, pgid: 5001, start: START + 1, command: "unrelated" }),
    ]),
  )
  const views = await ledger.sync(h.table)
  assert.deepEqual(ledger.groups.get(4494)?.escapees, [5000])
  assert.deepEqual(views[0]?.escapees.map((entry) => entry.pid), [5000])
  assert.equal(h.logs.some((entry) => entry.event === "escapee" && entry.pid === 5000), true)
})

test("a group with no live member is dropped, from memory and storage", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  h.set(snapshot([proc({ pid: 900, pgid: 900 })]))
  const views = await ledger.sync(h.table)
  assert.deepEqual(views, [])
  assert.equal(ledger.groups.size, 0)
  assert.equal(h.store.data.has("ledger/4494"), false)
  assert.equal(h.logs.some((entry) => entry.event === "drop"), true)
})

test("the CPU of a window is the group's delta over the elapsed time", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  // 15 s later the shell and its child used 10 CPU-seconds between them: 66% of one core.
  h.clock.now += 15_000
  h.set(
    snapshot([
      proc({ pid: 900, pgid: 900 }),
      proc({ pid: 448, ppid: 900, pgid: 448, command: DAEMON }),
      proc({ pid: 4494, ppid: 448, pgid: 4494, start: START, cpu: 6, command: "/bin/bash -c while :; do :; done" }),
      proc({ pid: 4495, ppid: 4494, pgid: 4494, start: START, cpu: 4, command: "spinner" }),
    ]),
  )
  const views = await ledger.sync(h.table)
  assert.equal(Math.round(views[0]!.cpu), 67)
  assert.equal(views[0]!.members.length, 2)
})

test("an orphan is a group whose shell exited and whose members were reparented to init", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  h.set(
    snapshot([
      proc({ pid: 900, pgid: 900 }),
      proc({ pid: 4495, ppid: 1, pgid: 4494, start: START + 1, command: "node server.js" }),
    ]),
  )
  const views = await ledger.sync(h.table)
  assert.equal(views[0]!.leaderAlive, false)
  assert.equal(views[0]!.orphan, true)
  assert.equal(ledger.groups.get(4494)?.exitedAt, h.clock.now)
})

test("a zombie shell is not alive: its group is a leftover, and only the live members count", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  h.set(
    snapshot([
      proc({ pid: 900, pgid: 900 }),
      proc({ pid: 448, ppid: 900, pgid: 448, command: DAEMON }),
      proc({ pid: 4494, ppid: 448, pgid: 4494, start: START, zombie: true, command: "(bash)" }),
      proc({ pid: 4495, ppid: 1, pgid: 4494, start: START + 1, command: "node server.js" }),
    ]),
  )
  const views = await ledger.sync(h.table)
  assert.equal(views.length, 1)
  assert.equal(views[0]!.leaderAlive, false)
  assert.equal(views[0]!.orphan, true)
  assert.deepEqual(views[0]!.members.map((entry) => entry.pid), [4495])
})

test("restore re-adopts a group whose processes survived and forgets the rest", async () => {
  const h = ledgerHarness()
  const kept: Group = { pgid: 4494, leaderPid: 4494, leaderStart: START, sessionID: "ses_a", shellID: "sh_1", background: false, startedAt: START_MS, escapees: [] }
  const leaderGone: Group = { pgid: 4600, leaderPid: 4600, leaderStart: START, sessionID: "ses_b", shellID: "sh_2", background: false, startedAt: START_MS, escapees: [4602] }
  const dead: Group = { pgid: 4700, leaderPid: 4700, leaderStart: START, sessionID: "ses_c", shellID: "sh_3", background: false, startedAt: START_MS, escapees: [] }
  h.store.data.set("ledger/4494", kept)
  h.store.data.set("ledger/4600", leaderGone)
  h.store.data.set("ledger/4700", dead)
  h.store.data.set("ledger/9999", { junk: true })
  h.set(
    snapshot([
      proc({ pid: 4494, ppid: 1, pgid: 4494, start: START, command: "/bin/bash -c sleep 600" }),
      proc({ pid: 4602, ppid: 1, pgid: 4602, start: START + 1, command: "node server.js" }),
    ]),
  )
  const ledger = new Ledger(h.deps)
  assert.equal(await ledger.restore(), 2)
  assert.deepEqual([...ledger.groups.keys()].sort((a, b) => a - b), [4494, 4600])
  assert.equal(ledger.groups.get(4600)?.exitedAt, h.clock.now)
  assert.equal(h.store.data.has("ledger/4700"), false)
  assert.equal(h.store.data.has("ledger/9999"), false)
  assert.equal(h.logs.filter((entry) => entry.event === "restore").length, 2)
})

test("restore refuses a stored group with a future start, and parseGroup refuses what has no shape", async () => {
  const h = ledgerHarness()
  h.store.data.set("ledger/4494", { pgid: 4494, leaderPid: 4494, leaderStart: START, sessionID: "ses_a", shellID: "sh_1", startedAt: START_MS + 86_400_000 })
  h.set(table())
  const ledger = new Ledger(h.deps)
  assert.equal(await ledger.restore(), 0)
  assert.equal(parseGroup(null), undefined)
  assert.equal(parseGroup({ pgid: 1 }), undefined)
  assert.equal(parseGroup({ pgid: 4494, leaderPid: 4494, leaderStart: START, sessionID: "ses_a", shellID: "sh_1", startedAt: START_MS, escapees: ["x", 2] })?.escapees.length, 1)
})

test("trackedPids is one session's own processes, never another's", async () => {
  const h = ledgerHarness()
  h.set(table())
  const ledger = new Ledger(h.deps)
  await ledger.adopt(created(), new Set())
  const both = snapshot([...table().procs, proc({ pid: 4600, ppid: 448, pgid: 4600, start: START, command: "/bin/zsh -c npm test" })])
  h.set(both)
  await ledger.adopt(created({ shellID: "sh_2", sessionID: "ses_b", pid: 4600, shell: "/bin/zsh", command: "npm test" }), new Set())
  assert.deepEqual([...ledger.trackedPids("ses_a", h.table)], [4494])
  assert.deepEqual([...ledger.trackedPids("ses_b", h.table)], [4600])
  assert.equal(ledger.trackedPids("ses_c", h.table).size, 0)
})

test("every instance offers its host calls, and leaves with them", async () => {
  const { acquire, resetShared } = await import("../src/ledger.js")
  resetShared()
  const h = ledgerHarness()
  const first = acquire(h.deps, { location: "/work/a", facts: async () => undefined, deliver: async () => {} })
  assert.equal(first.shared.refs, 1)
  assert.equal(first.shared.peers.size, 1)
  const second = acquire(h.deps, { location: "/work/b", facts: async () => undefined, deliver: async () => {} })
  assert.equal(second.shared, first.shared)
  assert.equal(first.shared.refs, 2)
  assert.deepEqual([...first.shared.peers.values()].map((peer) => peer.location), ["/work/a", "/work/b"])
  second.release()
  assert.equal(first.shared.refs, 1)
  assert.deepEqual([...first.shared.peers.values()].map((peer) => peer.location), ["/work/a"])
  first.release()
  assert.equal(first.shared.refs, 0)
  assert.equal(first.shared.peers.size, 0)
  resetShared()
})
