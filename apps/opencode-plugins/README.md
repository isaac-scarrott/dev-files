# OpenCode Desktop plugins

Local plugins for OpenCode Desktop 2.2.5. Global registration lives in
`../../.config/opencode/opencode.json`.

| Package | Purpose | Verification |
| --- | --- | --- |
| `sidebar-repos` | Two-line repo · branch and session title; attention icons; removes sidebar fades | Typecheck, 19 tests, build; live UI not verified |
| `timeline-rail` | Tick rail in the chat's left gutter, one tick per prompt, built to match t3-code's minimap: card on hover, chevrons, keyboard, click glides the prompt under the header; covers the newest 10 prompts and never requests history | Typecheck, 55 tests, build; verified live in the isolated app (50 / 300 / 5,000-prompt and realistic threads: appears at once, never grows, zero extra requests vs no plugin, card, jump, keyboard, chevrons, frames); touch, reduced motion, narrow gutter, subagent sessions unit-tested only |
| `snooze-archive` | Collapsible Snoozed/Archived sidebar groups; device-local timed snooze, native archive/restore; Snooze… + Archive beside every session Delete… menu (tab, header, Home row). Palette: Snooze session…, Archive session, Refresh archived sessions | Typecheck, 73 tests, build; verified live in the isolated app (tab, header and Home-row menus, presets, archive); calendar keyboard and DST UI not |
| `plugin-list` | Extensions → Plugins: lists server-only plugins and adds Desktop/Server/TUI/RPC chips to every row | Typecheck, 3 tests, build; live UI not verified |
| `claude-proxy` | Server plugin: routes the Claude Agent provider through the proxy in `~/.claude/settings.json` | Loads; env pass-through not verified |
| `blindfold` | Vendored vimtor/opencode-blindfold 0.5.0 (MIT, pinned in vendor.manifest): agents use secrets without seeing them; shell approval on | Typecheck, build, smoke; 21/24 tests (3 fail on local bun 1.2.4); audit in PROVENANCE.md; live UI not verified |
| `visual-replies` | `publish_html` tool; agent HTML pages render inline in the timeline in a sandboxed iframe (opaque origin, CSP), zoom/expand | Typecheck, 26 tests, build; auto-open of the collapsed Execute group verified live (collapse, scroll remount, session switch, reload, 2 pages) |
| `agents-panel` | Header icon button (right after the session-context button) opening one floating "Subagents · N running" popover for the routed session only (its own descendants and shells), whether or not the side panel is open; the chat never moves. Rows: description, elapsed, X to stop; clicking a row opens the child session in the current tab (the ancestor trail and "Main session" return, like the native rows), never as a sidebar tab. Command "Close subagent tabs" (and one automatic pass per window load) closes leftover child-session tabs except the viewed one; they stay in Recently closed. Off until chosen: Settings → Timeline → Background activity gains a fifth option, "Panel", which commits the native Hidden (no duplicate above the composer) and turns the header button on; picking Hidden/Left/Center/Right turns it off. Persisted per app | Typecheck, 21 tests, build; live-tested in the isolated desktop (option parity, select/keyboard/reload; running status mocked: no model call can make a subagent run) |
| `orchestrator-tools` | Server plugin: 7 `orchestrate_*` tools to create, read, message, wait on, interrupt and delegate to sessions (via Code Mode `execute`) | Typecheck, 18 tests, build; full live scenario on standalone 2.2.5 with a stub model |
| `usage-resume` | Server plugin: when a Claude usage limit stops a session, waits for the earliest account reset (all cliproxy accounts, 5-minute poll floor), re-checks usage, then queues "Continue." once; survives restart and sleep | Typecheck, 24 tests with fake host/clock; plugin load on 2.2.5; real limit never triggered |
| `model-picker` | Hides the "Recent" section of the Search models picker (every model stays under its provider) | Typecheck, 3 tests, build; not seen live: the test app has no Recent section |
| `no-project` | A "No project" row in the new-session project picker (and `/no-project`): draft in its own per-session scratch folder (`<data dir>/no-project/<uuid>/No project`, labelled "No project"); a server entry deletes folders of deleted, long-archived or abandoned sessions | Typecheck, 31 tests, build; folder creation and sweep checked against a private server |
| `session-drag` | Drag a sidebar session row (live tab or snooze-archive Snoozed/Archived row) sideways into the session panel to attach a "Session" chip the model reads as `@session:<id> ("title")`; the chip opens the session. Palette: Reference session… | Typecheck, 17 tests, build; verified live in the isolated app (drag, drop, Esc, sidebar drop no-op, native reorder intact, archived rows, palette, ghost style numbers vs host chip classes); reduced motion CSS-only |
| `sidepanel` | Original pinned counter-panel experiment | Build only; no typecheck/test scripts |

Timeline rail binds through each session's header slot, follows its active state,
and observes only that timeline's content and ancestor sizes, so cached inactive
timelines cannot leave a rail over another session. It hides under two prompts,
when the gutter is narrower than 44px (side panel open at modest widths) and below
768px. Unmounted prompts are reached by probing the virtualizer one viewport per
frame; see its `DESIGN.md`.

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
