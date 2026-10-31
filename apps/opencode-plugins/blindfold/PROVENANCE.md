# Provenance

Copied from https://github.com/vimtor/opencode-plugins at commit 9d1e94769ae9b8636c9d58a734697124ff2787df
(`packages/opencode-blindfold` v0.5.0, root `LICENSE` also included at `LICENSE.root`).
License: MIT, copyright vimtor 2026.

LICENSE.root is the upstream root LICENSE (identical to the package LICENSE).

Upstream files are unchanged, except these local adaptations:
- `package.json`: local (private, pnpm, `@opencode/plugin` 2.2.5, vite 7, no publish scripts). Upstream is `upstream.package.json`.
- `tsconfig.json`: extends the local `./tsconfig.base.json` (upstream root file, unchanged) instead of `../../tsconfig.base.json`. Upstream is `upstream.tsconfig.json`.
- `.npmrc`, `pnpm-workspace.yaml`: copied from sidebar-repos.
