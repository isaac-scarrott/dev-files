# Snooze / archive

OpenCode Desktop **2.2.5**, GUI-only plugin. No app modifications.

The vertical session sidebar ends with collapsed **Snoozed** and **Archived** groups. Click or use Enter/Space to toggle; Right/Left expands/collapses. Each group scrolls independently and is capped at 220px / 24vh.

- **Snooze session…** in the command palette: 1h, 3h, evening 18:00 (when future), tomorrow 09:00, next Monday 09:00, or a custom duration (`30m`, `2h`, `3d`) / local date (`2026-11-02T09:00`). Calendar presets preserve local time across DST; nonexistent custom local times are rejected. Durations are elapsed time.
- Snooze is persisted **on this device**, shared between its windows, keyed by server + session. Closing the shell tab does not stop server work. Pending approval/question in the session or known descendants declines snooze. Wake/Undo reopens it. Opening through Home/Recently closed also wakes it.
- Wakes early on approval/question, new execution/queued input, completion or failure. Startup/reconnect checks metadata and pending requests; a 30-second timer handles deadlines, resume and missed state changes. Timed wake waits for a disconnected server to reconnect. App-closed deadlines are handled on the next launch, not by a background service.
- **One hover action, the rest in right-click.** A session tab shows a single **Archive** `IconButton` on hover/focus, beside the app's own close X (untouched: that is "close tab"). Right-clicking a tab opens the app's own context menu with **Snooze…** and **Archive** added after Rename / Close tab and above the app's own **Delete…** (the native permanent delete, so the plugin adds no second one). Snoozed and Archived rows are the app's session-tab markup; hover shows one action (**Wake** / **Restore**) and right-click (or the menu key) opens a popup in the same `menu-v2` markup: Wake, Archive, **Delete…** for snoozed; Restore, **Delete…** for archived. Plugin Delete always asks first, says it is permanent, focuses Cancel and calls `client.session.remove({ sessionID })`; on failure an error toast shows and the row stays. There is no session-header cluster. Palette commands (Snooze session…, Archive session, Delete session…) remain.
- **Snooze icon.** The host catalog has no clock, so `src/icons.ts` draws one (16px, outline, `currentColor`, round caps, circle r6 plus hands) and the Snoozed group header uses it. Host `IconButton`/`ctx.ui.Menu` only take catalog names and the native menu's items carry no icons, so the clock appears where we render the markup.
- **Motion.** Group open/close animates `grid-template-rows` 0fr→1fr plus opacity (200ms, `cubic-bezier(0.23,1,0.32,1)`) with CSS transitions; collapsed content is `inert`/`visibility:hidden`. Rows fade/translate in and out only while a group is open after its first content, never on startup or count changes. `prefers-reduced-motion` keeps opacity only.
- **Reading archived sessions.** Clicking an Archived row (or Enter on its focused link) opens the session in a tab via `ctx.tabs.open(…, { focus: true })` and leaves it archived: no `session.update` call. Only the **Archive** action closes a tab, at the moment it archives; refresh, `session.archived` events and the archived inventory never close tabs, so a tab opened from the group, Home or Recently closed stays. Restore (hover button, or right-click) is the only unarchive. The 2.2.5 sources have no archived guard on the session route or tab (no banner, read-only composer or redirect; "archived" is checked only when resolving a transcript-mentioned session, Home lookup and the palette index), so the session should render as any other, with no archived marker; the host offers none and none is invented. Unverified live.
- **Archive session** uses native `session.update({ archived: true })`, then verifies native state. **Restore** uses `archived: false`, verifies, and opens the session. Archive state is never invented locally.
- Archived inventory includes **all top-level sessions on every listed server**, including sessions without open tabs, following every cursor page. Snooze uses the same top-level scope. Counts show `—` while loading, disconnected, incompatible or failed; expand for the reason. Refresh via **Refresh archived sessions**.

## Build / register

```sh
npm_config_registry=https://registry.npmjs.org pnpm install --frozen-lockfile
npm_config_registry=https://registry.npmjs.org pnpm typecheck
npm_config_registry=https://registry.npmjs.org pnpm test
npm_config_registry=https://registry.npmjs.org pnpm build
```

Add the installed directory to global `opencode.json`'s `plugins`:

```json
"/Users/isaac/git/dev-files/apps/opencode-plugins/snooze-archive"
```

The built CommonJS entry is tracked in `dist/gui-experimental.cjs`. Local rebuilds are watched by the host.

## Compatibility / verification boundary

Commands, data, storage, toasts, dialogs and native mutations use the public SDK. 2.2.5 has no sidebar-bottom slot: the two group nodes and a parent layout attribute are injected next to `[data-slot="vertical-tabs"]`, one Archive button is appended as a sibling inside each `[data-tab-key]` tab wrapper (marked `data-sa-tab-host`, removed on cleanup), and a body-level `MutationObserver` adds our items to the app's tab context menu when it opens (see below). Cleanup removes them. Host title, rename, avatars, status, scroll and footer controls are left intact. Inbox/horizontal tab layouts have no group attachment; commands still work.

The public tab API exposes only user-style `close`, so snoozed/archived tabs can appear in native Recently closed. Restoring an archived entry should use this plugin's Restore action; opening an archive through native history does not itself unarchive it.

Tests cover mocked API calls/errors/pagination, snooze transitions and DST, keyed group counts/toggles, startup/reconnect, manual wake, undo, and cleanup/reload against a versioned sidebar fixture. Cold permission/form lists and metadata may be undefined despite SDK declarations: new snoozes require confirmed hydrated state; existing snoozes defer safely while known deadline/archive/attention signals remain effective. **Tab-row button position (right offset 30px to clear the close button), header placement, and animations are unverified live. Actual desktop appearance, interaction and native archive writes remain unverified**: native desktop-control tools were unavailable. Mock/fixture tests are not live API or UI evidence.

## Context-menu integration

`MenuItem` registers only in `session.panel`, `server.add` and `server.row`, and `ctx.ui.Menu` is a button-triggered menu with no way to open at a point, so neither can extend or replace a tab context menu. The app's menu (Kobalte, `Menu.Context` in `tab-nav.tsx`) is a portal of `[role=menu][data-component=menu-v2-content]` labelled by the tab link. `src/tabmenu.ts` watches `<body>` for that node, resolves the tab through `aria-labelledby` → `closest([data-tab-key])` (so only session tabs), and `extendNative` in `src/menu.ts` inserts `menu-v2-item` nodes (same attributes, `data-slot`s, `data-variant=critical`) before the app's separator. It is idempotent (`data-sa-menu` marks our nodes), removed on cleanup, and does not touch the app's items. Kobalte keeps a collection of its own items, so arrow/Home/End presses that would step onto or off our items are handled by us (highlight moved to a single item, as Kobalte does); every other key still reaches the app. Choosing an item dispatches Escape on the menu to close it through the app's own path, then runs the action. Tradeoff: this depends on the 2.2.5 DOM, and highlight state for a native item is cleared by us when focus moves onto ours. Snoozed/Archived rows have no native menu, so they use `openMenu` (fixed popup, same markup, arrows/Home/End/Enter/Escape, outside-click and blur close, focus restored).
