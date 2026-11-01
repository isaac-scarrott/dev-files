# usage-resume

OpenCode 2.2.5 server + GUI plugin. When a session stops because Claude usage was reached, it computes when any of your
cliproxy Claude accounts has the limiting window free again, waits, re-checks real usage, and resumes the session with
a short queued prompt. See `DESIGN.md` for the evidence and every default.

**Auto-resume is off by default.** A session is resumed only if its toggle is on: the refresh-arrow button in the
composer, right after the model picker. Settings > Preferences > "Auto-resume after usage limit" sets whether NEW
sessions start with the toggle on (off by default); a session's own toggle always wins. Subagent sessions are never
resumed.

**If a limit never made work stop:** this plugin only reacts to a run that fails with a usage-limit error. An account
with extra usage on keeps serving past 100% and bills the overage, so no error occurs and there is nothing to resume.
It does not enable or pay for extra usage. Check `usage-resume.log` (below) for `run failed` lines.

## Logs and samples

`~/.local/share/opencode/usage-resume/usage-resume.log` (or `$XDG_DATA_HOME/opencode/usage-resume/`; option
`sampleDir`) records every failed run, detected limit, schedule, resume and skip with its reason, tokens redacted.
`limit-error.json` is the first real limit error seen; `unmatched-limit-like-error.json` is the first error that read
like a limit but did not match the detector. Both are kept for future detector tests.

## Setup

Register by absolute path in `~/.config/opencode/opencode.json` (not done for you):

```json
{
  "plugins": [
    {
      "package": "/path/to/dev-files/apps/opencode-plugins/usage-resume",
      "options": { "prompt": "Continue." }
    }
  ]
}
```

Needs the Claude Agent provider routed through cliproxy (`claude-proxy` plugin) and the accounts in
`~/.cli-proxy-api/claude-*.json`. Restart the app after registering.

## Options

All optional. Durations are seconds.

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

The plugin only reads the auth files and calls `api.anthropic.com/api/oauth/usage` at the notch app's pace (5 minute
floor per account, 30 minute backoff cap). It never enables or spends extra usage.

## Develop

```sh
npm_config_registry=https://registry.npmjs.org pnpm install
pnpm typecheck
pnpm test
pnpm build   # tsc (server) then vite (GUI); emits dist/, which is committed
```

Parity against the host (composer toggle vs the attach button, settings row vs a native switch row): `parity.spec.mjs`.
Tests use a fake host, clock and fetch, plus a driver that runs the real `setup` against a fake context with an event bus. A real limit cannot be provoked in the harness, so the limit message is the
one the 2.2.5 Claude Agent provider builds, fed to `Resumer.onFailed`.
