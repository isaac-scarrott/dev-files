# usage-resume

OpenCode 2.2.5 server plugin. When a session stops because Claude usage was reached, it computes when any of your
cliproxy Claude accounts has the limiting window free again, waits, re-checks real usage, and resumes the session with
a short queued prompt. See `DESIGN.md` for the evidence and every default.

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
| `includeChildren` | `false` | also resume subagent sessions |
| `authDir` | `~/.cli-proxy-api` | cliproxy auth files (read-only) |
| `snapshotPath` | notch app cache | its readings are reused to avoid double polling; `""` disables |

The plugin only reads the auth files and calls `api.anthropic.com/api/oauth/usage` at the notch app's pace (5 minute
floor per account, 30 minute backoff cap). It never enables or spends extra usage.

## Develop

```sh
npm_config_registry=https://registry.npmjs.org pnpm install
pnpm typecheck
pnpm test
pnpm build   # emits dist/, which is committed
```

Tests use a fake host, clock and fetch. A real limit cannot be provoked in the harness, so the limit message is the
one the 2.2.5 Claude Agent provider builds, fed to `Resumer.onFailed`.
