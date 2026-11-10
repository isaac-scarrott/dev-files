# sidebar-repos: design

GUI plugin for OpenCode Desktop 2.2.5 that changes the Side tabs rows: the project name above the title, a warning or help icon for a pending permission or question, and the time of the last activity on idle rows. User-facing behaviour is in [README.md](README.md).

## Decisions

Reason for each DOM hook, against the "no extension point" list in [host-architecture.md §8](../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary). The CSS goes through `ctx.add(Style, …)`, the data through `ctx.tabs`, `ctx.sessions` and each server's `data`, and the icons through `ctx.ui.Icon`; everything below is DOM because tab rows have no extension point.

- **Sibling badge before the title** (`[data-sidebar-repo]`): the host has no slot for a row's label. A sibling is injected and removed on cleanup; the title node is never rewritten, so rename keeps working. Grid rules are scoped with `:has(> [data-sidebar-repo])` so rows without a badge are untouched.
- **Status icons** (`[data-sidebar-status-icon]`): the host draws one mark for "attention". The plugin hides that mark on a row with `data-sidebar-attention` and mounts the app's own catalog icon (`warning` for a permission, `help` for a question) with `ctx.ui.Icon`, rendered under the plugin's owner. Unread stays the blue dot and busy the ring. Errors are not marked, as in the host.
- **Last-activity time** (`[data-sidebar-time]`): no API exposes a row's end slot. The time is placed where the status mark would be and hidden under the row's hover and focus affordances. It is shown only on rows without an indicator. Other plugins hand a time over with `data-sidebar-active-at="<epoch ms>"` (snooze-archive does for Archived rows); this plugin stamps the attribute on live rows from the message store.
- **Global rules**, applied wherever the plugin is loaded: `[data-action='vertical-tabs-home']` is hidden (Home has a keybind), and the `mask-image` on the scroll region and the link is overridden with `none !important`. The host fades the whole link edge, which also masks the status mark; one mask on the link replaces it, with a ramp that stops short of the mark or time (the shape of the host's own mask, 16px ramp).
- **Middle truncation** with a canvas `measureText` in the badge's computed font keeps the repo head and the branch tail; an end-only CSS ellipsis loses the tail. The full label stays in `title`.
- **Not animated**, like the host's marks and times.
- **Observer scope**: the sidebar's tab region only. Rows change nowhere else, and an observer on the document element ran `refresh()` for every node a streaming reply added. There is no extension point for tab rows to replace it.
- **Only the vertical layout** (`[data-orientation='vertical']`) is changed.

## How it works

- `names`, `attention` and `activity` are maps from tab key to a value, rebuilt by effects over `ctx.tabs.list()` and each session's store. Each effect then calls `refresh()`, which coalesces into one rAF that stamps times, writes badges, renders times and drops disposed icons.
- Message history is fetched once per open session (`messagesRequested`); permission and form lists are synced once per session.
- A `MutationObserver` on `[data-slot='vertical-tabs']` (attribute filter `data-tab-key`, `data-orientation`, `data-status`, plus child changes outside the plugin's own nodes) triggers `refresh()` when the host re-renders rows. A `ResizeObserver` per vertical row re-measures the badge.
- One ticker updates the ages while the window is visible and wakes on focus and visibility change.
- Cleanup disconnects every observer and listener, removes the badges, icons and attributes the plugin added, and cancels the pending frame.

## Performance

Method: [performance.md](../.claude/skills/opencode-gui-plugins/reference/performance.md). Isolated harness app, 9 open tabs (a 500-turn session, six 30-turn sessions, a 60-turn session with a peer message every 10 turns, Side tabs layout), no model; median of 3 runs of one script per row, CDP `Performance.getMetrics` per second, `MutationObserver` callbacks counted through a patched constructor. Idle is 30s untouched; scroll is 5s of 900px steps per frame; stream appends one node per frame to the last timeline row for 8s; switch is 10 tab switches. Script ms/s is main-thread scripting; busy ms/s is all main-thread task time. The bar in performance.md says "within 3% of bare scripting time"; read here as 3 points of main-thread time, since bare scripting in a switch is under 1%.

| Scenario | Bare (script / busy ms/s) | Before | After | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle (30s) | 0.1 / 2.4, 0 observer callbacks | 0.2 / 3.0, 0 callbacks | 0.1 / 2.9, 0 callbacks | zero callbacks | PASS |
| scroll (5s) | 514.8 / 996.8 | 551.1 / 999.3 | 507.1 / 998.0 | within 3% | PASS |
| stream (8s) | 6.0 / 308.7; observer time 22.7ms | 102.5 / 420.0; observer time 34.7ms | 6.0 / 362.6; observer time 22.9ms | within 3% | PASS on scripting (busy is layout noise: bare ranges 281 to 309) |
| 10 switches | 9.4 / 142.3 | 17.5 / 171.5 | 14.4 / 162.3 | within 3% | PASS on busy (+20 ms/s = 2 points), FAIL on scripting ratio (+5 ms/s) |

Long tasks in the switch scenario occur in bare runs too (0, 0 and 4 in three runs), so they do not separate the plugin from the host here.

What changed:
- The observer moved from `documentElement` to `[data-slot='vertical-tabs']`. A streaming reply no longer reaches it: stream scripting went from 102.5 to 6.0 ms/s, equal to bare. The region is looked up synchronously in setup, otherwise on rAF for 60 frames, and again from `refresh()` when the region is no longer connected.
- `permission.sync` and `form.sync` run once per session (`formsRequested`, cleared on failure), in a `createKeyed` over `ctx.sessions.list()`.

Left: the switch scenario still costs about 5 ms/s of scripting over bare. It is the `refresh()` work per tab-list change (badge writes with a `getBoundingClientRect` and a canvas measure per row), driven by the three remaining `createEffect`s (SR-2, a separate item). Not attributed further.

### Realistic thread, 2026-11-02 (`scripts/perf.mjs`)

650 assistant messages with reasoning, tool output, diffs, 26 subagent children, injected rows and attachments; Side tabs; stub model. Median of 3 runs; delta is against the `null` plugin (the host's cost of loading any plugin). Script ms is main-thread scripting in the scenario window.

| Scenario | Floor script ms | With plugin | Delta | New long tasks | New frames over 20 ms | Frame p95 ms (floor) | Result |
|---|---|---|---|---|---|---|---|
| scroll | 310 | 295 | -15 | 0 | 0 | 16.6 (16.5) | PASS |
| type | 150 | 155 | 6 | 0 | -1 | 9.9 (9.8) | PASS |
| switch | 131 | 149 | 18 | 0 | -1 | 10.0 (10.1) | **FAIL** |
| stream | 253 | 244 | -10 | 0 | 0 | 9.8 (9.9) | PASS |
| hover | 176 | 166 | -10 | 0 | -1 | 9.9 (9.9) | PASS |
| idle | 85 | 77 | -8 | 0 | 0 | 9.8 (9.9) | PASS |
| open thread (settled, ms) | 372 | 385 | 13 | | | | PASS |
| reopen thread (settled, ms) | 48 | 51 | 3 | | | | PASS |

## Tests

`pnpm test`: truncation, age formatting, attention kind and time stamping against fixtures in the host's markup. `parity.spec.mjs` compares the result with the live app.

### Sidebar scale (`perf.mjs --sidebar`), 2026-11-02

150 live sessions open as tabs over 12 projects, 600 archived, Side tabs, the long thread unopened. The floor is the `null` plugin plus the `sidebar-seed` fixture; the host alone settles a cold load in about 13.5 s and a hover sweep costs about 1.7 s of style at this size (host `:has()` rules and 150 rows), so this is a tab count worth watching on its own. Plugin cost, before this change (one run) and after (the cold-load and open rows are two runs):

| Scenario | Floor | Before | After | Bar | Result |
|---|---|---|---|---|---|
| ten row clicks, script ms | 221-242 | 1415 | 243-286 | within 3% or noise | PASS |
| ten row clicks, worst settle ms | 337-503 | 3937 | 427-463 | within 5% or 20 ms | PASS |
| cold load, script ms | 152-258 | 1395 | 301-409 | within noise | FAIL (+150-250 ms) |
| cold load, time to settled | 13.1-14.1 s | 20.9 s | 19.6-21.3 s | within 5% | FAIL (+6-7 s) |
| hover sweep, new frames over 20 ms | 0-4 | 119 | 0, 3, 0, 61 (four runs on two builds) | within noise | PASS on the final build (3 and 0), earlier build 61 once |
| sidebar list scroll, script ms | 244-250 | 386 | 136 | within 3% | PASS |
| idle | | | no extra callbacks | zero | PASS |

What changed: the row tooltip and the badge tooltip are formatted only when the row's activity time or label changes (`toLocaleString` builds a new `Intl` formatter per call, and a refresh formatted every row twice); the time font is read once per refresh and text widths are cached by font and string; `badges()` creates nodes first, then reads every width, then writes (the forced layout per row was 6.2 s of a cold load); a refresh that costs 8 ms or more, inside a burst of five within half a second, holds the next one off for nine times its cost up to 250 ms.

Left: cold-load settle is still 6-7 s over the floor. Disabling the plugin's CSS cost about 3 s of it and disabling the refresh the rest, so both the `:has()` rules and the per-row refresh matter; it is bimodal (one instrumented run settled at 10.8 s against a 13.2 s floor), so attribution is open. Ten-click style cost and the hover sweep depend on whether the sidebar was reloaded before the scenario (style 0.4 s after a reload, 3.6 s without one), unexplained.
