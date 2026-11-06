# Archive: design

OpenCode Desktop **2.2.5**, GUI-only plugin. No app modifications.

Archive state is the host's: `session.update({ archived })` (or `session.archive`/`unarchive` when the client has them),
`session.list({ archived: true })` and the `session.archived`/`session.unarchived` events. Nothing is stored locally and
nothing is invented.

## Split from the snooze plugin (2026-11-06)

Two features, two plugins (`snooze`, `archive`), one shared library (`session-ui`). The split is by ownership of state:
snooze owns device-local deadlines, archive owns the native archive state. Each works installed alone.

What lives here: the Archived group and its paging, the Archive/Refresh palette commands, the tab-row Archive button (in
place of the close X), the Archive menu item in session menus, the stand-down guard, and unarchive-on-send. What stays in
`snooze`: the Snoozed group, the Snooze submenu, the woke clock and the palette's `Delete session…` (one registration only, so
both plugins never list it twice). The shared native archive write is `setArchived` in `session-ui`.

## Decisions: the group

The Archived group is the last block of the sidebar's scroll region, in a stack shared with Snoozed (`sidebar.ts` in
`session-ui`; whichever plugin loads first creates the stack, CSS `order` keeps Snoozed above Archived).

- **Lazy.** Nothing is fetched until the group is first expanded, which asks for 10 (`session.list { archived: true, parentID:
  null, limit: 10 }`). Each **Show N more** asks for the next 25 by cursor, only when the rows loaded do not cover it.
- **No count in the header** (user decision): the server returns no total, so a count read `10+` almost always. The status line
  says what is loading or what failed instead.
- **Only the window becomes rows.** The DOM stays proportional to what is shown, not to the archive.
- Several servers are merged newest-update-first, each keeping its own order.

## Decisions: events keep the window right without refetching

- `session.archived` fetches that one session and inserts it where the server's order puts it, or leaves it for the page that
  holds it when it belongs past the loaded tail.
- `session.unarchived` and `session.deleted` drop the row; `session.renamed` updates a loaded row.
- A row removed from page 2 pulls the next loaded row in; when that leaves fewer rows than the window, the next page is
  fetched. Rows are keyed by session id, so none is duplicated or lost across pages.
- Events before the first expand change nothing (the first page will include them).
- **Refresh archived sessions** reloads from the first page and refills up to the rows already shown. A failed page shows the
  error in the group's status line and the button retries.

## Decisions: reading, archiving, restoring, deleting

- Clicking an Archived row (or Enter on its link) opens the session in a tab through the host's route
  (`openInCurrentTab`), and leaves it archived: no `session.update` call. The 2.2.5 sources have no archived guard on the
  session route or tab, so it renders as any other session; the host offers no archived marker and none is invented.
- **Only Archive closes a tab**, at the moment it archives. Refresh, `session.archived` events and the inventory never close
  tabs, so a tab opened from the group, Home or Recently closed stays.
- An archived session's tab is hidden (`data-sa-archived-tab`) while it is in the group and closed, deferred and re-checked,
  once the user has moved on. That is off while the host owns archive UI.
- **Restore** is the only unarchive (hover button, or right-click), verifies the server's state and opens the session.
- Plugin **Delete…** always asks first, says it is permanent, and calls `client.session.remove({ sessionID })`; on failure an
  error toast shows and the row stays.

## Decisions: standing down for a host archive UI

Settled with the user ("Yes, small guard now"), 2026-11-01. Option `archive: "auto" | "ours" | "theirs"`, default `auto`, read
from `ctx.options` once per setup (a config change reloads the plugin). The decision is `src/guard.ts`; `gui.ts` reads two
reactive decisions, `groupDown()` and `actionsDown()`.

- **Two decisions, not one** (fixed 2026-11-01 after the Archived group vanished on 2.2.5). The Archived group is a browser:
  it lists and restores archived sessions. A host Archive action (a menu item, Home's button) archives but shows nothing
  archived, so it is no replacement for the group. So in `auto`: **`groupDown`** is true only for a host archived group
  (`sidebar` signal); **`actionsDown`** is true for any host archive UI (`menu`, `home`, `sidebar`). `theirs` stands both down,
  `ours` neither.
- **What `groupDown` stands down**: the Archived group (kept mounted and `hidden`, so no flicker and no rebuild; nothing
  fetched while down; it refills when it returns), the Refresh palette command, and the hiding and sweeping of archived
  sessions' tabs. **What `actionsDown` stands down**: our Archive item in the tab, header and Home row menus, the hover Archive
  button (the host's close X returns), the Archive palette command.
- **Detection (auto)**: three signals — a session menu we extend that already has an Archive/Unarchive item (by
  `data-action`/`data-slot`/`data-value` containing `archive`, or the whole label); a non-ours `data-slot`/`data-component`
  containing `archived` inside `[data-slot="vertical-tabs-sidebar"]`; Home's `[data-action="home-session-archive"]`. The menu
  and Home readings are latched until the surface is seen again without the marker; the sidebar reading is live. `ours` and
  `theirs` skip probing. The stack carries `data-sa-archive="ours|theirs"` and `data-sa-standdown="menu,home,sidebar"`, so
  "why is Archived gone" is one attribute read.
- **No keybind signal.** `ctx.keybinds.keybind(id)` answers from the registered command, else from the host's persisted
  `command.catalog.v1`, which keeps commands of older builds: an install that once ran a build with `session.archive` keeps
  answering "mod+shift+backspace", though 2.2.5 registers no such command. Reproduced in the harness by adding that catalog
  entry. A host that really adds an archive command also adds a menu item, button or group, which are read directly.
- **Not a trigger**: the experimental Inbox layout (`sidebar-inbox`) has its own Archived section and Archive items, and
  archives through `session.update({ archived })`. It is another layout: our groups and tab buttons do not exist there.
- **API preference**: `writeArchived` calls `client.session.archive`/`unarchive` with `{ sessionID }` when the client has them,
  falls back to `session.update({ archived })` when they are missing or throw, and the result is checked with `session.get`.

Evidence:
- 2.2.5 sources (extracted from the installed app's source maps): the client declares `session.update({ archived })`,
  `session.list({ archived })` and the events `session.archived`/`session.unarchived`, and no `session.archive`/`unarchive`
  method. Home's row Archive button is compiled out (`SHOW_HOME_SESSION_ARCHIVE = false`). No registered command id contains
  `archive`. The Side tabs sidebar has no archived group; the Inbox layout does.
- Upstream requests that would add the UI: #60581, #59220, #60867.
- Harness (private root, 2.2.5, Side tabs): `data-sa-archive="ours"` with Snoozed and Archived groups, no host marker, no Home
  archive button (Home rows present), the real tab menu `Rename, Close tab, Snooze, Archive, Delete session…`; with
  `archive: "theirs"` in the config the group hid with no reload, and removing it brought it back.

## Decisions: sends

A prompt the user typed unarchives at once, without opening or focusing a tab (the user is in it). A failed write leaves
everything as it was and says so; the next send tries again. Every window that sees the event asks for the same state, so the
write is idempotent and each window makes it at most once at a time. Anything else that lands in the inbox (peer messages,
monitor and scheduler wakes, a client calling the prompt API) never unarchives; `isUserSend` in `session-ui` holds the stamp
rule.

## Compatibility / verification boundary

DOM injection only: the host has no archived group, no session-menu hook and no tab-row action. The plugin matches 2.2.5
markup; the README lists what to re-read on each release. `parity.spec.mjs` runs the group's rows and the tab action against
the live session row in the harness.

## Build / register

```sh
npm_config_registry=https://registry.npmjs.org pnpm install   # in apps/opencode-plugins: one Solid for the library and both plugins
pnpm typecheck && pnpm test && pnpm build && pnpm smoke
```

The built CommonJS entry is tracked in `dist/gui-experimental.cjs`; the host watches local rebuilds.
