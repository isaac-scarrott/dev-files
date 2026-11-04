# shell-handoff

When a service restart kills a background shell job, the session is told and the job is written down, so a long watcher is not silently forgotten.

## What it does

- Records every `shell` call that moves a job to the background (`background: true`, or a foreground command that outgrew its timeout): command, directory, start time, session, tool call.
- After a service restart, writes `~/.local/share/opencode/shell-handoff/<sessionID>.md` for each session that lost jobs: command, cwd, start, loss time, how long it ran, ids, how to re-arm. Newest restart first, 50 KB cap, mode 0600 in a 0700 directory.
- Queues one short notice in that session, delivered on its next turn without waking it: up to 5 jobs, then "+N more", and a pointer to the file. The notice nudges the model to re-run what is still needed, and to use `monitor.start` for long watchers because monitors are restored after a restart.
- Publishes one info notification (through the `notifications` hub, when installed) with an Open action to the session.
- Says nothing on success: a job that finishes, a hot reload of the plugin, or a restart that lost nothing produces no output.

## Context

OpenCode 2.2.5 starts background `shell` jobs detached, and the service kills them on shutdown. On the next boot the host adds a `<shell … state="cancelled">Command cancelled because the server restarted</shell>` message to the session but does not wake it, keeps no cwd for it, and re-runs nothing. A peer session lost 50-minute merge watchers this way and had to rearm them by hand. This plugin adds the missing record and handoff. It **never re-runs anything**: recorded commands are data (see DESIGN).

Limits:

- It cannot revive a job or recover its output. The host usually deletes a cancelled job's `.out` file; when one is still there the handoff file links it.
- The host's own cancel notice contains the raw command. It cannot be edited from a plugin, so a secret in a command still reaches the model through that message. Only this plugin's file and notice are redacted.
- Jobs started by the user's own `!command` shell (not a tool call) are not recorded.
- A project is reported when its location loads after the restart (opening the project does that); a project nobody opens keeps its record until the retention runs out.
- Redaction is pattern based (env assignments with secret-like names, `--password`/`--token` flags, `Authorization`/`Cookie` headers, `scheme://user:pass@`, well-known token prefixes, JWTs, PEM blocks, long mixed-case tokens). It errs toward hiding, and it can miss a secret that has no recognisable shape.

## Install

Register by absolute path in `~/.config/opencode/opencode.json`:

```json
"plugins": ["/Users/isaac/git/dev-files/apps/opencode-plugins/shell-handoff"]
```

Kind: server. Restart the background service (`scripts/opencode-safe-restart.sh` in dev-files) for the first load and for option changes.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `retentionDays` | `7` | Records and handoff files older than this are dropped. |
| `maxRecords` | `200` | Most running-job records kept; the oldest go first. |
| `notice` | `true` | Queue the session notice. |
| `file` | `true` | Write the handoff file. |
| `notify` | `true` | Publish the info notification to the alerts hub. |

## Cost

No timers and no polling. The hooks do constant work: about 0.1 µs for a call that is not a background shell, about 45 µs (including redaction and one storage write) for a background job. One event subscription feeds `shell.created`, `shell.exited` and session removal.

## Upstream asks

- Persist the cwd (and pid) in the shell job's `recovery` record, so the host's own restart notice can say where the command ran.
- A keep-alive mode for background shell jobs, like the PTY handoff, so a restart does not kill them.
- A host hook on restart recovery (jobs cancelled by a restart), so a plugin does not infer a restart from a boot id.
- Redaction in the host's synthetic restart notice (it prints the command verbatim).

## Development

`npm_config_registry=https://registry.npmjs.org pnpm install`, then `pnpm typecheck && pnpm test && pnpm build` (dist is tracked) and `pnpm smoke`. `harness/up.sh` starts a private harness with a stub model, `harness/drive.mjs` drives its service over HTTP, `harness/down.sh` stops it. Design notes: [DESIGN.md](DESIGN.md).
