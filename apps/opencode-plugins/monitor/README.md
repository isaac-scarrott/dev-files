# Monitor

Start a command in the background and wake the session with its output as it happens, like Claude Code's Monitor tool.

> **Credit:** Idea and tool wording follow Claude Code's Monitor tool (Anthropic); the wrapper and untrusted-data trailer follow the `<cross-session-message>` pattern in [`orchestrator-tools`](../orchestrator-tools). No code was copied.

## What it does
- `monitor.start` runs a shell command in the background. Each stdout/stderr line (optionally filtered by a regex) is an event; lines arriving close together become one message in the session, idle or busy, as `<monitor-event name="…" id="…" seq="N">` with a trailer saying the content is untrusted program output.
- One more message arrives when the command exits, with its exit code.
- `rearmMinutes` starts the command again every N minutes, ending a run that is still going (the "storefront watch" pattern).
- `monitor.list` shows what is running; `monitor.stop` ends a monitor and everything it started (SIGTERM to the process group, SIGKILL after a grace period).
- Monitors end when their session is archived or deleted, after `ttlMinutes` (default 24 h), and when the service shuts down.
- `session` can name another session to wake, but only the caller's own tree: itself, its parent, its children and descendants, sessions it created through `orchestrator-tools`, and its siblings (the `parent`/`child`/`sibling` relations `list_peers` shows, the `tree` scope of `send_message`). Anything else is rejected with an error.
- A noisy monitor pauses with a notice after `maxEventsPerHour` lines; extra lines are counted, not shown.

## Context
OpenCode's background shell only notifies when the command exits. This fills the gap for watchers, dev servers and polling loops.

Safety: the command goes through the host's normal `shell` approval (and `external_directory` for a `cwd` outside the session directory), asked on the calling session, so a session that may not run shell cannot start a monitor. Re-arm restarts and restores after a service restart reuse that first approval. Output is wrapped and escaped, but a model can still be influenced by what a program prints.

A monitor started by a previous run is not restarted, unless it has `rearmMinutes`; then the first wake says it was restarted. One that is not restarted wakes its session once with a `<monitor-notice>` saying it is gone and can be started again (nothing is sent if the session is archived or deleted). If the service is killed hard (SIGKILL, crash), running commands are orphaned: the plugin cannot reap what it cannot signal.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/monitor"]
```
Kind: server. Restart the background service (quit the app, then `opencode service restart`); the service outlives the app, so quitting alone does not reload it.

## Options
| Option | Default | |
|---|---|---|
| `maxMonitors` | `5` | running monitors at once |
| `ttlMinutes` | `1440` | default auto-stop; the tool's `ttlMinutes` overrides |
| `maxEventsPerHour` | `200` | per monitor, then it pauses |
| `minRearmMinutes` | `1` | smallest `rearmMinutes` |
| `maxLinesPerWake` | `50` | lines per message; the rest are counted |
| `maxLineChars` | `2000` | longer lines are cut |
| `maxBufferBytes` | `65536` | unsent output held per monitor |
| `killGraceSeconds` | `5` | SIGTERM to SIGKILL |
| `logDir` | `~/.local/share/opencode/monitor` | `monitor.log` (lifecycle only, never output) |

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Design notes: [DESIGN.md](DESIGN.md).
