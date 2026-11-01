# Usage resume

When a Claude usage limit stops a session you opted in, it waits for your accounts to recover and then continues the session for you.

## What it does
- **Off by default.** A refresh-arrow toggle in the composer, right after the model picker, turns it on per session. Settings > Preferences > "Auto-resume after usage limit" sets whether new sessions start with it on; a session's own toggle always wins.
- Detects the Claude Agent provider's "usage limit reached" failure and stops OpenCode's useless short retries.
- Works out when any of your cliproxy Claude accounts has the limiting window free again, waits for that reset plus a margin, re-checks real usage, then queues one "Continue." prompt.
- Adds a timeline notice with the resume time. Survives restarts and sleep: deadlines are checked every 30 seconds.
- Gives up on a session after 3 resumes without a completed run, and drops stalls older than 8 days. Subagent sessions are never resumed.
- Logs every failed run, detected limit, schedule, resume and skip with its reason (tokens redacted) to `~/.local/share/opencode/usage-resume/usage-resume.log`, and keeps the first real limit error as `limit-error.json` for detector tests.
- Only reads the cliproxy auth files and the usage endpoint, at the notch app's pace (5 minute floor per account, 30 minute backoff cap). It never enables or spends extra usage.

## Context
Without it a session that hits the 5-hour or weekly limit just fails and waits for you. It needs the Claude Agent provider routed through cliproxy ([claude-proxy](../claude-proxy)) and accounts in `~/.cli-proxy-api/claude-*.json`. A real limit cannot be provoked in tests, so the limit message is the one the 2.2.5 provider builds, fed to the resumer.

A limit that never makes a run fail leaves nothing to resume: an account with extra usage on keeps serving past 100% and bills the overage. This plugin never enables or pays for extra usage.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": [{
  "package": "/path/to/apps/opencode-plugins/usage-resume",
  "options": { "prompt": "Continue." }
}]
```
Kind: server and GUI. Restart the app.

## Options
Durations are seconds.

| Option | Default | |
|---|---|---|
| `prompt` | `Continue.` | text sent on resume |
| `marginSeconds` | `60` | wait after the computed reset before checking |
| `maxAttempts` | `3` | resumes per session before giving up (reset when a run completes) |
| `retryBackoffSeconds` | `300` | extra wait after a repeat stall, doubled each time |
| `maxWaitHours` | `192` | drop stalls older than this |
| `tickSeconds` | `30` | how often due sessions are looked at (sleep-safe) |
| `staggerSeconds` | `1` | pause between resuming sessions |
| `notices` | `true` | timeline notice with the resume time |
| `sampleDir` | `~/.local/share/opencode/usage-resume` | log file and error samples |
| `authDir` | `~/.cli-proxy-api` | cliproxy auth files (read-only) |
| `snapshotPath` | notch app cache | its readings are reused to avoid double polling; `""` disables |

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Tests use a fake host, clock and fetch. Design notes: [DESIGN.md](DESIGN.md).
