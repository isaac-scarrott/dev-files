# claude-proxy: design

Server plugin for OpenCode Desktop 2.2.5 with no UI. What it does for the user is in [README.md](README.md).

## Decisions

- **Why a plugin**: the Claude Agent provider launches `claude --setting-sources=`, so the CLI never reads `~/.claude/settings.json`, and the proxy settings in its `env` block would be ignored. The provider's child inherits the server process's environment, so the plugin copies the settings there.
- **Which keys**: only `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN`. A key that is absent or empty in the file is left as the process has it.
- **When**: once in `setup`, so a change to `settings.json` takes effect at the next plugin load (a service restart or a changed plugin revision), not live.
- **No `exports` entry**: the package loads through the host's `server.js` fallback (a same-layout probe loaded with `features.server: true` in 2.2.5). Adding `"exports": { ".": "./server.js" }` would make this explicit.

## Known gaps

- **Token exposure (not verified)**: `ANTHROPIC_AUTH_TOKEN` lives in the server process environment for the whole service, so processes the server spawns (the shell tool, MCP stdio servers) may inherit it. That would defeat blindfold's promise that commands which do not name a secret never get it. Check inheritance before relying on blindfold for this token; passing the environment only to the provider spawn would avoid it if the provider accepts one.
- **Fails loud, not soft**: `setup` throws if `~/.claude/settings.json` is missing or not valid JSON. The plugin fails and the Claude Agent then talks to Anthropic directly, with no toast.
- **Stale keys**: a key removed from `settings.json` stays in `process.env` until the service restarts.
- No tests.

## Performance

None: runs once at startup, reads one small file.
