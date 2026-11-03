# notifications: spike evidence

Run 2026-11-03 on OpenCode Desktop 2.2.5 in the private harness (`desktop-harness.sh`, root `/private/tmp/oc-harness-notify`, CDP 9333, service 49555, workspace Z, `--mute-audio`, `NODE_OPTIONS=--max-old-space-size=1500`, every script under `perl -e 'alarm N'`). One run, stopped afterwards (`lsof` on 9333/49555 empty). The user's app and service (49374) were not touched. `window.Notification` and `window.Audio` were stubbed in the page so nothing was shown or heard.

The probe plugin (`notify-spike`: a server half registering an Rpc with a `notify` event, and a GUI half exposing probes on `window.__spike`) is throwaway and lives in `/tmp/oc-spike`; the code that carries each result is quoted below.

| # | Question | Result | Evidence |
|---|---|---|---|
| 1 | Set the host's unread/attention mark on a session's tab or row | **No** | `unread` is `needsAttention(pending permission/form) \|\| (session.time.idle > session.time.viewed)`, both server data (`app/src/shell/layout/project-avatar-state.ts:25-41`, `notification.tsx isSessionUnread`). No registry, `ctx` member or `.d.ts` field writes either. `data.session.setStatus/apply/remember` exist on the live `ServerRef.data` (listed in the harness) but are untyped internals; not used. Own mark: injected DOM, as `snooze-archive/src/woke.ts` does. |
| 2 | Clear the host's unread mark | **Yes** | `ctx.client.session.view({ sessionID, idle })` → `time.viewed` became equal to `time.idle` on the next read (`viewed: 1793700973884 = idle`). Same call the host makes (`notification.tsx view()`). Opening the session already does it. |
| 3 | `ctx.attention.notify` with sound; control it | **Yes (sound), gated (system)** | `{sound:false}` → `{notification:false, sound:false}`; default → `{sound:true}` and the stubbed `Audio` got the clip **while the window was focused** (sound is not focus-gated; `host-apis.tsx:1013-1050`). Same `id` again → `{sound:false}` (once across windows). System notification: `false` in the harness: the call follows the host's own settings, and the defaults are `notifications: { agent: false, permissions: true, questions: true, errors: false }` (`settings/model.tsx:316`); `variant:"default"` reads `agent`, `"error"` reads `errors`; `platform.notify` also asks the main process whether the window is focused and creates a `silent:true` web `Notification` (`src/renderer/platform/notifications.ts`). Not exercised: the enabled path (would show a banner). |
| 4 | Read host session states for ALL sessions, cheaply, event-driven | **Yes** | `ctx.servers.get(id).data.session.list()` listed both seeded sessions while only a draft tab was open; `.status(id)` = `idle`; `.permission.list(id)`, `.form.list(id)`, `.pending.list(id)`, `.root(id)`, `.family(id)` exist. `data.on(type, fn)` fired `session.inbox.enqueued`, `session.execution.started`, `session.execution.failed` for the **non-open** child session within 200 ms of `POST /api/session/{id}/synthetic` (no model: it failed, which also proves `execution.failed` arrives). Six `data.on` registrations, no polling. |
| 5 | Server half pushes an event to the GUI | **Yes** | Server: `const reg = await ctx.rpc.register(Def, handlers); await reg.events.emit("notify", data)`. GUI: `ctx.client.rpc(Def).events.on("notify", fn, {signal})` delivered `{key,kind,at}`; and **a generic reader works**: iterating `ctx.client.event.subscribe({signal})` and filtering `type.startsWith("rpc.")` delivered `rpc.notify-spike.notify` with the same data. A hub therefore needs no import of any plugin's Rpc definition. |
| 6 | Window-level hub survives hot reload of one plugin without leaking | **Yes** | `window[Symbol.for("opencode-plugins.notify.v1")] = {refs, sinks}` acquired in `setup`, released in the cleanup. After rebuilding the bundle: `setups` 1 → 2, `window` global kept, `refs` = 1 (old released), one sink entry (the new one), and one `emit` produced exactly one `rpc.typed` and one `rpc.generic` event (no duplicate subscription). Unit tests (`native-ui/src/notify-contract.test.ts`) cover the overlapped reload order (new setup before old cleanup) and removal of the registry at zero. |
| 7 | `mod+enter` as a plugin keybind | **Collides** | A `Command` with `bind:"mod+enter"` ran while the composer was focused and **swallowed the key** (`cmdenter.run`, composer text stayed `hello`). With `run()` returning `false` the key reached the composer: `session.inbox.enqueued` + `execution.started`, composer emptied. See DESIGN § Keystroke. |

## Quoted probe code

```ts
// server.ts
const reg = await ctx.rpc.register(Spike, { emit: async (input) => { await reg.events.emit("notify", { key: input.key, kind: "info", at: Date.now() }); return { ok: true } } })
// gui.ts
ctx.client.rpc(Spike).events.on("notify", (e) => rec("rpc.typed", e.data), { signal: ctx.signal })
for await (const e of ctx.client.event.subscribe({ signal: ctx.signal })) if (String(e.type).startsWith("rpc.")) rec("rpc.generic", e)
const s = ctx.servers.get(id); s.data.on("session.execution.failed", (e) => rec("failed", e.data.sessionID))
ctx.add(Command, { id: "cmdenter", title: "Spike mod+enter", bind: "mod+enter", run: () => { rec("cmdenter.run"); if (window.__decline) return false } })
```

## Not proved (carried as risks in DESIGN.md)

- Pending permission/question for a session that was never synced: `permission.list(id)` needs `permission.sync(id)` first (snooze-archive does this); events cover live changes, a sync covers startup.
- Events are ephemeral (`permission.asked`, `form.created` are `ephemeral(...)` in `schema/src/{permission,form}.ts`): a window opened after the event never sees it. Startup reconciliation by `sync` is in the design.

## M4: system notification and sound through the host (2026-11-03, 2.2.5)

Private harness (`desktop-harness.sh`, root `/private/tmp/oc-harness-notify4`, `--mute-audio`, workspace Z, main-process inspector on 9230 via `OC_HARNESS_INSPECT`), a scripted OpenAI-compatible stub provider so real tools run (`execute` → `tools.monitor.start`, `tools.scheduler.schedule_task`, `shell`), every script under `perl -e 'alarm N'`; the harness, the stub and every leftover process stopped afterwards. The window cannot be focused for real without taking the user's focus, so **focus is emulated**: `document.hasFocus` plus `focus`/`blur` events in the page (what the host's coordinator reads) and `BrowserWindow.isFocused` patched in the main process (what `platform.notify` asks over IPC). The page's `Notification` and `Audio` are replaced by recorders, so no banner was shown and no sound played; the constructor call (title, body, `silent:true`) is what the OS would receive. **A real macOS banner was not observed.**

| # | Question | Result | Evidence |
|---|---|---|---|
| 8 | What `ctx.attention.notify` gates on | **Agent / Errors only** | `host-apis.tsx` `notify`: `error` → `settings.notifications.errors`, else `.agent`; sound `options.sound !== false && (error ? sounds.errorsEnabled : sounds.agentEnabled)`; key `plugin:<plugin>\0<id>`; `coordinator.system`: claim in `localStorage["opencode:notification-system"]` (shared by windows, taken even when the call then returns because a window is focused), skip when this document has focus, skip when another window holds the shared `opencode:notification-focus` lock; `platform.notify` asks main `isFocused` again and makes a `silent:true` `Notification` whose click shows the window and opens the session |
| 9 | Per-kind mapping with the toggles (sink publish, source `probe`) | **as designed** | Agent off, Errors off: 0 banners. Agent on, Errors on: banners `error`, `done`, `needs-you`, none for `info`. Agent on, Errors off: `done` and `needs-you` only. Agent off, Errors on: `error` only |
| 10 | Sound | **host's choice** | Sound plays for `error`, `done`, `needs-you` (error clip ≠ agent clip), never for `info`, whatever the banner toggles say (host behaviour for its own events too). Setting both sounds to *None* in the host page: 0 audio, the banner still shown |
| 11 | Focus | **host's** | main `isFocused` true (patched) → no banner; document focused → no banner (claim burned) |
| 12 | Click | **routes** | calling the recorded notification's `onclick` opened and selected the target session's tab |
| 13 | Two windows (second real window: main-process `Menu` item *New Window*), same event in both | **one banner** | probe event with a shared `at`: one banner (window A); A focused: no banner, toast in A only; B focused: toast in B only; none focused: one banner, no transient toast. Real monitor crash (`exit 4`) with both windows unfocused: one banner, `Monitor stopped · "crash-S6" exited with code 4`; the claim list holds one id `plugin:notifications·monitor·monitor:error:<id>·<server at>` |
| 14 | Fallback toast, no hub, two windows, real monitor crash | **one window** | none focused: one toast (window B); A focused: A only; B focused: B only (`native-ui` `notify-contract.ts`, 4 unit tests) |
| 15 | Real scheduler failure | **toast with Open** | the stored job's session id was corrupted in the harness database; three failed reads one minute apart ended in `Scheduled task dropped · "sched-fail" could not be delivered 3 times in a row` with *Open*, in the focused window |
| 16 | Permission | **persistent toast, retracted** | a `shell` call that asks (`rm -rf`): `Permission needed` toast (the host's own sound played too); *Allow once* removed it. With the host command *Auto-accept permissions for this project* on, no `Permission needed` toast appeared (mutation observer over 3.5 s); only the host's own "Auto-accepting permissions" toast |

Not observed: a real banner (recorders stand in for the OS), a really focused window (emulated as above), a natural failed `session.prompt` (it accepted a prompt even with the project directory moved away; the scheduler failure above is a failed `session.get`), the Permissions/Questions toggles (not reachable from a plugin).
