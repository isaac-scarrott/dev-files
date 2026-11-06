# surge-guard

Refuses a message with an error when something wakes too many idle sessions at once.

A session idle for over an hour has lost its prompt cache, so waking it re-sends its whole context uncached. On
2026-11-05 one session messaged 52 idle sessions in two seconds: about 9M tokens in 90 seconds, and a 5-hour usage
window empty about a minute after it reset. surge-guard stops that kind of fan-out at the source.

## Rule

- A message **wakes a cold session** when the session had no activity in the last 60 minutes.
- Once `limit` cold sessions have been woken in the last 60 seconds, the next message to a cold session is refused:
  the `prompt` hook throws, the message is not stored, and whoever sent it gets the error. `orchestrate.send_message`,
  the scheduler and HTTP callers all see it as a failed call.
- Messages you type in the app (they carry `metadata.displayText`) are never refused. Neither is a message to a session
  that was active in the last hour, so a sender still gets its replies.
- `limit` = max(`floor`, `multiplier` × p99 of cold wakes per minute over the last 14 days). It's read from
  `opencode.db` at start and every hour. With today's history that's 10: normal minutes peak at 6, and the two
  incidents were 40 and 38.

Refusals are logged to `$XDG_DATA_HOME/opencode/surge-guard/refused.jsonl`. Create
`$XDG_CONFIG_HOME/opencode/surge-guard.off` to switch it off without a restart.

The guard fails open: an internal error or an unreadable database admits the message and keeps the last limit.

## Install

```json
"plugins": ["/Users/isaac/git/dev-files/apps/opencode-plugins/surge-guard"]
```

Options (all optional): `limit` (a fixed number, which turns learning off), `floor` (default 8), `multiplier`
(default 2).

It's a server plugin, so after registering, restart the service with `scripts/opencode-safe-restart.sh`.

## Test

`node --test` covers the rule. To test end to end, run it on a private harness (`opencode-gui-plugins` skill,
`desktop-harness.sh`) and send more than `limit` prompts with non-typed metadata to fresh sessions at once: the extra
ones return HTTP 500 and land in `refused.jsonl`.
