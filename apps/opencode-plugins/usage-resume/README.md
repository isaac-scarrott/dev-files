# Usage resume

When a Claude usage limit stops a session you opted in, it waits for your accounts to recover and then continues the session for you.

> **Credit:** the usage-limit message text it detects is Claude Code's (Anthropic). Knowledge only, no code.

## What it does
- **Off by default.** While a session is stopped at a usage limit, a pill above the composer ("Resume after limit") turns it on for that session; it is not shown otherwise and never in subagent sessions. Settings > Preferences > "Auto-resume after usage limit" sets whether new sessions start with it on; a session's own toggle always wins.
- Detects the Claude Agent provider's "usage limit reached" failure and stops OpenCode's useless short retries.
- Works out when any of your cliproxy Claude accounts has the limiting window free again, waits for that reset plus a margin, re-checks real usage, then queues one "Continue." prompt.
- Tells you through the shared notification system ([notifications](../notifications) when installed, else a toast of its own with Open): an error "Usage limit reached, resumes 14:05" (or "Usage limit reached" with "Auto-resume is off for this session." when you did not opt in), an info "Resumes 15:10" when the time moves, and an error when it gives up after the attempt cap. A resume that works says nothing: it starts a turn and the run reports for itself.
- Adds a timeline notice with the resume time. Survives restarts and sleep: deadlines are checked every 30 seconds.
- Gives up on a session after 3 resumes without a completed run, and drops stalls older than 8 days. Subagent sessions are never resumed.
- Logs every failed run, detected limit, schedule, resume and skip with its reason (tokens redacted) to `~/.local/share/opencode/usage-resume/usage-resume.log`, and keeps the first real limit error as `limit-error.json` for detector tests.
- Only reads the cliproxy auth files and the usage endpoint, at the notch app's pace (5 minute floor per account, 30 minute backoff cap). It never enables or spends extra usage.

## Context
Without it a session that hits the 5-hour or weekly limit just fails and waits for you. It needs the Claude Agent provider routed through cliproxy ([claude-proxy](../claude-proxy)) and accounts in `~/.cli-proxy-api/claude-*.json`. A real limit cannot be provoked in tests, so the limit message is the one the 2.2.5 provider builds, fed to the resumer. The notifications were also exercised end to end in the harness with a stub provider that answers 429 with a limit body (the other shape the detector reads); a real Claude limit has not been seen.

A limit that never makes a run fail leaves nothing to resume: an account with extra usage on keeps serving past 100% and bills the overage. This plugin never enables or pays for extra usage.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": [{
  "package": "/path/to/apps/opencode-plugins/usage-resume",
  "options": { "prompt": "Continue." }
}]
```
Kind: server and GUI. The GUI half republishes the server's `notify` event through the hub in [native-ui](../native-ui). Restart the background service (`scripts/opencode-safe-restart.sh` in dev-files); the service outlives the app, so quitting alone does not reload it.

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

## Credits
- Claude Code (Anthropic): the "usage limit reached" message text the detector matches. Knowledge only; no code was taken.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Tests use a fake host, clock and fetch. Design notes: [DESIGN.md](DESIGN.md).
