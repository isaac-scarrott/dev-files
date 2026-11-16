import assert from "node:assert/strict"
import { test } from "node:test"
import { isPtyDaemon, matchShell, type ShellCreated } from "../src/match.js"
import { proc, snapshot, type ProcBits } from "./helpers.js"

const START = 1_700_000_000
const DAEMON = "/Users/isaac/.cache/opencode/bin/opencode-pty/0.5.2/opencode-pty daemon --runtime-dir /tmp/pty"
const service = { pid: 900, uid: 501 }

/** The 2.3.0 fixture: the shell is a pty-daemon child, leads its own group, and `info.pid` names it. */
const ptyShell = (over: Partial<ProcBits> = { pid: 4494 }) =>
  snapshot([
    proc({ pid: 900, pgid: 900, command: "/Applications/OpenCode.app/opencode-cli serve --service" }),
    proc({ pid: 901, ppid: 900, pgid: 901, command: "node /usr/local/bin/browse mcp" }),
    proc({ pid: 448, ppid: 900, pgid: 448, command: DAEMON }),
    proc({ pid: over.pid ?? 4494, ppid: 448, pgid: over.pid ?? 4494, start: START, command: "/bin/bash -c sleep 30 & sleep 1; echo ok", ...over }),
  ])

const created = (over: Partial<ShellCreated> = {}): ShellCreated => ({
  shellID: "sh_1",
  sessionID: "ses_a",
  command: "sleep 30 & sleep 1; echo ok",
  cwd: "/work",
  shell: "/bin/bash",
  started: START * 1000,
  pid: 4494,
  ...over,
})

test("a shell.created with a pid matches its pty-daemon child by pid, parent, argv and start", () => {
  const result = matchShell(created(), ptyShell(), service)
  assert.deepEqual(result, { state: "matched", match: { pgid: 4494, leaderPid: 4494, leaderStart: START } })
})

test("the shell execs a lone command: ps shows the command itself, not <shell> -c", () => {
  const table = ptyShell({ pid: 4771, command: "sleep 30" })
  const result = matchShell(created({ pid: 4771, command: "sleep 30" }), table, service)
  assert.equal(result.state, "matched")
})

test("a nested sh -c loses its quotes when bash re-parses it: the pid still identifies the shell", () => {
  const table = ptyShell({ pid: 3628, command: "sh -c sleep 300 & echo ok" })
  const result = matchShell(created({ pid: 3628, command: "sh -c 'sleep 300 & echo ok'" }), table, service)
  assert.equal(result.state, "matched")
  // Without the pid the same text has to agree too, and it does once normalised.
  assert.equal(matchShell(created({ pid: undefined, command: "sh -c 'sleep 300 & echo ok'" }), table, service).state, "matched")
})

test("a shell that already exited is a zombie with no argv: its pid still identifies the leftover's group", () => {
  for (const shown of ["<defunct>", "(bash)", "(sh)"]) {
    assert.equal(matchShell(created({ pid: 3628 }), ptyShell({ pid: 3628, command: shown }), service).state, "matched")
  }
  // Without the host's pid there is nothing to identify a zombie by.
  assert.equal(matchShell(created({ pid: undefined }), ptyShell({ pid: 3628, command: "<defunct>" }), service).state, "none")
})

test("without info.pid the posterity fields still identify one shell", () => {
  const result = matchShell(created({ pid: undefined }), ptyShell(), service)
  assert.equal(result.state, "matched")
})

test("a direct child of the service (no pty daemon) matches too", () => {
  const table = snapshot([proc({ pid: 900, pgid: 900, command: "opencode-cli serve --service" }), proc({ pid: 5000, ppid: 900, pgid: 5000, start: START, command: "/bin/zsh -c npm test" })])
  assert.equal(matchShell(created({ pid: undefined, command: "npm test", shell: "/bin/zsh", started: START * 1000 }), table, service).state, "matched")
})

test("a process under an unrelated daemon is not the shell", () => {
  const table = snapshot([
    proc({ pid: 900, pgid: 900 }),
    proc({ pid: 700, ppid: 900, pgid: 700, command: "some-other-daemon" }),
    proc({ pid: 701, ppid: 700, pgid: 701, start: START, command: "/bin/bash -c sleep 30 & sleep 1; echo ok" }),
  ])
  assert.equal(matchShell(created({ pid: 701 }), table, service).state, "none")
})

test("a reused pid, a foreign uid or a different command is not the shell", () => {
  assert.equal(matchShell(created(), ptyShell({ start: START - 30 }), service).state, "none")
  assert.equal(matchShell(created(), ptyShell({ uid: 502 }), service).state, "none")
  assert.equal(matchShell(created(), ptyShell({ command: "sleep 999" }), service).state, "none")
  assert.equal(matchShell(created({ pid: undefined, started: START * 1000 - 10_000 }), ptyShell(), service).state, "none")
})

test("two identical commands started together are ambiguous and stay untracked", () => {
  const rebuilt = snapshot([...ptyShell().procs, proc({ pid: 4600, ppid: 448, pgid: 4600, start: START, command: "/bin/bash -c sleep 30 & sleep 1; echo ok" })])
  const result = matchShell(created({ pid: undefined }), rebuilt, service)
  assert.deepEqual(result, { state: "ambiguous", pids: [4494, 4600] })
})

test("a group the caller excludes (a monitor's) is never matched", () => {
  assert.equal(matchShell(created(), ptyShell(), service, new Set([4494])).state, "none")
})

test("a leader that does not lead its own group is not a shell", () => {
  const table = snapshot([proc({ pid: 900, pgid: 900 }), proc({ pid: 448, ppid: 900, pgid: 448, command: DAEMON }), proc({ pid: 4494, ppid: 448, pgid: 448, start: START, command: "/bin/bash -c sleep 30 & sleep 1; echo ok" })])
  assert.equal(matchShell(created(), table, service).state, "none")
})

test("the pty daemon is recognised by its argv, whatever its path", () => {
  assert.equal(isPtyDaemon(DAEMON), true)
  assert.equal(isPtyDaemon("opencode-pty daemon --runtime-dir /tmp"), true)
  assert.equal(isPtyDaemon("/bin/bash -c opencode-pty daemon"), false)
  assert.equal(isPtyDaemon("opencode-pty"), false)
})
