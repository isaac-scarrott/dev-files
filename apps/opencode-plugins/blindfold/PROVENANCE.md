# Provenance

Copied from https://github.com/vimtor/opencode-plugins at commit 9d1e94769ae9b8636c9d58a734697124ff2787df
(`packages/opencode-blindfold` v0.5.0, root `LICENSE` also included at `LICENSE.root`).
License: MIT, copyright vimtor 2026.

LICENSE.root is the upstream root LICENSE (identical to the package LICENSE).

Upstream files are unchanged, except these local adaptations:
- `plugin/src/gui.ts`, `plugin/src/tui.ts`: the green "Secret NAME stored." success toast is dropped. A thing the user just did is silent when it succeeds (the dialog closing is the answer); the failure toast ("Could not send secret") stays. Done as a `| sed` transform on their `vendor.manifest` lines (`scripts/vendor.sh` pipes upstream through it), so a vendor run reproduces the change instead of overwriting it, and an upstream rewrite of that line makes the delete match nothing (the two tests that expect no toast then fail). `test/gui.test.ts` and `test/tui.test.ts` (not vendored) expect no toast.
- `package.json`: local (private, pnpm, `@opencode/plugin` 2.2.5, vite 7, no publish scripts). Upstream is `upstream.package.json`.
- `tsconfig.json`: extends the local `./tsconfig.base.json` (upstream root file, unchanged) instead of `../../tsconfig.base.json`. Upstream is `upstream.tsconfig.json`.
- `.npmrc`, `pnpm-workspace.yaml`: copied from sidebar-repos.
- `.opencode/plugins/blindfold/{package.json,server.ts,tui.ts}`: local shims, not from upstream and not in `vendor.manifest`. `server.ts` and `tui.ts` re-export `plugin/src/server.ts` and `plugin/src/tui.ts`, and `package.json` exposes them as `.` and `./tui`, so OpenCode can load this checkout as a project-local plugin from `.opencode/plugins/`. Registration by absolute path (below) does not use them. Keep them only if a project-local load is wanted.

## Using this copy

`README.upstream.md` is the upstream README, fetched by `vendor.manifest`, so edits to it are overwritten on the next vendor run. `README.md` is ours and carries the credit. Local notes live here.

- Kind: server, TUI and GUI in one package.
- Register this checkout by absolute path instead of the npm name the README shows: in `~/.config/opencode/opencode.json` (server and Desktop) and `~/.config/opencode/cli.json` (TUI). Restart the background service (quit the app, then `opencode service restart`); GUI plugins reload with Cmd+R.
- Credit: vimtor/opencode-blindfold (MIT), the whole plugin.

## Local configuration notes

- Our `~/.config/opencode/opencode.json` entry passes `shell: { enabled: true, approve: true }` and `codemode: { enabled: true }`. Those are upstream's defaults (its README: "The values shown are the defaults"), so the options can be dropped without changing behaviour and there is less to drift when upstream changes a default. Not changed here: the config is the user's.
- Desktop only here. Upstream's README says to register in `cli.json` as well for the TUI; `~/.config/opencode/cli.json` has no `plugins` entry, so the TUI part (`tui.js`, `plugin/src/tui.ts`) is built and tracked but unused.
- Blindfold only redacts secrets it manages. [claude-proxy](../claude-proxy) hands `ANTHROPIC_AUTH_TOKEN` to the Claude provider as a provider setting and never writes it to the server's `process.env`, so the shell tool and MCP servers do not inherit it (verified on 2.2.5; see its DESIGN). A token the service is launched with is outside both plugins.
