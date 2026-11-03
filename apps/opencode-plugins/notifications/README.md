# Notifications

One place to decide which notifications reach you: toasts, tab marks and a jump key for what finishes, fails or waits for an answer, from the app itself and from your other plugins.

> **Credit:** The toast is the app's own (`ctx.toast`), system notifications and sound stay the app's (`ctx.attention`, Settings > Notifications), the titlebar pill is the app's own `TitlebarItem`, and the Settings page copies the markup of the app's own Notifications page, so app updates carry over. The jump key follows Discord's `⌘I` for its inbox. No third-party code.

## What it does
- Four kinds, the same everywhere: **needs you** (a question or permission waits for an answer; the toast stays until you answer), **error**, **done** and **info**. Each has a Toast and a Mark switch under Settings > Notifications (plugins).
- From the app's own events, with no per-plugin code: a run that finished (`done`), a run that failed (`error`), a permission or question waiting (`needs-you`). A question raised while the window was closed comes back when the window opens. The app's own system notification, sound and unread dot for these are left to the app and never repeated.
- From your plugins: the `scheduler` and `monitor` publish a task that was dropped or paused, a command that crashed or went silent, and quiet info. Any plugin can publish the same way (see [`native-ui`](../native-ui/src/notify-contract.ts)); each one still works alone, with a toast of its own, when this plugin is not installed (with several windows, in the focused one, or in just one when none has focus).
- **Tab marks** for events that start no turn (a monitor ended or restarted, a schedule dropped, a snooze woke): a small labelled glyph in the session tab's status slot, coloured by severity, gone when you open the session. A wake that starts a turn leaves no extra mark: the app's own dot already says it finished.
- **Go to next notification** (`⌘I`, rebind it in Settings > Shortcuts; also in the command palette): opens the session that needs you, then one that failed, then one that finished (the app's unread ones included), oldest first, never the one you are in, and walks the whole list on repeated presses. With nothing to jump to it does nothing, so `⌘I` still reaches the composer.
- A **titlebar pill** counts the sessions that need you or failed; click it to jump. Hidden at zero.
- The session you are looking at gets no toast for `done` or `info` (switches bring them back). `error` and `needs-you` always show. A toast has an **Open** button; an error also has **Copy details** (title and detail to the clipboard; the app closes a toast on any button, so it closes too). Each kind has its own glyph, all in the app's neutral colour: a check (done), an info mark (info), a tray (needs you) and an x (error). Errors and requests stay until you close them; done closes after 5 seconds, info after 4. Descriptions read session, then detail. The look (font, motion, layout, the contrast button on a request, the `⌘I` hint on it) comes from [`toast-style`](../toast-style), which works with or without this plugin. No toast appears in a window nobody is looking at; a waiting question appears when the window gains focus. With several windows only the focused one toasts.
- Bursts collapse: the same notification within 2 seconds is one toast, a plugin's error for a session replaces the app's "Run failed" for it, and more than five toasts a minute from one source become one "N more" toast. A source can be muted under Sources.
- System notification and sound for plugin notifications go through the app's own mechanism, so they follow Settings > Notifications. A plugin's `error` follows the **Errors** switch and its sound; `done` and `needs-you` follow **Agent** (the app's Permissions and Questions switches are for its own requests only); `info` never notifies. A sound set to *None* stays silent, and the app shows a banner only while no window has focus, once across windows. Nothing of ours plays a sound or draws a banner.

## Context
The app already shows system notifications for its own events but has no in-app notification list and no way for plugins to raise one. Plugins that publish keep working without this one; this one makes them consistent and gives you one page of switches. The app's own `Go to next unread session` (`⇧⌥↓`) walks tabs with the app's unread dot in tab order; this one adds priority, the kinds the app does not mark, and sessions without a tab. Limits: the pill's text shows on hover (the host's pill has no badge), and the tab mark needs the vertical sidebar (with `sidebar-repos` loaded its title fade also makes room for it).

## Install
Register by absolute path in `~/.config/opencode/opencode.json`:
```json
"plugins": ["/path/to/apps/opencode-plugins/notifications"]
```
Kind: GUI (`gui-experimental`). Cmd+R for GUI after a rebuild; restart the background service (`opencode service restart`) for the first load of the GUI export. `scheduler` and `monitor` need a service restart once to emit notifications (they gained an RPC event).

## Options
None. Settings > Notifications (plugins) is stored with the app's own plugin storage (three stores: delivery, marks, what is waiting).

## Development
`pnpm typecheck && pnpm test && pnpm build` (dist is tracked), `pnpm smoke` after a build. Tab-mark parity: `parity.spec.mjs`. Design notes: [DESIGN.md](DESIGN.md), evidence in [SPIKES.md](SPIKES.md).
