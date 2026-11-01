# claude-proxy: design

Server plugin for OpenCode Desktop 2.2.5 with no UI. What it does for the user is in [README.md](README.md).

## Decisions

- **Why a plugin**: the Claude Agent provider launches `claude --setting-sources=`, so the CLI never reads `~/.claude/settings.json`, and its proxy settings would be ignored.
- **Provider settings, not `process.env`**: the host builds the `claude` spawn env as the server env, then the provider's `baseURL`/`apiKey`/`authToken` settings mapped to `ANTHROPIC_BASE_URL`/`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`. The plugin edits those settings through `ctx.provider.transform` and `editor.update("claude-agent", ...)`. An earlier version copied the values into `process.env`, which the shell tool and stdio MCP servers inherit (verified: both listed `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`). A scrub in blindfold's `ctx.shell.hook("create.before")` would not have covered MCP children, whose config `environment` can only add or set values, not unset them, and blindfold is vendored.
- **Token source**: `env.ANTHROPIC_AUTH_TOKEN` from `settings.json` if present (backward compatible), else the `apiKeyHelper` command, run once in `setup` through `/bin/sh -c` with a 10 s timeout. The Keychain item `cliproxy-api-key` holds the key; `security add-generic-password -a "$USER" -s cliproxy-api-key -w '<key>' -U` sets or rotates it. Warnings carry names and exit codes only; stderr and stdout of the helper are never logged.
- **Which keys**: only the base URL and the token. A key that is absent or empty is left out, so the provider's own settings and the server env apply.
- **When**: resolved once in `setup`, applied on every provider transform (reloads included), so a change to `settings.json` or the Keychain takes effect at the next plugin load (a service restart or a changed plugin revision).

## Verified (OpenCode 2.2.5, private `opencode-cli serve`, isolated XDG roots and HOME, dummy values, names only)

A fake OpenAI-compatible model drove the shell tool, a stdio MCP server wrote its env names to a file, and `OPENCODE_CLAUDE_PATH` pointed the Claude provider at a script that recorded its env names and whether the values matched.

| Plugin | shell tool child | MCP stdio child | Claude provider spawn |
| --- | --- | --- | --- |
| none | none | none | none |
| previous (env copy) | token, base URL | token, base URL | token, base URL, values match |
| this version, literal `env` token | none | none | token, base URL, values match |
| this version, `apiKeyHelper` | none | none | token, base URL, values match |

Not verified: a real `claude` process through a real proxy. If the service itself is launched with these variables in its environment (not by this plugin), children still inherit them; this plugin cannot remove them.

## Known gaps

- A rotated key needs a service restart.
