# Provenance

Forked from https://github.com/vimtor/opencode-plugins at commit 9d1e94769ae9b8636c9d58a734697124ff2787df
(`packages/opencode-blindfold` v0.5.0). License: MIT, copyright vimtor 2026; both copies are kept here: `LICENSE` (the
package's) and `LICENSE.root` (the repository's, identical).

This is a full fork, not a vendored copy: `vendor.manifest` has no blindfold lines, `scripts/vendor.sh` and the
pre-commit hook do not fetch it, and every file in this folder is ours to edit. It does not track upstream; take
upstream changes by reading its commits and porting what is wanted.

## What came from upstream

- `plugin/src/redact.ts`: the redactor, unchanged.
- `plugin/src/server.ts`: the settings and option parsing, 1Password reads, shell approval and environment injection, the
  hooks that redact results, errors, model context and provider requests, the prompt and ack timeouts. The tool and the
  request flow around them are rewritten (below).
- The `.opencode/plugins/blindfold` shims and the idea of the RPC (`requested`, `resolved`, `ack`, `submit`, `cancel`).
- The server tests (`test/server.test.ts`), ported from bun to `node:test` with a small `expect` shim (`test/expect.ts`).

## What is ours

- Multi-field `get({ fields })` with kinds, per-field store and replace, and the object result (`fields.ts`, `server.ts`).
- The inline request card (`gui.tsx`, `card.tsx`, `model.ts`, `anchor.ts`, `style.css`); upstream's GUI was a modal prompt
  dialog.
- `submit` carries `values` (an object); `requested` carries `fields`, `callID` and `messageID`; `resolved` carries a
  status; the new `list` method.
- Closing the request when the run is stopped, and a prompt queue per session.
- One prompt per field in the TUI (`tui.ts`), with no success toast.
- `package.json` (private, pnpm, `@opencode/plugin` 2.2.5), `tsconfig*.json`, `vite.config.ts`, `.npmrc`,
  `pnpm-workspace.yaml`, the harness, the parity spec.

## Registration

By absolute path in `~/.config/opencode/opencode.json` (server and Desktop) and `~/.config/opencode/cli.json` (TUI). The
plugin id is still `blindfold` and the options are unchanged, so an existing registration keeps working. The TUI part
(`tui.js`, `plugin/src/tui.ts`) is built and tracked; the user's `cli.json` has no `plugins` entry, so it is unused there.

## Notes

- Blindfold only redacts secrets it manages. [claude-proxy](../claude-proxy) hands `ANTHROPIC_AUTH_TOKEN` to the Claude
  provider as a provider setting and never writes it to the server's `process.env`, so the shell tool and MCP servers do
  not inherit it (verified on 2.2.5; see its DESIGN). A token the service is launched with is outside both plugins.
