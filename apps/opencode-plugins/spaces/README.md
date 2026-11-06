# Spaces

Arc's Spaces for OpenCode sessions: group your open sessions into named spaces, and move between them with the trackpad
or a row of dots at the bottom of the sidebar.

## What it does

- **Every session belongs to one space**, and a space holds many. A session that was already open joins the first space;
  anything you start joins the space you are in.
- **The sidebar shows the space you are in.** Other spaces' sessions stay open, hidden. Switching to one shows it again
  and lands on the session that space had on screen.
- **Trackpad swipes** over the sidebar change space, the way Arc does: two fingers left and right. Swiping past the last
  space reveals the strip's plus; swipe a little further and it fills, creating a space.
- **The strip** at the bottom of the sidebar carries one dot per space, the active one lit. Drag a dot sideways to
  reorder the spaces; the space you are in stays active wherever it lands. With a single space it takes no room and
  nothing is filtered.
- **Commands** (palette, and `Ctrl+Alt+←/→` for next/previous): New space…, Switch space…, Rename space…, Change space
  emoji…, Change space colour…, Delete space…, Move session to space….
- **Move to space** is also in the session's own right-click menu, above Delete…, on a tab row, a Home row and the
  session header menu.
- **The host's own keys follow the space**: `Alt+↑/↓` and `Cmd+1..9` walk the rows on screen, never a hidden session.

## Install

Register by absolute path in `~/.config/opencode/opencode.json`:

```json
"plugins": ["/path/to/apps/opencode-plugins/spaces"]
```

Kind: GUI (`gui-experimental`). A GUI half is read only on a plugin's first load, so if you add this while the service is
running, restart it once (`scripts/opencode-safe-restart.sh`); after that Cmd+R is enough.

The sidebar filter needs the **Side tabs** layout (Settings → Preferences). In top tabs or Inbox the strip stays hidden,
nothing is filtered, and a single notice says so.

## Options

None.

## How it works

- State is the plugin's own store: the spaces, the active one, which session belongs to which, and each space's last
  session. Nothing touches the host's config, and nothing is visible to vanilla OpenCode.
- The strip is one injected row inside the sidebar's own column, above its footer, so it follows collapse, resize and
  layout changes.
- Rows are filtered with one attribute plus one scoped rule; the sidebar list itself is never rebuilt.
- The plugin imports no other plugin, so it behaves the same on a plain OpenCode and beside other GUI plugins.

## Known limits

- The filter is not something the host knows about. Selection, reorder and "recently closed" still see hidden sessions;
  the keys above are intercepted to compensate, and the strip's dots are the source of truth for which space you are in.
- **Clicking** a session that belongs to another space switches to that space (as agreed), but a *hidden* row cannot be
  clicked; reach those sessions through Home, Search or the palette.
- Home still lists every session; the filter is on the sidebar only.
- A session whose space you delete moves to the first space, which is also where anything unassigned lives.
- Reorder-by-drag under a filter is untested on real hardware.

See `DESIGN.md` for the mechanism, the decisions and the evidence.
