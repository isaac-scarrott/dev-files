import assert from "node:assert/strict"
import { test } from "node:test"
import { createKillGuard, killCandidates, segments } from "../src/guard.js"
import { proc, snapshot } from "./helpers.js"

test("the kill forms the guard knows, with their patterns", () => {
  const cases: [string, { kind: string; pattern: string }[]][] = [
    ["pkill sleep", [{ kind: "pkill", pattern: "sleep" }]],
    ["pkill -f 'sleep 600'", [{ kind: "pkill", pattern: "sleep 600" }]],
    ["pkill -TERM node", [{ kind: "pkill", pattern: "node" }]],
    ["killall -9 node", [{ kind: "killall", pattern: "node" }]],
    ["pgrep -f foo | xargs kill", [{ kind: "xargs", pattern: "foo" }]],
    ["pgrep -fl foo | xargs -r kill -9", [{ kind: "xargs", pattern: "foo" }]],
    ["sudo pkill -f vite", [{ kind: "pkill", pattern: "vite" }]],
    ["env FOO=1 pkill bar", [{ kind: "pkill", pattern: "bar" }]],
    ["pkill foo; pkill bar", [{ kind: "pkill", pattern: "foo" }, { kind: "pkill", pattern: "bar" }]],
  ]
  for (const [command, expected] of cases) assert.deepEqual(killCandidates(command), expected, command)
})

test("shell redirections are not arguments: the pattern is the real one", () => {
  const cases: [string, { kind: string; pattern: string }[]][] = [
    [`pkill -f "sdk-origin.mjs" 2>/dev/null`, [{ kind: "pkill", pattern: "sdk-origin.mjs" }]],
    [`pkill -f sdk-origin.mjs >/dev/null 2>&1`, [{ kind: "pkill", pattern: "sdk-origin.mjs" }]],
    [`pkill -f sdk-origin.mjs &>/dev/null`, [{ kind: "pkill", pattern: "sdk-origin.mjs" }]],
    [`pkill -f sdk-origin.mjs 2> /dev/null`, [{ kind: "pkill", pattern: "sdk-origin.mjs" }]],
    [`pkill -f sdk-origin.mjs 1>/dev/null`, [{ kind: "pkill", pattern: "sdk-origin.mjs" }]],
    [`pkill -f sdk-origin.mjs > out.log`, [{ kind: "pkill", pattern: "sdk-origin.mjs" }]],
    [
      `kill 1 2>/dev/null; sleep 2; pkill -f "sdk-origin.mjs" 2>/dev/null; pkill -f "apps/storefront.*vite" 2>/dev/null`,
      [
        { kind: "pkill", pattern: "sdk-origin.mjs" },
        { kind: "pkill", pattern: "apps/storefront.*vite" },
      ],
    ],
    [`pgrep -f node 2>/dev/null | xargs kill`, [{ kind: "xargs", pattern: "node" }]],
    [`pkill -f "a>b"`, [{ kind: "pkill", pattern: "a>b" }]],
  ]
  for (const [command, expected] of cases) assert.deepEqual(killCandidates(command), expected, command)
})

test("unparseable or unrelated calls pass: nothing is guessed", () => {
  for (const command of ['pkill "$PATTERN"', "pkill -f $(cat pattern.txt)", "pkill", "kill 123", "echo pkill foo", "grep foo | pkill", 'bash -c "pkill foo"', "pgrep -f foo", "xargs kill < pids"]) {
    assert.deepEqual(killCandidates(command), [], command)
  }
})

test("quotes keep a pattern whole and substitutions do not become patterns", () => {
  assert.deepEqual(segments(`pkill -f "a  b" | wc -l`).map((words) => words.map((word) => word.text)), [["pkill", "-f", "a  b"], ["wc", "-l"]])
  assert.equal(segments("pkill -f `whoami`")[0]?.[2]?.dynamic, true)
})

const table = snapshot([
  proc({ pid: 100, pgid: 100, command: "node server.js" }),
  proc({ pid: 101, pgid: 100, command: "sh -c node server.js" }),
  proc({ pid: 200, pgid: 200, command: "/usr/bin/python other.py" }),
  proc({ pid: 201, pgid: 201, command: "node /Users/isaac/git/other" }),
])

const guard = (pids: number[], tracked = new Set([100, 101])) =>
  createKillGuard({
    pgrep: async () => pids,
    snapshot: async () => table,
    tracked: () => tracked,
    log: () => {},
  })

const call = (command: string, tool = "shell") => ({ tool, sessionID: "ses_a", input: { command } })

test("a pattern that reaches another session's process is refused, with the pids and what to do", async () => {
  await assert.rejects(guard([100, 200]).bind(null)(call("pkill node")), (error: unknown) => {
    const message = (error as { message: string }).message
    assert.match(message, /pkill would signal 1 process this session does not own: 200 \(/)
    assert.match(message, /kill 200/)
    return true
  })
})

test("a redirection after the pattern does not hide it from the guard", async () => {
  await assert.rejects(guard([100, 200])(call(`pkill -f node 2>/dev/null`)), (error: unknown) => {
    assert.match((error as { message: string }).message, /pkill would signal 1 process this session does not own: 200 \(/)
    return true
  })
})

test("a pattern that only reaches this session's own processes runs", async () => {
  await guard([100, 101])(call("pkill -f 'node server.js'"))
})

test("no match, no process table, another tool or another form: nothing is refused", async () => {
  await guard([])(call("killall node"))
  await guard([200])(call("kill 200", "read"))
  await guard([200])(call("echo hi"))
  const blind = createKillGuard({ pgrep: async () => [200], snapshot: async () => undefined, tracked: () => new Set(), log: () => {} })
  await blind(call("pkill node"))
})

test("a pgrep that fails open (its own error) refuses nothing", async () => {
  const failing = createKillGuard({ pgrep: async () => [], snapshot: async () => table, tracked: () => new Set(), log: () => {} })
  await failing(call("pkill node"))
})
