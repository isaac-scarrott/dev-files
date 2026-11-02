# claude-proxy: design

Server plugin for OpenCode Desktop 2.2.5 with no UI. What it does for the user is in [README.md](README.md).

## Decisions

- **Why a plugin**: the Claude Agent provider launches `claude --setting-sources=`, so the CLI never reads `~/.claude/settings.json`, and its proxy settings would be ignored. Nor can `apiKeyHelper` work in the CLI: every spawn passes `--settings {"disableAllHooks":true}` and no setting source loads (only root-owned managed settings would).
- **Token out of provider settings**: provider settings merge into every model's `settings` and are returned verbatim by `GET /api/model` and `GET /api/provider/claude-agent`; there is no redaction for them. An earlier version put `authToken` there, so any holder of the service password (GUI windows, GUI plugins, other clients) could read the proxy key. Now only `baseURL` (not secret, and the status probe needs it) is a provider setting.
- **Token via the `sdk` hook**: the built-in claude-agent plugin is in `internal.pre`, so its `sdk` hook runs before ours. It builds `new Model(id, deps, connection)`, where `connection` is the env map (`ANTHROPIC_*`) the spawn adds to the server env. Our `ctx.aisdk.hook("sdk", ..., { providerID })` wraps `evt.sdk.languageModel` and defines `ANTHROPIC_AUTH_TOKEN` on that `connection` as an enumerable **getter**. The model and its SDK are cached for as long as the settings are unchanged, so a plain assignment would freeze the first token; the getter runs when the spawn env is built (`{...connection}`).
- **Not `process.env`**: an earlier version copied the values into `process.env`, which the shell tool and stdio MCP servers inherit (verified: both listed `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`). A scrub in blindfold's `ctx.shell.hook("create.before")` would not have covered MCP children, whose config `environment` can only add or set values, not unset them, and blindfold is vendored.
- **Token source**: `env.ANTHROPIC_AUTH_TOKEN` from `settings.json` if present (backward compatible), else the `apiKeyHelper` command through `/bin/sh -c` (10 s timeout, `execFileSync`). The Keychain item `cliproxy-api-key` holds the key; `security add-generic-password -a "$USER" -s cliproxy-api-key -w '<key>' -U` sets or rotates it.
- **Per-request with a 30 s cache**: the getter calls the source, which re-reads `settings.json` and re-runs the helper at most once per 30 s. It is synchronous because the getter is: a hung helper blocks the service for up to 10 s, at most once per window (a failed read is not retried before the next window). A rotation applies on the first spawn after the window.
- **Failure keeps the last good value**: a failing, timing-out or silent helper (or an unreadable `settings.json`) leaves the previous token in use and logs the problem by name and exit code once until it clears. Values are never logged. With no token at all, the getter falls back to the server env's `ANTHROPIC_AUTH_TOKEN`, as if the plugin were absent.
- **Shape guard**: the plugin relies on two internals (`evt.sdk.languageModel` and a writable `connection` object on the model). If either is missing it warns by name (`claude-agent sdk has no languageModel`, `claude-agent model has no writable connection env`), applies no token, and leaves the provider working, so chats fail with an auth error from the proxy instead of leaking or crashing.
- **Which settings**: only the base URL, read once at `setup` (a change needs a service restart). A key that is absent is left out.

## Known gaps

- **Status probe has no token.** The login/model-list check (`ClaudeProvider.connection`) reads public provider info only, so it runs with the base URL and without the token. If `claude auth login` is not done, Settings may show "not logged in" although chats work. Verify: send a message and check the proxy's access log; and `GET /api/model` should list only `baseURL` under `settings` for `claude-agent`. If this becomes a problem, a localhost forwarder (public base URL = local port, public token = per-boot nonce, real token injected upstream) fixes the probe at the cost of a local capability leak; see `.git/orchestration/token-exposure.md`.
- **Internal shape.** A future OpenCode that changes the `sdk` hook or the model's `connection` breaks the token (warned by name, see above).
- **Still readable by the user's own processes** (`~/.claude/settings.json`, Keychain, `ps eww` of the `claude` child), and `GET /api/credential` returns stored credentials in plaintext to service-password holders (unrelated to this plugin; not reported upstream by decision).
- A changed base URL needs a service restart.

## Verified (OpenCode 2.2.5, private `opencode-cli serve`, isolated XDG roots and HOME, dummy values, names only)

A stdio MCP server wrote its env names to a file, `POST /api/shell` listed the shell child's env, and `OPENCODE_CLAUDE_PATH` pointed the Claude provider at a script that answered the SDK `initialize` request and recorded its env names and whether the values matched the dummy.

| Build | `/api/model`, `/api/provider*`, `/api/integration*`, `/api/credential` | shell tool child | MCP stdio child | status probe spawn | chat spawns |
| --- | --- | --- | --- | --- | --- |
| no plugin | no settings | none | none | none | none |
| previous (env copy) | n/a | token, base URL | token, base URL | n/a | token, base URL |
| previous (provider `authToken` setting) | **token** | none | none | token, base URL | token, base URL |
| this version (helper) | `settings` is `{baseURL}` only; no token anywhere | none | none | base URL, no token | token, base URL, values match |

Rotation (helper reading a file): rotated inside the 30 s window, the next chat still used the old value; after the window, the next chat used the new one. After the helper started failing, the following chat kept the last good value and one warning (`apiKeyHelper failed (exit 1)`) was logged without a value.

Not verified: a real `claude` process through a real proxy (the probe's "not logged in" display in particular); behavior on OpenCode versions other than 2.2.5.
