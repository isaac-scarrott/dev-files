# Session drag

Drag a sidebar session row sideways into the chat to attach it as a "Session" chip the model can read.

[media/demo.mp4](media/demo.mp4)

## What it does
- Press a session row in the sidebar (a live tab, or a Snoozed or Archived row from snooze-archive) and move sideways. A chip with the title follows the pointer and the native "Drop files to add" overlay rises over the session.
- Release inside the session: a native "Session" chip joins the composer's context row and the prompt takes focus. Release elsewhere, or press Esc: nothing changes.
- The model receives `The user referenced session @session:<id> ("title").` The orchestrate tools take that id as is.
- Clicking the chip opens the session. A vertical move still reorders tabs and a plain click still switches.
- Palette: "Reference session…" picks a session by name and attaches the same chip.

## Context
Typing `@` in the composer already mentions a session, but only from the keyboard. The host blocks HTML drag and drop from sidebar rows, so this listens for pointer events ahead of the host's, decides sideways or vertical on the first 4px, and attaches the chip through the composer's public API. The limit: the drop target is the session panel, not the composer box.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/session-drag"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI.

## Options
None.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked). Design notes: [DESIGN.md](DESIGN.md).
