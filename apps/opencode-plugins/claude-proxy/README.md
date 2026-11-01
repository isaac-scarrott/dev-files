# Claude proxy

Makes the Claude Agent provider in OpenCode Desktop use the proxy set in `~/.claude/settings.json`.

## What it does
- At startup, reads `env.ANTHROPIC_BASE_URL` from `~/.claude/settings.json` and resolves the token: `env.ANTHROPIC_AUTH_TOKEN` if the file has one, otherwise the output of the `apiKeyHelper` command (as Claude Code runs it, through `/bin/sh -c`, 10 s timeout, trimmed stdout).
- Hands both to the Claude Agent provider as its `baseURL` and `authToken` settings. The provider adds them to the environment of the `claude` process it spawns, so its requests go through your proxy.
- Does not write `process.env`. The shell tool and MCP servers the server spawns do not receive the token or the base URL (verified, see [DESIGN.md](DESIGN.md)), so blindfold's "commands that don't name a secret never get it" holds for it.

## Key in the Keychain
Keep the key out of `settings.json`: set `"apiKeyHelper"` to a command that prints it, for example `/path/to/scripts/cliproxy-key.sh`, which reads the macOS Keychain. Set or rotate the key with one command, then restart the service:
```sh
security add-generic-password -a "$USER" -s cliproxy-api-key -w '<key>' -U
```
The key is read once at plugin load, so a rotation takes effect at the next service restart.

## Context
The provider launches `claude` with `--setting-sources=`, so the CLI never reads `settings.json` itself and would talk to Anthropic directly. This is a server plugin with no UI. If the file is missing or is not valid JSON, or the helper fails, times out or prints nothing, it logs a warning (names and exit codes only, never a value) and leaves that setting out. [usage-resume](../usage-resume) expects the Claude provider to be routed through cliproxy this way.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/claude-proxy"]
```
Kind: server. Restart the background service (quit the app, then `opencode service restart`); the service outlives the app, so quitting alone does not reload it.

## Options
None.

## Development
No build or typecheck: `server.js` is loaded as is. `node --test` runs `server.test.js` against temp HOMEs. Design notes: [DESIGN.md](DESIGN.md).
