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

- System notifications from the plugin's own channel (option C in DESIGN: `main(ctx)` + Electron `Notification` + `BrowserWindow.isFocused`). Reading the SDK says it works (`electron` is allowed in main); not run. First task of milestone 4.
- The enabled `ctx.attention.notify` path (needs the host setting on and a real unfocused window).
- Pending permission/question for a session that was never synced: `permission.list(id)` needs `permission.sync(id)` first (snooze-archive does this); events cover live changes, a sync covers startup.
- Events are ephemeral (`permission.asked`, `form.created` are `ephemeral(...)` in `schema/src/{permission,form}.ts`): a window opened after the event never sees it. Startup reconciliation by `sync` is in the design.
