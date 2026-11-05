# Spaces

Arc's Spaces for OpenCode sessions: group your open sessions into named spaces, and switch between them with one row of
dots at the bottom of the sidebar.

> **Status: milestone 1 of 6.** Spaces can be created and switched, and the choice survives a reload. The sidebar is not
> filtered yet; that is milestone 2 (see `DESIGN.md`).

## What it does

- **New space…** in the command palette creates a space (named `Space N`, with its own emoji). The bottom of the sidebar
  grows a strip of space dots once there are two, and clicking a dot switches to that space.
- **Switch space…** in the palette lists your spaces.
- Nothing changes while you have a single space: the strip stays hidden.

## Install

Register by absolute path in `~/.config/opencode/opencode.json`:

```json
"plugins": ["/path/to/apps/opencode-plugins/spaces"]
```

Kind: GUI (`gui-experimental`). A GUI half is only read on a plugin's first load, so if you add this while the service is
running, restart it once (`scripts/opencode-safe-restart.sh`); after that, Cmd+R is enough.

## Options

None yet.

## How it works

- State is the plugin's own store (`Store.global`): the spaces, which one is active, which session belongs to which, and
  each space's last session. Nothing is written to the host's config, and nothing is visible to vanilla OpenCode.
- The strip is one injected row inside the sidebar's own column, above its footer, so it follows collapse, resize and
  layout changes. It is drawn from the store, so both windows agree.
- This plugin depends on no other plugin and behaves the same on vanilla OpenCode.

## Known limits (milestone 1)

- The sidebar still shows every open session; filtering arrives in milestone 2.
- The host's `Alt+Arrow` and `Cmd+1..9` still walk all sessions, hidden or not (milestone 5).
- A space cannot yet be renamed, given another emoji, or deleted (milestone 3).
