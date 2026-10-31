# OpenCode Desktop plugins

Local plugins for OpenCode Desktop 2.2.5. Global registration lives in
`../../.config/opencode/opencode.json`.

| Package | Purpose | Verification |
| --- | --- | --- |
| `sidebar-repos` | Two-line repo · branch and session title; attention icons; removes sidebar fades | Typecheck, 19 tests, build; live UI not verified |
| `message-jump` | Animated jump to the nearest mounted user message above the viewport | Typecheck, 13 tests, build; live UI not verified |
| `snooze-archive` | Collapsible Snoozed/Archived sidebar groups; device-local timed snooze, native archive/restore. Palette: Snooze session…, Archive session, Refresh archived sessions | Typecheck, 32 tests, build; live UI not verified |
| `sidepanel` | Original pinned counter-panel experiment | Build only; no typecheck/test scripts |

Message jump binds through each session's header slot, follows its active state,
and observes only that timeline's content and ancestor sizes. Cached inactive
timelines cannot leave a pill over another session. The pill fits the timeline,
supports keyboard focus and reduced motion, and picks targets by visual position.
It remains a prototype: unmounted history needs a verified host navigation
integration; the 2.2.5 GUI SDK exposes no public timeline reveal method. Live checks
still needed: scroll/jump under virtualization, session switching, sidebar/pane
resizing, light/dark, reduced motion, plugin reload and sidebar spacing.

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
