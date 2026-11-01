# OpenCode Desktop plugins

Local plugins for OpenCode Desktop 2.2.5. Global registration lives in
`../../.config/opencode/opencode.json`.

| Package | What it does | Kind |
| --- | --- | --- |
| [`agents-panel`](agents-panel) | Header button listing running subagents and shells: a floating window beside the chat when the sidebar is closed, a popover when open. Opt in with Settings → Timeline → Background activity → Panel | GUI |
| [`blindfold`](blindfold) | Vendored vimtor/opencode-blindfold 0.5.0: agents use secrets without seeing them | server, TUI, GUI |
| [`claude-proxy`](claude-proxy) | Routes the Claude Agent provider through the proxy in `~/.claude/settings.json` | server |
| [`model-picker`](model-picker) | Search models dialog: no Recent section, providers A to Z, models by output price | GUI |
| [`monitor`](monitor) | `monitor`, `list_monitors`, `stop_monitor`: run a command in the background and wake the session with its output lines (batched, escaped, untrusted-data trailer); optional re-arm | server |
| [`native-ui`](native-ui) | Components copied from the app's own markup, imported by the other plugins | library |
| [`no-project`](no-project) | "No project" row in the project picker and `/no-project`: a draft in its own scratch folder, swept when unused | GUI + server |
| [`orchestrator-tools`](orchestrator-tools) | `orchestrate_*` tools: create, delegate to, message (`<cross-session-message>` wrapper, `list_peers`), wait on, read and stop sessions | server |
| [`session-drag`](session-drag) | Drag a sidebar session row into the chat to attach a `@session:<id>` chip | GUI |
| [`scheduler`](scheduler) | `schedule_task`, `list_schedules`, `cancel_schedule`: one-off, interval and cron prompts that wake a session (`<scheduled-task>` wrapper), kept across restarts and sleep | server |
| [`sidebar-repos`](sidebar-repos) | Two-line sidebar rows (project name over title), permission and question icons, last-active time on idle rows | GUI |
| [`sidepanel`](sidepanel) | Original pinned counter-panel experiment | GUI |
| [`snooze-archive`](snooze-archive) | Snoozed and Archived sidebar groups (paged, lazy Archived, whole-sidebar scroll, upward expand), Snooze and Archive in every session menu | GUI |
| [`timeline-rail`](timeline-rail) | Tick rail in the chat gutter for the newest 10 prompts, after t3-code's minimap: hover card, chevrons, keyboard, click to jump | GUI |
| [`usage-resume`](usage-resume) | Waits for the earliest Claude account reset after a usage limit, re-checks usage, queues "Continue." once | server |
| [`visual-replies`](visual-replies) | `publish_html` tool: agent HTML pages render inline in a sandboxed iframe | GUI + server |

Each package has a README with what it does, how to install it, its options and its credits. Design notes are in `DESIGN.md` where a package has one.

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
