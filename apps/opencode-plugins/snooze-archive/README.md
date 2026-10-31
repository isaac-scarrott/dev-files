# Snooze / archive

OpenCode Desktop **2.2.5**, GUI-only plugin. No app modifications.

The vertical session sidebar ends with collapsed **Snoozed** and **Archived** groups. Click or use Enter/Space to toggle; Right/Left expands/collapses. Each group scrolls independently and is capped at 220px / 24vh.

- **Snooze session…** in the command palette: 1h, 3h, evening 18:00 (when future), tomorrow 09:00, next Monday 09:00, or a custom duration (`30m`, `2h`, `3d`) / local date (`2026-11-02T09:00`). Calendar presets preserve local time across DST; nonexistent custom local times are rejected. Durations are elapsed time.
- Snooze is persisted **on this device**, shared between its windows, keyed by server + session. Closing the shell tab does not stop server work. Pending approval/question in the session or known descendants declines snooze. Wake/Undo reopens it. Opening through Home/Recently closed also wakes it.
- Wakes early on approval/question, new execution/queued input, completion or failure. Startup/reconnect checks metadata and pending requests; a 30-second timer handles deadlines, resume and missed state changes. Timed wake waits for a disconnected server to reconnect. App-closed deadlines are handled on the next launch, not by a background service.
- **Visible actions.** Each vertical session tab shows Snooze…, Archive and Delete… icon buttons on hover or keyboard focus, just left of the host's close button, and the same buttons sit in the session header (`session.header` slot). Archived rows have a **Delete…** button next to Restore. Snooze opens the preset picker. Delete always asks first, states it is permanent, and focuses Cancel; it calls native `client.session.remove({ sessionID })`. On failure an error toast shows and the tab stays. Palette commands remain.
- **Motion.** Group open/close animates `grid-template-rows` 0fr→1fr plus opacity (200ms, `cubic-bezier(0.23,1,0.32,1)`) with CSS transitions; collapsed content is `inert`/`visibility:hidden`. Rows fade/translate in and out only while a group is open after its first content, never on startup or count changes. `prefers-reduced-motion` keeps opacity only.
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

Commands, data, storage, toasts, dialogs and native mutations use the public SDK. 2.2.5 has no sidebar-bottom slot: the two group nodes and a parent layout attribute are injected next to `[data-slot="vertical-tabs"]`, and one action cluster is appended as a sibling inside each `[data-tab-key]` tab wrapper (marked `data-sa-tab-host`, removed on cleanup). Cleanup removes them. Host title, rename, avatars, status, scroll and footer controls are left intact. Inbox/horizontal tab layouts have no group attachment; commands still work.

The public tab API exposes only user-style `close`, so snoozed/archived tabs can appear in native Recently closed. Restoring an archived entry should use this plugin's Restore action; opening an archive through native history does not itself unarchive it.

Tests cover mocked API calls/errors/pagination, snooze transitions and DST, keyed group counts/toggles, startup/reconnect, manual wake, undo, and cleanup/reload against a versioned sidebar fixture. Cold permission/form lists and metadata may be undefined despite SDK declarations: new snoozes require confirmed hydrated state; existing snoozes defer safely while known deadline/archive/attention signals remain effective. **Tab-row button position (right offset 30px to clear the close button), header placement, and animations are unverified live. Actual desktop appearance, interaction and native archive writes remain unverified**: native desktop-control tools were unavailable. Mock/fixture tests are not live API or UI evidence.
