# Snooze / archive

Snoozed and Archived groups at the bottom of the sidebar, with Snooze and Archive next to Delete in every session menu.

[media/demo.mp4](media/demo.mp4)

## What it does
- **Snooze** is a submenu of the session right-click menu, the session header "…" menu and the Home row menu: In 1 hour, In 3 hours, This evening, Tomorrow, Next week, each with its wake time, then Custom… (duration or calendar and time). The palette has "Snooze session…".
- A snoozed session wakes at its deadline or when it needs attention (approval, question, new work, completion). It then shows a clock until you open it. Snoozes are stored on this device and survive restarts.
- **Archive** and **Restore** use OpenCode's native archive state. Opening an archived row reads it without unarchiving. Snoozed and Archived rows have Wake, Restore and Delete… (always confirmed) in their own menus.
- Archived loads lazily. Each group shows 10 rows, and **Show N more** adds the next 25. The count reads `10+` until the last page arrives.
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
None.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Design notes: [DESIGN.md](DESIGN.md).
