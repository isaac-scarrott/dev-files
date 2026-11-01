# sidebar-repos: design

GUI plugin for OpenCode Desktop 2.2.5 that changes the Side tabs rows: the project name above the title, a warning or help icon for a pending permission or question, and the time of the last activity on idle rows. User-facing behaviour is in [README.md](README.md).

## Decisions

Reason for each DOM hook, against the "no extension point" list in [host-architecture.md §8](../../../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary). The CSS goes through `ctx.add(Style, …)`, the data through `ctx.tabs`, `ctx.sessions` and each server's `data`, and the icons through `ctx.ui.Icon`; everything below is DOM because tab rows have no extension point.

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

Method: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md). Isolated harness app, 9 open tabs (a 500-turn session, six 30-turn sessions, a 60-turn session with a peer message every 10 turns, Side tabs layout), no model; median of 3 runs of one script per row, CDP `Performance.getMetrics` per second, `MutationObserver` callbacks counted through a patched constructor. Idle is 30s untouched; scroll is 5s of 900px steps per frame; stream appends one node per frame to the last timeline row for 8s; switch is 10 tab switches. Script ms/s is main-thread scripting; busy ms/s is all main-thread task time. The bar in performance.md says "within 3% of bare scripting time"; read here as 3 points of main-thread time, since bare scripting in a switch is under 1%.

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

## Tests

`pnpm test`: truncation, age formatting, attention kind and time stamping against fixtures in the host's markup. `parity.spec.mjs` compares the result with the live app.
