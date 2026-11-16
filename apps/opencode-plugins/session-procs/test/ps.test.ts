import assert from "node:assert/strict"
import { test } from "node:test"
import { cpuSeconds, liveProcs, parsePs } from "../src/ps.js"
import { parse, proc, snapshot } from "./helpers.js"

// The shape of one real `ps -axww -o pid=,ppid=,pgid=,uid=,lstart=,time=,command=` line, copied from the private
// harness on 2.3.0 (a pty-daemon child, a 1-hour process, and a daemon).
const FIXTURE = `  4488  3999  4488   501 S    Mon Nov 16 17:57:22 2026       0:03.34 /private/tmp/oc-harness-procs/cache/opencode/bin/opencode-pty/0.5.2-ed3adb8c7531fef5/opencode-pty daemon --runtime-dir /private/tmp/oc-harness-procs/state/opencode/pty --name 8c8b006c
 4494  4488  4494   501 Z    Mon Nov 16 17:57:22 2026       0:00.00 (bash)
 4500     1  4500   501 S+   Mon Nov 16 16:57:22 2026   1:02:03.45 /bin/bash -c while :; do :; done
`

test("ps lines parse into pid, parent, group, uid, start and CPU seconds", () => {
  const snap = parse(FIXTURE)
  assert.equal(snap.procs.length, 3)
  const [daemon, sleep, loop] = snap.procs
  assert.deepEqual({ pid: daemon!.pid, ppid: daemon!.ppid, pgid: daemon!.pgid, uid: daemon!.uid, cpu: daemon!.cpu, zombie: daemon!.zombie }, { pid: 4488, ppid: 3999, pgid: 4488, uid: 501, cpu: 3.34, zombie: false })
  assert.equal(sleep!.zombie, true, "a Z in stat is a zombie: exited, not yet reaped")
  assert.equal(daemon!.command, "/private/tmp/oc-harness-procs/cache/opencode/bin/opencode-pty/0.5.2-ed3adb8c7531fef5/opencode-pty daemon --runtime-dir /private/tmp/oc-harness-procs/state/opencode/pty --name 8c8b006c")
  assert.equal(sleep!.command, "(bash)")
  assert.equal(loop!.cpu, 3723.45)
  // lstart is local time, the same zone ps runs in.
  assert.equal(sleep!.start, Math.round(new Date("Mon Nov 16 17:57:22 2026").getTime() / 1000))
  assert.deepEqual(snap.byPgid.get(4494)?.map((entry) => entry.pid), [4494])
  assert.equal(snap.byPid.get(4488)?.ppid, 3999)
})

test("a line broken by a newline inside a command is skipped, not misread", () => {
  const text = `${FIXTURE}git commit -m first line\nsecond line of the message\n 4600  4488  4600   501 S    Mon Nov 16 17:00:00 2026 0:00.01 node x.js\n`
  const snap = parsePs(text, 1)
  assert.deepEqual(snap.procs.map((entry) => entry.pid), [4488, 4494, 4500, 4600])
})

test("ps time formats", () => {
  assert.equal(cpuSeconds("0:00.00"), 0)
  assert.equal(cpuSeconds("0:01.50"), 1.5)
  assert.equal(cpuSeconds("12:34"), 754)
  assert.equal(cpuSeconds("1:02:03"), 3723)
  assert.equal(cpuSeconds("2-03:04:05"), 183_845)
  assert.equal(cpuSeconds("nonsense"), undefined)
})

test("liveProcs keeps our uid and processes that start with the group, never an older one", () => {
  const start = 1_700_000_000
  const snap = snapshot([
    proc({ pid: 10, pgid: 10, uid: 501, start }),
    proc({ pid: 11, pgid: 10, uid: 501, start: start + 5 }),
    proc({ pid: 12, pgid: 10, uid: 502, start: start + 5 }),
    proc({ pid: 13, pgid: 10, uid: 501, start: start - 3600 }),
    proc({ pid: 14, pgid: 10, uid: 501, start: start + 5 }),
    proc({ pid: 15, pgid: 10, uid: 501, start: start + 5, zombie: true }),
  ])
  assert.deepEqual(liveProcs(snap, 10, start * 1000, 501).map((entry) => entry.pid), [10, 11, 14])
  assert.deepEqual(liveProcs(snap, 10, start * 1000, 501, [14]).map((entry) => entry.pid), [10, 11, 14])
  assert.deepEqual(liveProcs(snap, 99, start * 1000, 501, [14]).map((entry) => entry.pid), [14])
})
