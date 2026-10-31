# OpenCode Desktop plugins

Local plugins for OpenCode Desktop 2.2.5. Global registration lives in
`../../.config/opencode/opencode.json`.

| Package | Purpose | Verification |
| --- | --- | --- |
| `sidebar-repos` | Two-line repo · branch and session title; attention icons; removes sidebar fades | Typecheck, 19 tests, build; live UI not verified |
| `message-jump` | Header button + `message-jump.previous` command: glides to the previous user prompt, pages in unloaded history | Typecheck, 24 tests, build; verified live in the isolated app (reduced motion and palette unit-tested only) |
| `snooze-archive` | Collapsible Snoozed/Archived sidebar groups; device-local timed snooze, native archive/restore. Palette: Snooze session…, Archive session, Refresh archived sessions | Typecheck, 63 tests, build; verified live in the isolated app (menus, presets); calendar keyboard and DST UI not |
| `plugin-list` | Extensions → Plugins: lists server-only plugins and adds Desktop/Server/TUI/RPC chips to every row | Typecheck, 3 tests, build; live UI not verified |
| `claude-proxy` | Server plugin: routes the Claude Agent provider through the proxy in `~/.claude/settings.json` | Loads; env pass-through not verified |
| `blindfold` | Vendored vimtor/opencode-blindfold 0.5.0 (MIT, pinned in vendor.manifest): agents use secrets without seeing them; shell approval on | Typecheck, build, smoke; 21/24 tests (3 fail on local bun 1.2.4); audit in PROVENANCE.md; live UI not verified |
| `visual-replies` | `publish_html` tool; agent HTML pages render inline in the timeline in a sandboxed iframe (opaque origin, CSP), zoom/expand | Typecheck, 20 tests, build; live UI not verified |
| `agents-panel` | Header icon button (right after the session-context button) opening one floating "Subagents · N running" popover for the routed session only (its own descendants and shells), whether or not the side panel is open; the chat never moves. Rows: description, elapsed, X to stop; clicking a row opens the child session in the current tab (the ancestor trail and "Main session" return, like the native rows), never as a sidebar tab. Command "Close subagent tabs" (and one automatic pass per window load) closes leftover child-session tabs except the viewed one; they stay in Recently closed. Set Settings → Background activity to Hidden to avoid the duplicate above the composer | Typecheck, 14 tests, build; live-tested in the isolated desktop (running status mocked: no model call can make a subagent run) |
| `no-project` | Palette/`/no-project`: new session in a shared `~/Documents/No project` scratch folder, labelled "No project" | Typecheck, 8 tests, build; verified live in the isolated app (not a send) |
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
