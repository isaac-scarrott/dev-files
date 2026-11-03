# notifications: design

Status: **M1 to M4 built** (hub, sink, Settings › Notifications (plugins), scheduler and monitor publish, host-derived signals, tab marks, go-to-next, titlebar count, system notification and sound through the host, window-aware fallback toast); M5 is design. One optional GUI plugin plus a tiny shared helper. Evidence for every claim marked ✔ is in [SPIKES.md](SPIKES.md); ▸ is read from the 2.2.5 source (`/tmp` extraction of `app.asar` source maps, equal to tag `v2.2.5`). The contract is built and tested: [`native-ui/src/notify-contract.ts`](../native-ui/src/notify-contract.ts) (15 tests).

## Decisions

Settled by the user (2026-11-03):

1. **Shared hub convention + one optional `notifications` plugin.** Every plugin stays independently installable and publishes through `notify(ctx, n)` from `native-ui` (relative import, bundled, no package dependency). With a sink installed the call goes to the hub; without one the plugin shows its own toast. The `notifications` plugin owns settings, de-duplication, the focus rule, system notifications and go-to-next.
2. **One model, no plugin-specific shapes.** A notification is `{kind, severity, target session, title, body?, source, key, action, persistent}`. Kinds: `done`, `needs-you`, `error`, `info`. Host session state maps into the same kinds with no plugin-specific code. Peer messages are `info`.
3. **Defaults.** `needs-you` and `error` interrupt (toast, plus system notification when no window is focused). `done` interrupts only when the session is not on screen. `info` is a quiet mark only. Every kind is overridable in Settings.
4. **Focus rule.** Suppress toast, system notification and mark for the session on screen in the focused window, except `error` and `needs-you`.
5. **Delivery.** Toast (severity colour, Open button), mark on the target session's tab/row, system notification when no window is focused, and a command *Go to next notification* (needs-you, then error, then done; opens the session, clears its mark).

Decided here from the evidence (flagged for review where marked **Q**):

6. **The host already notifies for its own session events, so the hub never duplicates them.** `shell/notifications/notification.tsx` ▸ listens to `session.execution.succeeded|failed`, `permission.asked`, `form.created` and already sends the system notification and sound (Settings › Notifications, cross-window once via `navigator.locks`), for root sessions with an open tab. For host-derived events the hub contributes only the in-app toast, the focus rule and go-to-next; the system channel for those kinds is **delegated to the host's own settings** (the page shows them read-only with a link). Plugin-sourced notifications get the hub's own system channel. **Q1**
7. **Marks: use the host's, add our own only where the host has none.** No API sets the host's unread/attention mark ✔(1). But most things already produce one: `done` and `error` end a turn (server `idle > viewed` → unread dot); `needs-you` is a pending permission/form (→ attention); a monitor or schedule wake, a peer message, a usage-limit resume all start a turn that ends the same way. The hub draws its own mark (generalised from `snooze-archive/src/woke.ts`) only for what wakes no turn: snooze woke, schedule failed/ended, monitor ended/paused, usage-limit notices, `info` generally. Clearing a host mark is `ctx.client.session.view` ✔(2) (opening the session does it anyway).
8. **Superseded by 13.** ~~System notifications from a plugin use its own main-process channel (option C), not `ctx.attention`.~~ `ctx.attention.notify` follows the host's *Agent* and *Errors* toggles, which default **off** ✔(3), and turning them on would also switch on the host's own done/error notifications. Option C: `main(ctx)` + Ipc, Electron `Notification({silent:true})` shown only when no `BrowserWindow` is focused, click → Ipc event → open the session. One process, so cross-window de-duplication is a `Map`. Unproven; spike is the first task of M4. Fallback if it fails: the renderer's `new Notification` with `document.hasFocus()` and `navigator.locks` (the host's own mechanism). **Q2**
9. **Superseded by 13.** ~~Sound is separate and off by default.~~ The plugin always passes `sound:false` and never plays one unless a kind's *Sound* cell is on (✔(3): the host plays sounds even for a focused window, which is exactly the "background test run" noise to avoid). Do-not-disturb silences every channel but the marks. **Q3**
10. **Server halves publish by RPC event** (✔(5)): each adds `events: { notify: { schema: serverNotificationSchema } }` to its Rpc definition and calls `reg.events.emit("notify", n)`. The `notifications` plugin reads every `rpc.<id>.notify` event from `ctx.client.event.subscribe` ✔ without importing a definition; a plugin with a GUI half may instead call `notify(ctx, …)` itself. No new channel, no synthetic messages.
11. **Boundary: feedback is not a notification.** A toast that answers the user's own click (`snooze-archive` "Session action failed", `monitor`/`scheduler` "no longer running", `no-project` "failed", `usage-resume` "saveFailed", `blindfold` stored) stays a direct `ctx.toast`. Notifications are asynchronous events about a session the user is not looking at.
12. **No default on `mod+enter`; the key is `mod+i`** (Cmd plus one key, no Shift), rebindable. Changed from `mod+e` in M3 after checking the conventions of other apps. See Keystroke.

Revised by the user's answers (2026-11-03), which replace the parts of 6, 8 and 9 and of M4 that conflict:

13. **The host's mechanism, not our own.** System notification and sound for plugin-sourced alerts go through `ctx.attention.notify` and follow Settings › Notifications (Agent, Errors, the sound choices). No Electron `Notification`, no `main` entry, no sound cells of our own, no *System*/*Sound* cells in the page: the page shows one read-only row that links to the host page. Built in M1: the sink calls `attention.notify` for a plugin's `needs-you`/`error`/`done` (`info` never), `variant:"error"` for `error`, the host's `id` option (`source·key·at`) so two windows send it once, max 1 per session per 30 s and 6 a minute. Host-derived signals never call it (the host does).
14. **A wake that starts a turn leaves no extra mark**; only events that start no turn get an info mark (M3).
15. **Server halves publish; the GUI half re-publishes when there is one.** A server half emits one RPC event `notify` (payload without `target.server`: it does not know the host's id for its server, the GUI side fills in the desktop's own). A plugin with a GUI half (`scheduler`, `monitor`) calls `acquirePublisher(ctx.id)` and `notifyFromServer(ctx, event.data)`: a sink if one is installed, else a toast of its own with Open. The hub's generic `rpc.*.notify` reader skips sources that announced a publisher, so nothing arrives twice. Server-only plugins reach the hub through the generic reader.
16. **A transient toast needs a focused window; a persistent one waits.** `document.hasFocus()` is the test; a held `needs-you` is shown on the window's `focus` event. (Changes "toasts are skipped, not replayed" for persistent ones only.)
17. **Burst rules** (sink): same `(source, key)` or same `(source, kind, session)` inside 2 s is one, except persistent requests (two permissions for one session are two); more than 5 toasts a source a minute collapse into one "N more" toast that refreshes at most every 1.5 s (a toast per event made 300 events block the window for 12 s: measured).
18. **Requests wait 250 ms before a persistent toast** and show only if still pending: an auto-approved permission is replied at once and never toasts. A permission or question for a subagent with no tab of its own is shown on its root's tab. Only sessions with an open tab notify, as the host does.
19. **Settings are one declared `Store.global`** (`toast` per kind, `onScreen` for `done`/`info`, `muted` sources). Marks (M3) get a store of their own: a field added to a stored struct fails to decode and drops what was saved.
20. **The page is named "Notifications (plugins)"** (user, 2026-11-03), not "Alerts" (the host's own page is "Notifications", which cannot be extended). Text, nav entry, command titles, README and these Decisions say so. The `SettingsPage` id stays `alerts`, as do the `data-action="alerts-*"` hooks and entry ids: nothing stored is keyed by them (stores are declared by name), but links and the parity scripts are.
21. **Marks only for what starts no turn, drawn only by us for plugin-sourced entries** (M3). Host-derived `done`/`error`/`needs-you` stay the host's dot or attention mark. The Mark switch of a kind turns the glyph off; the entry still counts for go-to-next. One ledger (`ledger.ts`) feeds the marks, the pill and the key; plugin-sourced, non-persistent entries are stored (`pending` store, capped at 200) so a reload keeps the marks; requests (`needs-you`) are never stored, the signals rebuild them. A session the user is looking at leaves nothing waiting except a request.

Verified in M4 (harness, 2.2.5; evidence in [SPIKES.md](SPIKES.md) § M4):

22. **What `ctx.attention.notify` does, and what the sink therefore sends.** The host reads two toggles only: `variant:"error"` follows *Errors*, every other variant follows *Agent* (both default off); the *Permissions* and *Questions* toggles are not reachable from a plugin. So a plugin's `error` follows Errors, and its `done` and `needs-you` follow Agent; `info` never calls it. The sound follows *Agent* or *Errors* sound (`None` silences it) and does not depend on the banner toggle, as for the host's own events. The host shows the banner only when no window has focus (the web `Notification` is `silent:true`; a click shows the window and opens the session). One `id` is claimed once across windows. The sink's id is `source·key·at`, and a server half stamps `at` once, so every window computes the same id for one event (without that stamp two windows would each show a banner). Because the host plays the sound even for a focused window, the sink skips the call for `done` on the session on screen (decision 4); `error` and `needs-you` still call it.
23. **The fallback toast is window-aware** (`native-ui/src/notify-contract.ts`). With no hub, each window's plugin copy would toast the same event. The focused window shows it; when none has focus, one window does, chosen by claiming the event id (a Web Lock around a `localStorage` list). "A window has focus" is read from the host's own `opencode:notification-focus` lock, held shared in every focused window, so the host's focus bookkeeping is reused and nothing of ours holds a lock. The decision is asynchronous, so the toast appears a few milliseconds late; `clearNotification` or a newer toast with the same key cancels a pending one. Without `document` or Web Locks (a test, a server half) the toast shows at once.
24. **No DND, no sound cells, no `main` entry** (M4 closes decision 13). Nothing in the plugin plays a sound or creates a system notification; all of it is the host's.

## Keystroke: what Cmd+Enter does in 2.2.5

Re-extracted from the installed app; checked in the harness ✔(7).

| Where | Behaviour | Source |
|---|---|---|
| Composer | `Enter` (no shift, not composing) submits; **`⌘/Ctrl+Enter` submits with the opposite delivery**: while a turn runs it steers if Settings › *Follow-up behavior* is *queue* (default is *steer*, so ⌘⏎ queues), and the "Steer ⌘⏎ / Queue ⌘⏎" hint button shows only while a turn runs and the draft is non-empty | `composer/editor/editor.tsx:341-346, 456, 1389-1420`, `session/composer/queue.ts:497-506`, `settings/general/general.tsx:124` |
| Question dock (classic + experimental) | `⌘/Ctrl+Enter` advances / submits (`aria-keyshortcuts="Meta+Enter Control+Enter"`) | `requests/question-keys.ts:40`, `session-question-dock-classic.tsx:473`, `…experimental.tsx:1276` |
| MCP elicitation dock | `⌘/Ctrl+Enter` submits | `requests/session-elicitation-dock.tsx:123` |
| Line-comment editor | `Mod+Enter` = alternate submit | `ui/src/data-display/line-comment/line-comment.tsx:105` |
| Settings › Shortcuts | no row; `mod+enter` is not a command keybind (not in the command table) | `settings/keybinds/keybinds.tsx` |
| Electron menu / macOS | no accelerator `Cmd+Enter`; no system-wide macOS binding | `shell/commands/desktop-menu.ts` (Cmd+, N, Shift+N, Shift+W, Shift+B, Ctrl+\`, Cmd+0 only) |

The decisive fact: the host's global shortcut handler is a **capture listener on `document`** and it skips editable targets only for *unmodified* keys (`shell/commands/command.tsx:508-545`). A plugin `Command` bound to `mod+enter` therefore runs first even inside the composer and calls `stopPropagation` ✔: the composer's ⌘⏎ (steer/queue) and the docks' ⌘⏎ would stop working. Declining (`run` returns `false`) or `scope` (a CSS selector for the event target, `runtime/plugin/commands.tsx:54`) avoids it, but then the shortcut only works when focus is *outside* the composer, which is where the user is while working.

**Decision (user: Cmd plus one other key, no Shift, and what other apps use: Jakob's law): `mod+i`.** Candidates and what was found:

| Key | In other apps | In this host | Verdict |
|---|---|---|---|
| `Cmd/Ctrl+I` | **Discord: "Toggle Mentions Popout" (Ctrl+I; Cmd+I on macOS, listed as "Open inbox")**: the one widely used single-modifier key for "my notifications" ([Discord hotkeys](https://support.discord.com/hc/en-us/articles/225977308-Discord-Keyboard-Shortcuts), [list with the macOS column](https://www.guidingtech.com/discord-keyboard-shortcuts/)). Italic in rich-text editors is the only competing meaning. | Not bound anywhere (checked: every `keybind:` in the 2.2.5 renderer source, the `desktop-menu.ts` accelerators, our plugins). The composer is a plain `contenteditable` (`composer/editor/editor.tsx:297`), so Chromium would italicise on Cmd+I, but the prompt is plain text. | **chosen** |
| `Cmd+E` | Discord: emoji picker. Chrome/macOS: use selection for find. No notification meaning anywhere. | free | runner-up; rebind to it if `⌘I` ever bothers |
| `Cmd+Shift+A` / `Cmd+Shift+M` | Slack: all unreads / mentions | free | excluded: Shift |
| `g n`, `g i` sequences | GitHub, Linear, Gmail | the host has no chord support | excluded: not "Cmd and one key" |
| `Shift+Alt+↓` | Discord and Slack: next unread channel | **taken**: host `session.next.unseen` | already there, a different job (below) |

Taken by the host, so not chosen: mod+u (attach), mod+j, mod+k, mod+p, mod+o, mod+b, mod+f, mod+t, mod+n, mod+w, mod+, and `mod+1`..`mod+9`; macOS-owned: mod+h, mod+m, mod+q, mod+r. The key reaches the composer when ours has nowhere to go: `run()` returns `false` synchronously (SDK: the event "goes on to its target"), verified in the harness (the `keydown` for ⌘I reached the composer unprevented when only the open session was waiting). When something is waiting, ⌘I jumps and the composer does not italicise: acceptable for a plain-text prompt.

The host's `session.next.unseen` (`shift+alt+arrowdown`, `titlebar/tab-strip.tsx:462`) cycles the **visible tabs** whose unread dot shows, in tab order, with no priority and nothing for sessions without a tab. Ours adds priority (needs-you, error, done), plugin notifications, the host's unread sessions with no tab, and the pill count. The host exposes no way to extend its command, so the two coexist: the host's walks the tab strip, ours walks what is most urgent.

## Inventory

Delivery columns are the **defaults**; every cell is overridable. T = toast, M = mark, S = system. `focus` = the focus rule applies (`on-screen+focused → suppressed`; `error`/`needs-you` ignore it).

### Host-derived (no plugin code; one mapper in `notifications`)

| Event (how detected) | Kind | Target | Key | Default | Clears on |
|---|---|---|---|---|---|
| `session.execution.succeeded` on a root session (`data.on`), not while a direct child still runs (host's `hasRunningChild`) | `done` | the session | `host:done:<sid>` | T only if not on screen; M = host unread dot (native); S = host's (Q1) | opening the session (`session.view`) |
| `session.execution.failed` | `error` | the session (root of a subagent) | `host:error:<sid>` | T always; M = host unread dot; S = host's | opening it |
| `permission.asked` (not when the project auto-approves: `settings.permissions.autoApproves`) | `needs-you`, persistent | root session (or the subagent tab if open) | `host:perm:<requestID>` | T persistent always; M = host attention (native); S = host's | `permission.replied` (same id) |
| `form.created` with `form.metadata.kind` ∈ `question`, `mcp-elicitation`, `websearch.provider` | `needs-you`, persistent | same | `host:form:<formID>` | as above | `form.replied` / `form.cancelled` |
| Startup / reconnect | reconcile | `data.session.list()` + `permission.sync(id)`/`form.sync(id)` for sessions with unread or pending requests | | marks and persistent toasts rebuilt without events (events are ephemeral) | |

Not mapped: subagent sessions' `done` (host skips `parentID`; the parent's run covers it), `session.execution.started`, `inbox.enqueued` (used only to detect user activity for de-dupe).

### Plugin-sourced (each emits `notify`)

| Plugin | Event | Kind | Target | Key | Default | Today |
|---|---|---|---|---|---|---|
| snooze-archive | Woke from snooze (attention / new work / completed / deadline) | `info` | the session | `snooze-archive:woke:<sid>` | M (its clock mark, kept); no T | mark only |
| scheduler (server) | Run fired | `info` | target session | `scheduler:run:<jobId>@<slot>` | none (the wake starts a turn → host `done`); counted in Settings log only | silent |
| scheduler | Job dropped after 3 failed deliveries / `delivery failed` | `error` | target session | `scheduler:failed:<jobId>` | T, M, S | silent (log) |
| scheduler | Ended: reached `maxRuns`, ran once, target archived or deleted | `info` | target (if it still exists) | `scheduler:ended:<jobId>` | M | silent |
| scheduler | Loop guard paused a job | `error` (warning severity) | target | `scheduler:loop:<jobId>` | T, M | non-waking synthetic notice |
| monitor (server) | Started / restarted after a service restart / lost at restart | `info` | woken session | `monitor:state:<id>:<seq>` | M | wake message with a notice |
| monitor | Ended (exit, TTL, `maxEvents`, stop) | `info` | woken session | `monitor:ended:<id>` | M | wake message |
| monitor | Non-zero exit, 3 failed wakes, paused by the rate cap | `error` (warning for the cap) | woken session | `monitor:error:<id>` | T, M, S | wake message / silent |
| usage-resume (server) | Usage limit hit, session stalled | `error` | the session | `usage-resume:limit:<sid>` | T, M, S; **merged** with the host's `execution.failed` error for the same session (see De-dupe) | `retry` hook + timeline notice |
| usage-resume | Resume scheduled "Resumes 14:05" / resumed | `info` | the session | `usage-resume:resume:<sid>` | M | `session.synthetic` notice, `resume:false` |
| usage-resume | Gave up (attempt cap) | `error` | the session | `usage-resume:giveup:<sid>` | T, M, S | silent |
| orchestrator-tools (server) | Peer message received | `info` | recipient session | `orchestrator-tools:peer:<messageID>` | M | injected row (stays) |
| orchestrator-tools | (not built today: `notify_when_idle`) | `done` | the awaited session | | covered by host `done` | n/a |
| blindfold | Secret requested | `needs-you`, persistent | the session | `blindfold:secret:<name>` | T, M, S (later; check its dialog first) | dialog |
| cache-warning | none today ("Not done: no notification or sound") | | | | stays out | |
| claude-proxy, file-viewer, model-picker, session-drag, timeline-rail, sidebar-repos, visual-replies, no-project | none | | | | | |

A wake (monitor, scheduler, peer, usage-resume resume) ends as a normal turn, so its outcome arrives as the host-derived `done`/`error` for free. The `info` notification marks the moment *before* that and the events that start no turn.

## The model

`native-ui/src/notify-contract.ts` (built):

```ts
type NotifyKind = "done" | "needs-you" | "error" | "info"
interface Notification { v; kind; severity; target?: {server, session}; title; body?; source; key; action?: {type:"open-session"} | {type:"open-message", message}; persistent; at }
notify(ctx, input): "hub" | "fallback" | "none"      // never throws
clearNotification(ctx, key)
acquirePublisher(source): release                     // setup/cleanup, ref-counted per source
provideSink(sink): release                            // notifications plugin only; newest sink with a known major answers
normalize(raw, source): Notification | undefined      // for foreign payloads: unknown kind → info, fields clipped
serverNotificationSchema, sourceOfEvent(type)         // server halves
```

- **Registry**: `globalThis[Symbol.for("opencode-plugins.notify.v1")] = { v, publishers: Map<source, refs>, sinks: NotifySink[] }`, created on first use, deleted at zero references (✔ reload test). Module state is normally banned by the host idioms; this is the same sanctioned exception as the injected rows' shared observer.
- **Versioning**: the major is in the key. A future v2 sink also registers under the v1 key with `accepts: [1, 2]` and reads v1 messages; a v1 publisher meeting a sink that accepts only `[2]` finds no sink and falls back to its toast. Within a major: fields only get added; readers ignore unknown fields and map unknown kinds to `info`.
- **Fallback** (no sink): `needs-you`/`error`/`done` → the plugin's own `ctx.toast` (variant error/success/default, persistent for `needs-you`, *Open* when `ctx.tabs` and a target exist); `info` → nothing (it would be new noise). The same key replaces the previous fallback toast; `clearNotification` dismisses it.
- **Server half**: emits the RPC event; the sink creates the Notification with `source = <rpc id>`. `normalize` rejects an event without a title and clips the rest. Server halves cannot see window focus, so they never decide delivery.
- **Load order**: a notification published before the sink installs is shown as a fallback toast; none are queued (a queue would leak across reloads). The sink installs in `setup`, synchronously, so only a plugin that loads earlier and publishes during its own `setup` is affected.

## Delivery matrix (defaults)

| Kind | Toast | Mark | System | Sound | Focus rule |
|---|---|---|---|---|---|
| `needs-you` | yes, persistent until answered | yes | yes, when no window focused | off | ignored: always |
| `error` | yes | yes | yes, when no window focused | off | ignored: always |
| `done` | only if the session is not on screen (no toast in an unfocused window) | yes (M3) | host's, for plugin sources only | host's | applies |
| `info` | off | yes | off | off | applies |

"On screen" = the session of the active tab (`ctx.tabs.list()` `active`) in a window with `document.hasFocus()`. With no focused window nothing is "on screen": toasts are skipped (nobody sees them), marks and system notifications carry the message, and the toast is not replayed. Toasts show only in the focused window. Rule order: DND → per-source mute → focus rule → cell → channel.

## De-dupe, throttle, replace

All in the sink, in this order:

1. **Replace**: same `(source, key)` replaces the live toast and mark entry; never stacks.
2. **Burst collapse**: the same `(source, key)` or the same `(source, kind, session)` within 2 s is one (the scheduler fired six identical wakes in one incident; every server instance of a plugin also emits).
3. **Cross-source merge per session**: within 10 s, a plugin `error` for a session absorbs the host's `execution.failed` `error` for it (the more specific title wins; usage-resume "Usage limit reached, resumes 14:05" replaces "Run failed"). Higher kind wins the one mark per session: `needs-you > error > done > info`.
4. **Per-source rate**: more than 5 toasts per source per minute → the rest become one "N more from <source>" toast; marks still update. System notifications: max 1 per session per 30 s, 6 per minute overall.
5. **Cross-window**: toasts only in the focused window; system notifications come from `main`, so there is one by construction. The host's `opencode:notification-*` localStorage claim is not touched.
6. **Retract**: `needs-you` clears on its `replied`/`cancelled` event or on `clearNotification`; others clear when the session is opened (focused window, tab active) or by *Clear*.

## Marks

- Host kinds: nothing drawn; the host's dot/ring is the mark. Opening clears it.
- Plugin kinds (`source` not the hub itself): a small mark in the vertical tab's trailing status slot (`native-ui/src/tab-marks.ts`, generalised from `snooze-archive/src/woke.ts`): same 20px box, 4px from the row end and on the same centre line as the host's `tab-status` (measured equal; parity spec `parity.spec.mjs`), the host's hover swap with the close button, hidden for the open tab and while the host shows attention. Info, success, warning and error each have a glyph (not colour alone) and the host's `--v2-state-fg-*` token; `role="img"` with the notification's title as `aria-label`; one mark per session (highest kind, newest). The hub's own observer (`dom-hub.ts`: scoped to the sidebar, filtered attributes, one rAF) wakes only while a mark exists. A tab with a mark carries `data-notify`, which `sidebar-repos` lists beside `data-sa-woke` so its title fade makes room. Top-tab layout and Home rows: no mark (the vertical sidebar is the layout the row plugins act in; Home shows the host's unread).
- The Mark switch per kind is on by default. `snooze-archive`'s own clock is unchanged (**TODO M5**: its `data-sa-woke*` hooks are named by `sidebar-repos` and its tests, so the move onto `createTabMarks` waits for M5, which publishes snooze-woke as `info`).
- The titlebar item (`TitlebarItem`, the host's own pill with the `notifications` icon) reads "N waiting" on hover and counts sessions with a `needs-you` or an `error`; its accessible name carries the shortcut. Absent at zero. The registry has no badge field, so the count is the hover label and the name, not a drawn number.

## Go to next notification

`Command` `go-to-next` (`mod+i`, rebindable; palette under Navigation; the titlebar pill). The stops are the ledger's `needs-you`, `error` and `done` entries (`info` marks but is not a stop) plus the host's unread roots, read on demand from `data.session.list()` (`time.idle > time.viewed`; archived and subagents out). One stop per session at its highest kind, oldest first within a kind, never the session on screen, and after the last one visited (taken from the previous walk, so a cleared stop still marks the place): repeated presses visit every stop. It opens the session (`ctx.tabs.open(..., {focus:true})`; the host clears its own unread dot on opening) and drops the session's transient ledger entries; a request that still needs an answer stays until the host reports it answered. When nothing is waiting, or only the open session is, `run()` returns `false`: no toast, and the key goes on to the focused element. From the palette that is a silent no-op.

## Settings page

A `SettingsPage` (`id: "alerts"` kept, title "Notifications (plugins)"; the host's *Notifications* page cannot be extended and the name is taken). **Built in M1:** Toasts (one switch per kind, plus *for the session on screen* for `done` and `info`), System notification and sound (one read-only row with an Open button to the host page), Sources (one switch per publisher). **M3:** each kind row carries two switches, Toast and Mark (own `marks` store). There is no Quiet section yet. Built from the host's `SettingsList`/row conventions through `ctx.ui` (`Switch`, a `Select`):

- **Delivery**: rows per kind (Needs you, Error, Done, Info) × columns Toast · Mark · System · Sound; each cell a `Switch`, plus *When the session is on screen* (Hide / Show) for `done` and `info`. Host-derived rows show a read-only System/Sound cell: "Uses Settings › Notifications" with a link (`ctx.layout.settings("notifications")`). **Q1**
- **Quiet**: Do not disturb (switch; optional "until I turn it off"); *Mute a source* (one row per announced publisher from `publishers()` plus sources seen on the event stream).
- **Shortcut**: the effective `go-to-next` binding via `ctx.ui.Keybind` and a link to Shortcuts.
- Stored in `Store.global`: `{ cells: Record<kind, {toast,mark,system,sound}>, onScreen: {done,info}, dnd, muted: string[] }`, defaults as in the matrix. `entries` list every row so search finds them.

## Accessibility

Toasts are the host's (live region). The mark has an `aria-label`; the persistent toast and the titlebar item are keyboard reachable; go-to-next is a command, so it works from the palette. Severity is conveyed by icon and text as well as colour. Reduced motion: no animation of ours.

## Performance bar

Idle cost zero: no timer, interval, poll or observer of its own. Work happens on events the host already emits (`data.on` per server, one `client.event.subscribe` iterator, `tabs.list()` memo). The mark observer is the one shared sidebar observer and does nothing while no mark is live. The sink does O(1) work per notification. Toast timers are the host's. Measure with `scripts/perf.mjs` (null-plugin baseline) on the *idle*, *switch* and *stream* scenarios and a notification burst (200 events/s for 5 s) before M3 is done; PASS = within the bars in `performance.md`.

## Failure modes and degradation

| Missing / failing | Behaviour |
|---|---|
| `notifications` plugin not installed | each plugin's own toast (`needs-you`/`error`/`done`), `info` silent; host's own notifications unaffected |
| A source plugin not installed | its row is missing from *Mute a source*; nothing else changes |
| Sink throws | that call falls back to a toast; the next call tries the sink again |
| Server half with no GUI half | still reaches the hub through the generic `rpc.*.notify` reader; without the `notifications` plugin it is invisible (server has no toast API) |
| Window opened after an ephemeral event | reconcile from `data.session` + `sync` at startup/reconnect; non-persistent toasts are not replayed |
| `ctx.client` event stream drops | the iterator is restarted with backoff by `createKeyed`; marks keep their state; a reconcile runs on reconnect |
| Main-process channel unavailable (web, failed load) | system channel off, a quiet row in Settings says so; toasts and marks continue |
| Two windows | one focused-window toast, one system notification (the host claims the event id once across windows), marks derived per window from the same data; without the hub, the fallback toast shows in the focused window, or in one window when none has focus |
| Version mismatch | by major in the registry key; a publisher with no compatible sink falls back |
| Two instances of one server plugin (per project location) | duplicates collapse by rule 2 |
| Plugin reload | publishers re-acquire; the sink reinstalls; live toasts of the old run close with it (host behaviour) |

## Migration plan

| Plugin | Change |
|---|---|
| native-ui | adds `notify-contract.ts` (done) and, in M3, the mark component generalised from `woke.ts` |
| snooze-archive | woke: `notify(ctx, {kind:"info", key, target})` and keep drawing its clock only when no sink is present; user-action toasts unchanged |
| monitor | **done (M1)**: `events.notify` on `MonitorControl`; emits error (non-zero exit, 3 failed wakes), warning (hourly cap), info (ended, restarted, lost); stopping on request says nothing. GUI: `acquirePublisher` + `notifyFromServer`; the "no longer running" toast unchanged |
| scheduler | **done (M1)**: `events.notify` on `ScheduleControl`; emits error (dropped after 3 failed deliveries), warning (loop-guard pause), info (ran its last run, session archived or deleted). GUI: `acquirePublisher` + `notifyFromServer` |
| usage-resume | server: emit limit / resume scheduled / resumed / gave-up via its existing Rpc; the timeline `synthetic` notices stay (they are the record) |
| orchestrator-tools | server: emit `info` per peer message (it already knows the recipient) |
| blindfold | later: `needs-you` for a pending secret, after reading how its dialog is shown |
| others | none |

Each migration is an additive `events.notify` plus a few `emit` calls; nothing is removed, so an old `notifications` plugin and a new source (or the reverse) still work.

## Build plan

Every milestone ends in something the user can see.

1. **M1 Hub + plugin skeleton + settings (built).** `notifications` package, sink, Settings › *Notifications (plugins)* matrix persisted, `info`/`error` toasts from the sink. Migrate **scheduler** and **monitor** server halves. *Visible*: a scheduled job that fails to deliver shows a toast with *Open*; flipping the cell in Settings turns it off. Unit tests for the policy functions (matrix, focus rule, de-dupe).
2. **M2 Host-derived signals (built).** `data.on` mapper, startup reconcile, persistent `needs-you` toasts cleared on `replied`/`cancelled`, focus rule. *Visible*: a question in a background session raises a toast that disappears when answered; the session on screen raises none for `done`.
3. **M3 Marks + go-to-next + titlebar item (built).** Shared mark in native-ui (`tab-marks.ts`; parity spec `parity.spec.mjs` against the host status slot: 72 pass, 0 fail, 10 n/a), command and `mod+i`, count item. *Visible*: *Go to next notification* cycles needs-you → error → done and clears marks. Parity, stress (hundreds of pending), perf table.
4. **M4 System notifications via the host (built).** The `attention.notify` call of M1 was exercised with the host's Agent/Errors switches on and off, the sound set to a clip and to *None*, one and two windows, and real monitor and scheduler events (decisions 22 to 24). Fixed on the way: the focus rule now also keeps the host's sound quiet for a `done` on the session on screen, and the fallback toast is window-aware. No `main` entry, no sound cells, no DND.
5. **M5 Migrate the rest** (usage-resume, snooze-archive, orchestrator-tools, blindfold) and write the README with media.

## Open questions

Settled by the user's answers: Q1 (host keeps system notification and sound for its own events), Q2 and Q3 (the host's mechanism and sound setting, decision 13), Q4 (`mod+i`, decision 12), Q5 (the name, decision 20) and wake marks (decision 14). Still open: Q6 whether `info` from peer messages should mark at all (M5).
