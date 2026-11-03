# Notifications

One place to decide which alerts reach you: toasts for what finishes, fails or waits for an answer, from the app itself and from your other plugins.

> **Credit:** The toast is the app's own (`ctx.toast`) and system notifications and sound stay the app's (`ctx.attention`, Settings > Notifications), so app updates carry over. The Settings page copies the markup of the app's own Notifications page. No third-party code.

## What it does
- Four kinds, the same everywhere: **needs you** (a question or permission waits for an answer; the toast stays until you answer), **error**, **done** and **info**. Each has an on/off switch under Settings > Alerts.
- From the app's own events, with no per-plugin code: a run that finished (`done`), a run that failed (`error`), a permission or question waiting (`needs-you`). A question raised while the window was closed comes back when the window opens. The app's own system notification and sound for these are left to the app and are never repeated.
- From your plugins: the `scheduler` and `monitor` publish a task that was dropped or paused, a command that crashed or went silent, and quiet info. Any plugin can publish the same way (see [`native-ui`](../native-ui/src/notify-contract.ts)); each one still works alone, with a toast of its own, when this plugin is not installed.
- The session you are looking at gets no toast for `done` or `info` (switches bring them back). `error` and `needs-you` always show. A toast has an **Open** button that goes to the session. No toast appears in a window nobody is looking at; a waiting question appears when the window gains focus.
- Bursts collapse: the same alert within 2 seconds is one toast, a plugin's error for a session replaces the app's "Run failed" for it, and more than five toasts a minute from one source become one "N more" toast. A source can be muted under Sources.
- System notification and sound for plugin alerts go through the app's own mechanism, so they follow Settings > Notifications (the Agent and Errors switches, the sound choices). Nothing of ours plays a sound.

## Context
The app already shows system notifications for its own events but has no in-app alert and no way for plugins to raise one. Plugins that publish keep working without this one; this one makes them consistent and gives you one page of switches. Not built yet: marks on session tabs, the go-to-next command (planned key: Cmd+E) and the titlebar count.

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/notifications"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI after a rebuild; restart the background service (`opencode service restart`) for the first load of the GUI export. `scheduler` and `monitor` need a service restart once to emit alerts (they gained an RPC event).

## Options
None. Settings > Alerts is stored with the app's own plugin storage.

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked), `pnpm smoke` after a build. Design notes: [DESIGN.md](DESIGN.md), evidence in [SPIKES.md](SPIKES.md).
