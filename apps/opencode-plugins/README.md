# OpenCode Desktop plugins

Local plugins for OpenCode Desktop 2.2.5. Global registration lives in
`../../.config/opencode/opencode.json`, which `~/.config/opencode/opencode.json` symlinks to. The committed version
of that file still lists the deleted `sidepanel`, `sidebar-repos` and a non-existent `message-jump`; the set in use
is only in the working copy until it is committed. Register a plugin by absolute path as its README shows.

Parts that run in the background service (server plugins, a plugin's first load of a GUI export) need the service
restarted, not just the app: quit the app, then `opencode service restart`. Cmd+R reloads GUI parts.

| Package | What it does | Kind |
| --- | --- | --- |
| [`blindfold`](blindfold) | Fork of vimtor/opencode-blindfold 0.5.0: agents use a secret, or a whole login, without seeing it; one inline card in the chat asks for several fields at once, or offers a login from a password manager (Allow, Always allow, Deny; account choice; unlock in the card) and fills it into a page without the agent holding it; Settings, Blindfold lists and revokes saved rules | server, TUI, GUI |
| [`blindfold-providers`](blindfold-providers) | 1Password (service account, no app dialog) and Bitwarden (API key + master password) as named accounts behind blindfold's card: in-memory sessions that lock when idle, origin fences, no secret in any command line; `node check.mjs` tests each account with the real CLI | server |
| [`cache-warning`](cache-warning) | Grey tray above the composer when the next message will re-read the conversation at full price: prompt cache expired, model changed, after a compaction; the cache window (5m or 1h) is read from Claude Code's transcript | GUI + server |
| [`claude-proxy`](claude-proxy) | Routes the Claude Agent provider through the proxy in `~/.claude/settings.json` | server |
| [`model-picker`](model-picker) | Search models dialog: no Recent section, providers A to Z, models by output price | GUI |
| [`monitor`](monitor) | `monitor`, `list_monitors`, `stop_monitor`: run a command in the background and wake the session with its output lines (batched, escaped, untrusted-data trailer); optional re-arm; wakes show as a grey row with a Stop button, and a "N monitors" chip beside the composer lists what runs for the session (Stop on each row) | server, GUI |
| [`native-ui`](native-ui) | Components copied from the app's own markup; `snooze-archive`, `orchestrator-tools`, `monitor` and `scheduler` import it; the shared injected-message row and the composer chip (a `ComposerPill` that collapses in and out, with its popover rows); the alerts hub contract (`notify-contract.ts`) | library |
| [`no-project`](no-project) | "No project" row in the project picker and `/no-project`: a draft in its own scratch folder, swept when unused | GUI + server |
| [`notifications`](notifications) | Settings > Notifications (plugins), one toast system and tab marks for what finishes, fails or waits for you: the app's own run done / failed / question events plus notifications published by `scheduler` and `monitor` (any plugin can publish through the hub in `native-ui`); Open button, focus rule, burst collapse, per-source mute; **Go to next notification** (⌘I) with a titlebar count; system notification and sound stay the app's | GUI |
| [`orchestrator-tools`](orchestrator-tools) | `orchestrate_*` tools: create, delegate to, message (`<cross-session-message>` wrapper, `list_peers`), wait on, read and stop sessions; a peer's message shows as a grey row (publishes nothing to the hub: its wakes start a turn) | server, GUI |
| [`scheduler`](scheduler) | `schedule_task`, `list_schedules`, `cancel_schedule`: one-off, interval and cron prompts that wake a session (`<scheduled-task>` wrapper), kept across restarts and sleep; runs show as a grey row with a Cancel button, and a "N schedules" chip beside the composer lists what is scheduled for the session (Cancel on each row) | server, GUI |
| [`session-drag`](session-drag) | Drag a sidebar session row into the chat to attach a `@session:<id>` chip | GUI |
| [`sidebar-repos`](sidebar-repos) | Two-line sidebar rows (project name over title), permission and question icons, last-active time on idle rows | GUI |
| [`snooze-archive`](snooze-archive) | Snoozed and Archived sidebar groups (paged, lazy Archived, whole-sidebar scroll, upward expand), Snooze and Archive in every session menu; a woken session shows a clock (the shared tab mark), published as info to the hub | GUI |
| [`timeline-rail`](timeline-rail) | Tick rail in the chat gutter for the newest 10 prompts, after t3-code's minimap: hover card, chevrons, keyboard, click to jump | GUI |
| [`toast-style`](toast-style) | Every toast in the app in one quiet card: the app's own font and motion restored (solid-sonner's stylesheet overrides them today), the glyph on the title row with full-width text and buttons, two-line description, contrast button and key hint on a waiting request, "+N more" chip, softer exit and reduced motion; no glyph colour; one selector file with a live markup probe | GUI |
| [`usage-resume`](usage-resume) | Waits for the earliest Claude account reset after a usage limit, re-checks usage, queues "Continue." once; a limit, a moved resume time and giving up are published to the hub (error / info / error) | server, GUI |
| [`visual-replies`](visual-replies) | `publish_html` tool: agent HTML pages render inline in a sandboxed iframe | GUI + server |

Each package has a README with what it does, how to install it, its options and its credits. Design notes are in `DESIGN.md` where a package has one.

Run in each package with scripts:

```sh
npm_config_registry=https://registry.npmjs.org pnpm install --frozen-lockfile
npm_config_registry=https://registry.npmjs.org pnpm typecheck
npm_config_registry=https://registry.npmjs.org pnpm test
npm_config_registry=https://registry.npmjs.org pnpm build
```

Built `dist/gui-experimental.cjs` files are tracked so registration works on a new
checkout before installing development dependencies. Rebuild and commit them with source.

Develop with the `opencode-gui-plugins` skill in `../../.claude/skills/`.

## Lint

`pnpm lint` (in this folder) enforces the core team's GUI plugin rules: no `createEffect`/`createRenderEffect`/`createComputed`, no module-level `let`/`var`/`Map`/`Set`/`WeakMap`/signal/store, no `@/`, `@opencode/app` or `@opencode/desktop` imports, and no hand-made `<style>` element (use `ctx.add(Style, css)`). Tests, `blindfold` and `dist` are skipped.

Today's violations are recorded per file in `lint-baseline.json`; the gate fails only when a file goes over its count. After fixing some, run `pnpm lint:update` to shrink the baseline (never grow it). The pre-commit hook runs it when `apps/opencode-plugins/*.ts(x)` is staged (~50ms). No dependencies: one Node script, `lint.mjs`.

## Smoke

`pnpm smoke` (in this folder) runs each plugin's `test/smoke.mjs` under a 30 s wall-clock limit and prints a table. Each smoke requires the plugin's **built** `dist/gui-experimental.cjs` the way the host does (the SDK's shared modules served to the bundle, a happy-dom window, an empty app as `ctx`), runs `setup` under a Solid root, and checks that it contributed to the expected registries, then runs its cleanup and `dispose` and checks that no timer, interval, frame, observer or document/window listener is left. Where a `dist/server.js` exists it must export a plugin definition. Build first (`pnpm build` in the plugin); a stale or missing bundle fails. Run one plugin with `pnpm smoke` inside it or `node smoke.mjs <name>`.

The harness is `test-utils/gui-smoke.mjs`; it has no dependencies of its own and takes Solid and happy-dom from the plugin's `node_modules`. Needed host members beyond the empty defaults go in the `host` option (see `usage-resume/test/smoke.mjs`). Not covered yet: `monitor`, `scheduler`, `native-ui` (a library) and the vendored `blindfold`; `claude-proxy` is server-only.

`test-utils/fake.ts` is `fake<T>(partial)`: a partial of a host type that is checked field by field against `T`, for unit-test fakes of `Context` and its parts.
