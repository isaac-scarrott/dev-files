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
- **Only the vertical layout** (`[data-orientation='vertical']`) is changed.

## How it works

- `names`, `attention` and `activity` are maps from tab key to a value, rebuilt by effects over `ctx.tabs.list()` and each session's store. Each effect then calls `refresh()`, which coalesces into one rAF that stamps times, writes badges, renders times and drops disposed icons.
- Message history is fetched once per open session (`messagesRequested`); permission and form lists are synced for every session on each list change.
- A `MutationObserver` on the document element (attribute filter `data-tab-key`, `data-orientation`, `data-status`, plus child changes outside the plugin's own nodes) triggers `refresh()` when the host re-renders rows. A `ResizeObserver` per vertical row re-measures the badge.
- One ticker updates the ages while the window is visible and wakes on focus and visibility change.
- Cleanup disconnects every observer and listener, removes the badges, icons and attributes the plugin added, and cancels the pending frame.

## Performance

Not measured yet. Method and bars: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md) (seeded 500-prompt session, bare vs plugin, three runs, median).

Standing cost, read from the source (not measured):

- A `MutationObserver` on `documentElement` with `subtree` and `childList`: any node added or removed outside the plugin's own nodes, anywhere, schedules a refresh (four document queries and a canvas measure). A streaming reply adds nodes every frame. Narrowing it to the sidebar tab list (`[data-slot=vertical-tabs]`) is the known fix.
- Four raw `createEffect`s assigning closure variables; one calls `permission.sync` and `form.sync` for every session on each list change.

| Scenario | Bare | With plugin | Delta | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle | | | | zero callbacks | not measured |
| streaming reply | | | | within 3% scripting | not measured |
| 10 session switches | | | | within 3% scripting | not measured |

## Tests

`pnpm test`: truncation, age formatting, attention kind and time stamping against fixtures in the host's markup. `parity.spec.mjs` compares the result with the live app.
