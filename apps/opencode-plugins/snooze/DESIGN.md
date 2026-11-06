# Snooze: design

OpenCode Desktop **2.2.5**, GUI-only plugin. No app modifications.

Snooze is a device-local deadline on a session. It is not archive state and not a host concept: the plugin stores
`{server, id, title, at, until, updated, busy}` per entry (`Store.global`) and decides itself when a session has woken.

## Split from the archive plugin (2026-11-06)

Two features, two plugins (`snooze`, `archive`), one shared library (`session-ui`). The split is by *ownership of state*, not
by code: snooze owns device-local deadlines, archive owns the native archive state. Each works installed alone, and neither
imports the other.

What stays here:
- the Snoozed group, its rows, its menus and the palette command;
- the deadline timer, the away/focus recheck, the reconcile on reconnect, the send/wake events;
- the woke clock (its own store, its own tab mark, published to the notifications hub as `info`);
- `Delete session…` in the palette. It is the only plugin that registers it, so two plugins never list the same command; the
  Archived rows' own Delete comes from the archive plugin.

What moved out: the Archived group, the Archive menu item/tab button/palette command, the stand-down guard, unarchive-on-send.
The Snoozed row's **Archive** stays here and calls the native archive API directly (`setArchived` in `session-ui`), so a
snooze-only install can still archive. Snoozing an archived session is refused; a snooze on a session archived elsewhere ends
without reopening it.

## Decisions: what wakes a snooze

`wakeReason` (`src/snooze.ts`): archived → attention → new work (`busy` moved on) → completed (`idle` after the snooze) →
deadline. Events (`session.execution.*`, `permission.asked`, `form.created`, `session.inbox.enqueued`) wake the matching
session at once; the wake starts no turn, so the notification is `info`.

- **No polling.** One `setTimeout` waits for the nearest deadline; none exists while nothing is snoozed. A timer that fires
  long after it was due (the machine slept) reconciles every entry against the server instead of trusting local state.
- **Away means reconcile.** `visibilitychange`, `focus` and `blur` track how long the window was away; a return after a
  minute asks each server again, a shorter one only re-reads local deadlines.
- **Reconcile is careful.** Startup/reconnect checks metadata first, then syncs the session's requests (`permission` and
  `form` lists for the session and its family). A session whose folder is gone answers `LocationNotFoundError`, which means
  "nothing pending", not "unknown" (`src/location.ts`). Unknown state keeps the snooze and defers closing the tab; it never
  guesses.
- **Closing the tab is not stopping work.** Snoozing closes the shell tab. Reopening through Home or Recently closed wakes it
  explicitly (no mark).

## Decisions: the menu and the dialog

`Snooze ▸` is a real submenu of each host session menu, in the app's `menu-v2` markup (`session-ui/src/menu.ts`), inserted
above the native Delete… so the host's own items and keyboard handling are untouched. Presets resolve their times when the
menu opens (`src/time.ts`), so they are never stale:
- In 1 hour / In 3 hours are elapsed time;
- End of workday is 16:30 today, Tomorrow is 09:00, Next week is Monday 09:00, all local wall-clock (`resolveLocal`): a time
  that does not exist (spring forward) moves ahead by the jump, an ambiguous one (fall back) takes the first occurrence.
  Tested in Europe/London, America/New_York, Asia/Kolkata, Asia/Kathmandu, Australia/Lord_Howe, Pacific/Auckland.
- **Custom…** is a host `Dialog` with a Duration | Date & time switch. Duration parses `90m`, `1h30`, `1.5h`, `2 days`,
  `in 2 hours`, `45`; Date & time is a bespoke month grid plus a time field (`9:30`, `930`, `2:30 pm`, ↑/↓ ±5 min, Shift ±1 h),
  because the host has no calendar or time field. A live line shows the resolved wake time with the zone
  (`GMT+1 · Europe/London`); gap/overlap resolutions warn; past and >1 year are refused (`checkWake`).

## Decisions: motion is the host's

Group content shows and hides in one frame (a closed panel is `display: none` and `inert`); only the chevron rotates,
`transform .15s` (the CSS default ease). Rows come and go in one frame. Evidence, OpenCode 2.2.5 `main-*.css`:
`[data-component=collapsible] [data-slot=collapsible-content]` has no height or opacity transition, and
`[data-slot=collapsible-arrow-icon]` is `transition: transform .15s`.

The groups sit inside the host's scroll region (`vertical-tabs-scroll`, after the tab list), so live rows, Snoozed and
Archived scroll as one and the host's edge fades cover all of it. Expanding grows upward into the free space first
(`margin-top: auto` on the shared stack, `sidebar.ts` in `session-ui`), then downward.

## Decisions: the woke clock

A session that wakes by itself (deadline, approval/question, new work, completion, including deadlines that passed while the
app was closed) shows a clock in its vertical tab's trailing status slot until it becomes the mounted session by any route.
Stored in its own `woke` store (separate from `snoozes` so adding a field never drops existing snoozes), capped at 200.
Archiving, deleting or re-snoozing it clears the mark.

The mark is native-ui's shared `createTabMarks` with the owner `snooze`: the host's status slot position, the hover swap for
the close button, the title fade, and `data-notify` so sidebar-repos' time label stands aside. With the `notifications` plugin
installed, the wake is published to its hub instead and the hub draws the mark, so a session never shows two.

## Decisions: sends

A prompt the user typed (composer, queued or steering send, slash command) unsnoozes the session at once and clears the clock.
The composer stamps `payload.metadata.displayText` on `session.inbox.enqueued` (OpenCode 2.2.5, read off real sends); peer
messages, monitor and scheduler wakes stamp other keys, and a client calling the prompt API stamps nothing, so an unknown
sender is not the user. Only this plugin's half: unarchiving on that send belongs to the archive plugin.

## Performance

The group is a Solid `createKeyed` over a memo of its window: only the visible rows exist (about 18 nodes each), and the
remaining-time labels refresh on a 30 s interval only while the group is open. The DOM hub (one scoped MutationObserver) is
`session-ui`'s. One timeout at the nearest deadline; no polling.

## Compatibility / verification boundary

Everything is DOM injection: the host offers no sidebar slot, no session-menu hook and no tab-row action. The plugin matches
the 2.2.5 markup and must be re-checked when the app changes it (see the README's list). Verified in the harness: the tab menu
reads `Rename, Close tab, Snooze, Archive, Delete session…` with both plugins loaded, and snoozing keeps the tab closed.

## Build / register

```sh
npm_config_registry=https://registry.npmjs.org pnpm install   # in apps/opencode-plugins: one Solid for the library and both plugins
pnpm typecheck && pnpm test && pnpm build && pnpm smoke
```

The built CommonJS entry is tracked in `dist/gui-experimental.cjs`; the host watches local rebuilds.
