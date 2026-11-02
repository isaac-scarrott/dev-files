# Cache warning

A grey tray, the composer's width, above the composer says when your next message will re-read the whole conversation at full price: after the prompt cache has expired and after you switch model.

> **Credit:** the tray is [OpenCode](https://github.com/anomalyco/opencode)'s (MIT) own `data-dock-surface="tray"` surface from its composer docks, and it opens and closes on the same spring as the queue panel (2.2.5). The cache lifetime comes from Anthropic's [prompt caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): 5 minutes by default, refreshed on every use.

![The tray above the composer, light theme](media/tray-light.png)
![The tray above the composer, dark theme](media/tray-dark.png)

## What it does
- Cache expired: "Cache expired · next message re-reads ~180k tokens". The count is the size of the last measured context, written the way the context ring writes it.
- Model or variant changed in the composer: "Cache reset · model changed · next message re-reads ~180k tokens".
- Nothing while the cache is warm, nothing once you send, nothing in small contexts (under 20,000 tokens), nothing in a subagent's session, nothing when the provider never reports cache use.
- No icon, no buttons, no sound, not focusable. It slides out from under the composer and back, like the host's own docks, and never moves the composer.

## Context
OpenCode has no slot above the composer. `ComposerPill` is a focusable capsule in the pill row, so the tray goes into the composer lane the app's own pills float in (a DOM injection, see `DESIGN.md`). It is exactly the composer's width, text aligned with the composer's own, and the app's pills sit on the line above it.

The cache is counted from when the last request started, not when its reply ended. The warning is a prediction, not a measurement. It assumes the provider's cache lives as long as the session's own tier (below), else `cacheTtlMinutes`, and it cannot see account switches, proxies that rewrite cache headers, or a provider that evicts early. A tray that shows is a probable full re-read; no tray is not a promise of a cache hit.

## Data-driven cache window
OpenCode's message API only reports cache read and write counts, not which tier (5 minutes or 1 hour) Anthropic used. Claude Code's own transcript does: `~/.claude/projects/<cwd with / and . as ->/<native session id>.jsonl` has, per request, `usage.cache_creation.ephemeral_1h_input_tokens` and `ephemeral_5m_input_tokens`. The server half of the plugin reads the tail of that file (at most the last 256 KB, from the end) and reports the tier of the newest request that wrote cache: 1h if it wrote to the 1 hour tier, else 5m. A request served wholly from cache writes nothing and names no tier, so the last known tier carries forward. The tray text does not change; only when it appears does.

- The GUI asks once per new measured step, never on a timer. The answer belongs to that step: when a newer step arrives it is not used until its own answer is in, so an old tier cannot outlive a newer write that shows another.
- A tier logged more than 65 minutes before the step is ignored. With no answer (no server half, not a Claude Code session, no transcript, a write beyond the tail) `cacheTtlMinutes` applies.
- Privacy: the file is read on the machine that runs OpenCode, only under `~/.claude/projects` (the session id must be a plain id, and the resolved path must stay inside), and only two numbers leave the server: the tier and a timestamp. No transcript text, tool output or token counts are returned or stored. Results are remembered per file while its size and mtime are unchanged.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/cache-warning"]
```
Kind: GUI (`gui-experimental`) plus a small server half that reads the transcript tier. Restart the background service (`opencode service restart`) for the first load of the server half or a GUI export, and for an option change. Cmd+R for GUI. Without the server half loaded the tray still works, on `cacheTtlMinutes`.

## Options
| Option | Default | Meaning |
| --- | --- | --- |
| `cacheTtlMinutes` | `5` | Minutes the provider keeps a cache entry after its last use, when the session's tier is not known from its transcript. |
| `minTokens` | `20000` | Contexts smaller than this never warn. |

```json
{ "package": "/path/to/apps/opencode-plugins/cache-warning", "options": { "cacheTtlMinutes": 5, "minTokens": 20000 } }
```

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked, server and GUI). Design notes: [DESIGN.md](DESIGN.md). `test/seed-cache.mjs` seeds one session per state into a throwaway harness; `parity.spec.mjs` compares the tray's surface with the host's.
