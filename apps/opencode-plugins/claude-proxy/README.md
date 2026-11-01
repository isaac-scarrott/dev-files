# Claude proxy

Makes the Claude Agent provider in OpenCode Desktop use the proxy set in `~/.claude/settings.json`.

## What it does
- At startup, copies `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` from the `env` block of `~/.claude/settings.json` into the server's environment.
- The `claude` process the provider spawns inherits them, so its requests go through your proxy.

## Context
The provider launches `claude` with `--setting-sources=`, so the CLI never reads `settings.json` itself and would talk to Anthropic directly. This is a server plugin with no UI. It throws at startup if the file is missing or is not valid JSON. [usage-resume](../usage-resume) expects the Claude provider to be routed through cliproxy this way.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/claude-proxy"]
```
Kind: server. Restart the app.

## Options
None.

## Development
No build, typecheck or tests: `server.js` is loaded as is.
