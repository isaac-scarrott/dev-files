# session-procs

Processes a session's shells leave behind (`&` servers, test binaries outliving `pkill cargo`, runaway loops) are found, reported, and ended — and nothing else is ever touched.

## What it does

- **Tracks every shell the host spawns for a tool call.** On `shell.created` it takes one snapshot of the process table and matches the event's pid (2.3.0 has one) to a process group the service started, directly or through its pty daemon. The group and its escapees (children that left it) are persisted under `ctx.storage`.
- **Scans every 15 s** for the group's CPU, for children that left the group, and for shells that exited. The scan costs one `ps` (~58 ms) per interval.
- **Ends, per the table below**, with SIGTERM to the whole group and each escapee, then SIGKILL after `killGraceSeconds`; the process table is re-read right before any signal.
- **Reports without waking.** A runaway gets one notice per stretch (“using 91% CPU… will be ended when this session ends”); every reap leaves “Ended N leftover processes: …” that waits in the inbox for the session's next turn (`delivery: "steer"`, `resume: false`), plus one info notification to the alerts hub when installed.
- **Refuses a patterned kill that would reach past the session's own processes** (`pkill`, `killall`, `pgrep … | xargs kill`) before it runs, and says to `kill <pid>` your own instead.
- **Logs every action** to `~/.local/share/opencode/session-procs/log.jsonl`.

## Rules

| When | What is ended |
| --- | --- |
| the session is archived or deleted | every group of that session, live background jobs included |
| a sub-agent session (`parentID`) has been idle `subagentIdleMinutes`, with no monitor and not busy | leftovers only: what remains of a group whose shell exited |
| a group is orphaned (shell exited, members reparented) and has been over `runawayCpu` for `orphanKillMinutes`, session not busy | that group |

A group whose shell is still alive is a live background job and is never idle-reaped. A top-level session is never
idle-reaped: its deliberately long-lived processes (a VM, a server) are left alone however long it idles.

**Never killed:** anything not matched to a `shell.created` (the user's terminals, `!command`, MCP servers, the pty daemon, the service and its ancestors), a monitor's own process group, another session's groups, other uids, a reused pid, and anything at all while `enabled` is false or `~/.config/opencode/session-procs.off` exists.

## Install

Register by absolute path in `~/.config/opencode/opencode.json`, with `dryRun` on at first:

```json
{
  "package": "/Users/isaac/git/dev-files/apps/opencode-plugins/session-procs",
  "options": { "dryRun": true }
}
```

Kind: server. Restart the background service (`scripts/opencode-safe-restart.sh`) for the first load and for option changes.

**`dryRun` is the default and it is what ships registered:** it logs what it would end (to `log.jsonl` only, never to the session) and kills nothing. The kill guard still refuses under `dryRun` — refusing is safe, and the pattern is dangerous either way.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Off: no tracking, no scanning, no guard. |
| `dryRun` | `true` | Log what would be ended; tell no session, kill nothing. The guard still refuses. |
| `scanSeconds` | `15` | One `ps` per interval. |
| `subagentIdleMinutes` | `10` | A sub-agent's session idle this long, with no monitor, has its leftovers ended. Top-level sessions are never idle-reaped. |
| `runawayCpu` | `90` | Percent of one CPU across the group that counts as runaway. |
| `runawayMinutes` | `10` | Over `runawayCpu` this long earns one notice, once. |
| `orphanKillMinutes` | `30` | An orphaned group over `runawayCpu` this long is ended while its session is not busy. |
| `killGraceSeconds` | `5` | SIGTERM, then SIGKILL after this long. |
| `guardKill` | `true` | Refuse `pkill`/`killall`/`pgrep … | xargs kill` when the pattern matches a process this session does not own. |

Turning it off without a restart: `touch ~/.config/opencode/session-procs.off`.

## The kill guard

`pkill sleep`, `killall node` and `pgrep -f x | xargs kill` pick their victims by pattern, and a pattern written for one session's work also matches the user's terminals, another session's jobs and the host. The guard runs `pgrep -f` for the same pattern and refuses the call when any match is not one of this session's tracked processes, listing those pids and saying to `kill <pid>` your own. A call it cannot parse (a substitution, a wrapped script) passes: a guard that guessed would block real work.

## Cost

One `ps` every `scanSeconds`: about 58 ms per scan on this machine (dominated by spawning `ps`; parsing 1000 lines is 0.7 ms and the ledger work for 50 tracked groups is under 0.1 ms), so roughly 0.4% of one core at the default 15 s. Adoption adds one `ps` per shell call, and one `session.get` per tracked session per scan.

## Limits

- A shell that has already been reaped when `shell.created` is handled cannot be matched, so its leftovers are not tracked. With `info.pid` (2.3.0) a shell that is still a zombie is: the pid and parent are enough.
- The ledger lives on `globalThis` per service process and in `ctx.storage`; a restart re-adopts what survived. A graceful shutdown kills the host's own jobs and the pty's sessions, so usually only processes that detached themselves survive it.
- `session.get` is answered by an instance of the session's location. Every instance offers its host calls and the scan asks the right one first; when no instance can answer (a deleted session), nothing is killed from the rules — the `session.deleted`/`session.archived` events are what end a deleted session's groups.

## Development

`npm_config_registry=https://registry.npmjs.org pnpm install`, then `pnpm typecheck && pnpm test && pnpm build` (dist is tracked) and `pnpm smoke`. Tests: unit rules over a fake process table and clock, real detached processes for the reaper, and a fake host with a real process for the plugin. Design notes and the 2.3.0 fixture findings: [DESIGN.md](DESIGN.md).
