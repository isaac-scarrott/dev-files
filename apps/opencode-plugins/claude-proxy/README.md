# Claude proxy

Makes the Claude Agent provider in OpenCode Desktop use the proxy set in `~/.claude/settings.json`.

## What it does
- At startup, reads `env.ANTHROPIC_BASE_URL` from `~/.claude/settings.json` and sets it as the Claude Agent provider's `baseURL` setting. A change to the base URL needs a service restart.
- The token is **not** a provider setting: provider settings are served by `GET /api/model` and `GET /api/provider/claude-agent` to anything holding the service password. The plugin keeps the token in its own memory and adds it to the environment of each `claude` process the provider spawns (`ANTHROPIC_AUTH_TOKEN`), so requests go through your proxy.
- The token is `env.ANTHROPIC_AUTH_TOKEN` from `settings.json` if present, otherwise the output of the `apiKeyHelper` command (as Claude Code runs it, through `/bin/sh -c`, 10 s timeout, trimmed stdout). It is re-read at spawn time with a 30 s cache, so a rotation applies without a restart. If a re-read fails, the last good value stays in use and the problem is logged by name (never the value).
- Does not write `process.env`. The shell tool and MCP servers the server spawns do not receive the token or the base URL (verified, see [DESIGN.md](DESIGN.md)), so blindfold's "commands that don't name a secret never get it" holds for it.

## Key in the Keychain
Keep the key out of `settings.json`: set `"apiKeyHelper"` to a command that prints it, for example `/path/to/scripts/cliproxy-key.sh`, which reads the macOS Keychain. Set or rotate the key with one command; the next `claude` spawn after the 30 s cache window uses it:
```sh
security add-generic-password -a "$USER" -s cliproxy-api-key -w '<key>' -U
```

## Known gap: login status
The status check that lists models and the account (the "probe") builds its environment from public provider settings only, so it runs with the base URL but without the token. Settings may show Claude Agent as "not logged in" unless you are also logged in with `claude auth login`; chats still use the token. To verify the token reaches chats, send a message and check the proxy's access log; to verify it is not exposed, `GET /api/model` with the service password and look for `settings` on the `claude-agent` models: only `baseURL` should be there.

## Context
The provider launches `claude` with `--setting-sources=`, so the CLI never reads `settings.json` itself and would talk to Anthropic directly. This is a server plugin with no UI. If the file is missing or is not valid JSON, or the helper fails, times out or prints nothing, it logs a warning (names and exit codes only, never a value, once until it clears) and leaves that setting out or keeps the last good token. If a future OpenCode changes the internal shape the plugin relies on, it logs which part and applies no token. [usage-resume](../usage-resume) expects the Claude provider to be routed through cliproxy this way.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/claude-proxy"]
```
Kind: server. Restart the background service (quit the app, then `opencode service restart`); the service outlives the app, so quitting alone does not reload it.

## Options
| Option | Default | Meaning |
| --- | --- | --- |
| `cacheTtl` | `1h` | Prompt-cache lifetime Claude Code requests for the main conversation: `1h` adds `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` to the Claude spawn env, `5m` leaves Claude Code's default. Behind a base URL Claude Code looks like API-key mode and would otherwise use 5 minutes; a direct subscription login gets 1 hour by default. Subagents and compaction stay on 5m. Verified through the proxy: 16,457 tokens written on the 1-hour tier instead of the 5-minute tier. A 1-hour write costs more than a 5-minute one (2x vs 1.25x API price); Max plan metering is unpublished, so compare limit use after a week and revert with `"cacheTtl": "5m"` if it costs more. |

Register with options: `{ "package": "/path/to/claude-proxy", "options": { "cacheTtl": "5m" } }`.
None.

## Development
No build or typecheck: `server.js` is loaded as is. `node --test` runs `server.test.js` against temp HOMEs. Design notes: [DESIGN.md](DESIGN.md).
