# Snooze / archive

Snoozed and Archived groups at the bottom of the sidebar, with Snooze and Archive next to Delete in every session menu.

> **Credit:** menu markup is adapted from [OpenCode](https://github.com/anomalyco/opencode)'s (MIT) desktop app (2.2.5). The accordion's `grid-template-rows` technique and `cubic-bezier(.23,1,.32,1)` curve are from Emil Kowalski's animation guidance.

![Snoozing a session from its menu, a session that woke showing the clock, then expanding Snoozed and Archived and showing more rows](media/demo.gif)

[Full-quality video](media/demo.mp4)

## What it does
- **Snooze** is a submenu of the session right-click menu, the session header "…" menu and the Home row menu: In 1 hour, In 3 hours, This evening, Tomorrow, Next week, each with its wake time, then Custom… (duration or calendar and time). The palette has "Snooze session…".
- A snoozed session wakes at its deadline or when it needs attention (approval, question, new work, completion). It then shows a clock until you open it. Snoozes are stored on this device and survive restarts.
- **Sending a message resets both.** A prompt you send (composer, queued or steering send, slash command) into a snoozed session unsnoozes it, and into an archived session unarchives it, at once: the session is back in the normal list, the wake timer is gone, and any woke clock is cleared. A failed unarchive shows an error toast and the session stays archived. Messages from anything else (assistant output, subagents, peer messages, monitor and scheduler wakes) never unarchive; a snooze still wakes on them as before.
- **Archive** and **Restore** use OpenCode's native archive state. Opening an archived row reads it without unarchiving. Snoozed and Archived rows have Wake, Restore and Delete… (always confirmed) in their own menus.
- Archived loads lazily. Each group shows 10 rows, and **Show N more** adds the next 25.  The Archived header shows no count, because the total isn't known until every page is loaded; Snoozed shows its count.
- The groups scroll with the live rows inside the sidebar. Expanding one grows it upward into the empty space first, then downward. Rows never move.

## Context
OpenCode Desktop archives sessions but has no snooze, and no way to browse a long archive. This adds both inside the sidebar. The host has no slot there or a hook for the tab menu, so the groups and menu items are injected into its DOM and removed on cleanup. This tracks the 2.2.5 markup. Closing a snoozed or archived tab can leave an entry in native Recently closed.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/snooze-archive"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI. The groups need the Side tabs layout; the palette commands work in any layout.

## Options
| Option | Default | |
|---|---|---|
| `archive` | `auto` | `auto`: yield to OpenCode's own archive UI (its own archived group, or an Archive item of its own for our Archive actions). `ours`: always show ours. `theirs`: always stand down. |

```json
"plugins": [{ "package": "/path/to/apps/opencode-plugins/snooze-archive", "options": { "archive": "theirs" } }]
```

## When OpenCode adds archive UI
OpenCode 2.2.5 stores archived sessions but has no archive UI in its Side tabs sidebar, its menus or its palette. Its experimental Inbox layout has an Archived section and an Archive menu item of its own; that layout shows none of this plugin's groups, so it does not count. In `auto` the plugin watches for the host's own:

- **Menu**: a session menu (tab, header, Home row) that already has an Archive or Unarchive item. Our menu item is then left out of that menu.
- **Home**: the Home row's `data-action="home-session-archive"` button.
- **Sidebar**: an archived group inside the Side tabs sidebar (`data-slot` or `data-component` containing `archived`).

A host **Archive action** (the menu item or the Home button) makes our Archive actions stand down: the Archive menu items, the hover Archive button (the host's close X comes back), the Archive palette command, and the Snoozed row's Archive. It does not make the **Archived** group stand down, because the group is how you browse and restore what was archived. Only a host **archived group** in the sidebar does that, and then the Refresh palette command goes too. Snooze, the Snoozed group, Delete…, waking when a session is archived elsewhere, and the woke mark always stay. It is live: the group stays mounted but hidden, nothing is fetched while it is down, and it comes back, and loads what it missed, when the host's UI goes away. The sidebar root carries `data-sa-archive="ours|theirs"` (the group) and, when a signal fired, `data-sa-standdown="menu,home,sidebar"` naming it.

A bound `session.archive` keybind is not a signal: OpenCode answers keybind lookups from a stored catalog of commands that includes ones of older builds, so it cannot tell a live command from a stale one.

Archive and Restore call the client's own `session.archive` / `session.unarchive` when it has them, else `session.update({ archived })`, then check the server's state.

### Re-check on each OpenCode update
- **SDK**: do `client.session.archive` / `unarchive` exist, and with which argument (the plugin assumes `{ sessionID }` and falls back to `update` on any error)? Does `session.list({ archived: true })` still work?
- **Commands**: whether the host registers an archive command (its bundle has no `session.archive` id in 2.2.5). Not detectable from a keybind (see above); look for the menu item or button it would come with.
- **Menus**: the label or `data-action` of the host's Archive item in the tab, header and Home row menus (`hasNativeArchive`).
- **Sidebar**: the `data-slot` / `data-component` of an archived group in the Side tabs sidebar (`SIDEBAR_ARCHIVED`). The probe is scoped to `[data-slot="vertical-tabs-sidebar"]`.
- **Home**: whether `SHOW_HOME_SESSION_ARCHIVE` is on (`home-session-archive`).
- **Composer stamp**: `session.inbox.enqueued` items from the composer carry `payload.metadata.displayText` (`isUserSend`); other senders stamp their own keys. If a release drops it, sends stop resetting the state.
- **Layouts**: whether the Inbox layout's Archived section moves into Side tabs.

## Credits
- [OpenCode](https://github.com/anomalyco/opencode) (MIT): the menu markup, adapted from the desktop app's renderer source (2.2.5).
- Emil Kowalski: the `grid-template-rows` accordion and `cubic-bezier(.23,1,.32,1)`, taken verbatim from his animation guidance.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Design notes: [DESIGN.md](DESIGN.md).
