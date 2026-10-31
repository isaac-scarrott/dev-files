# OpenCode Desktop plugins

Local plugins for OpenCode Desktop 2.2.5. Global registration lives in
`../../.config/opencode/opencode.json`.

| Package | Purpose | Verification |
| --- | --- | --- |
| `sidebar-repos` | Two-line repo · branch and session title; attention icons; removes sidebar fades | Typecheck, 13 tests, build |
| `message-jump` | Animated jump to the nearest mounted user message above the viewport | Typecheck, 4 tests, build; live UI not verified |
| `sidepanel` | Original pinned counter-panel experiment | Build only; no typecheck/test scripts |

Run in each package with scripts:

```sh
npm_config_registry=https://registry.npmjs.org pnpm install --frozen-lockfile
npm_config_registry=https://registry.npmjs.org pnpm typecheck
npm_config_registry=https://registry.npmjs.org pnpm test
npm_config_registry=https://registry.npmjs.org pnpm build
```

`sidepanel` preserves its original manifest and Bun lockfile; a pnpm lockfile and
public-registry config were added for reproducible installs. Rebuild with
`pnpm exec vite build`; it has no typecheck/test scripts.

Built `dist/gui-experimental.cjs` files are tracked so registration works on a new
checkout before installing development dependencies. Rebuild and commit them with source.

Develop with the `opencode-gui-plugins` skill in `../../.claude/skills/`.
