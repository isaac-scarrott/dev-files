# Provenance

Copied from https://github.com/vimtor/opencode-plugins at commit 9d1e94769ae9b8636c9d58a734697124ff2787df
(`packages/opencode-blindfold` v0.5.0, root `LICENSE` also included at `LICENSE.root`).
License: MIT, copyright vimtor 2026.

LICENSE.root is the upstream root LICENSE (identical to the package LICENSE).

Upstream files are unchanged, except these local adaptations:
- `package.json`: local (private, pnpm, `@opencode/plugin` 2.2.5, vite 7, no publish scripts). Upstream is `upstream.package.json`.
- `tsconfig.json`: extends the local `./tsconfig.base.json` (upstream root file, unchanged) instead of `../../tsconfig.base.json`. Upstream is `upstream.tsconfig.json`.
- `.npmrc`, `pnpm-workspace.yaml`: copied from sidebar-repos.

## Using this copy

`README.upstream.md` is the upstream README, fetched by `vendor.manifest`, so edits to it are overwritten on the next vendor run. `README.md` is ours and carries the credit. Local notes live here.

- Kind: server, TUI and GUI in one package.
- Register this checkout by absolute path instead of the npm name the README shows: in `~/.config/opencode/opencode.json` (server and Desktop) and `~/.config/opencode/cli.json` (TUI). Restart the app; GUI plugins reload with Cmd+R.
- Credit: vimtor/opencode-blindfold (MIT), the whole plugin.
