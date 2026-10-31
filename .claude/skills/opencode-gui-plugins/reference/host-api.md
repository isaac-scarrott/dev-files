# Host API

Everything here is typed in `node_modules/@opencode/plugin/dist/gui/*.d.ts` for the app's own version — read those files when a signature matters, and prefer them over this page. It covers `2.2.5`.

## Registries — `ctx.add(Registry, item)`

`ctx.add` returns a `Cleanup`, and an item may also be a getter (`() => item | undefined`) so it appears and disappears reactively. The host re-runs getters; keep returning the same object while it is unchanged.

| Registry | Adds | Required fields |
| --- | --- | --- |
| `Command` | A palette entry, optional keybind and slash command | `id`, `title`, `run`; `bind`, `section`, `slash`, `scope`, `enabled`, `hidden` |
| `Slot` | Content in a host slot (see below) | `at`, `render` |
| `ComposerPill` | A pill above a session's composer | `id`, `show(input)`; `menu(input)` for a popover |
| `TitlebarItem` | A pill in the titlebar or tab-strip footer | `id`, `label`; `icon`, `run`, `busy`, `pressed` |
| `Panel` | Tabs in a session's side region | `id`, `region: "side"`, `list(input)`, `render(props)` |
| `SettingsPage` | A settings page, a section on a host page, or rows in one | `id`, `title`, `render`; `page`, `section`, `entries` |
| `MenuItem` | An item in a host menu | `menu` (`session.panel` / `server.add` / `server.row`), `id`, `title`, `run` |
| `Style` | CSS the host adds to the document while contributed | a CSS string |
| `LinkHandler` | Opens local paths and URLs from messages | `match`, `open`; `exists`, `priority` |
| `Server` | Server sources the app lists (e.g. SSH hosts) | `ready`, `entries` |

The four `Slot`s:

| `at` | Where it renders | Input |
| --- | --- | --- |
| `session.header` | The timeline's title row | `screen`, `session`, `active`, `compact` |
| `window.bottom` | Full-width strip under the window, above toasts | — |
| `session.panel.end` | End of the side region's tab strip | `screen`, `session` |
| `session.location.menu` | Items in the project/location menu | `screen`, `session`, `shown` |

`ComposerPill` is the supported home for a small status/action capsule over the timeline: it floats, so showing or hiding it never resizes the composer, and it is not shown in a subagent's session.

## Context members

| Member | What it gives you |
| --- | --- |
| `ctx.tabs` | `list()` open shell tabs, `open()`, `focus()`, `move()`, `close()` |
| `ctx.sessions` | `list()` sessions of open tabs, `current()` the routed one |
| `ctx.screen` | `current()` mounted session screen: composer, comments, files |
| `ctx.layout` | Open side-panel tabs, settings/project dialogs (`ctx.layout.open(...)`) |
| `ctx.storage` | `store(key, {schema, initial, scope})` durable, `memory(key, {initial})` window-local, `remove()` |
| `ctx.commands` | `run(id)` any published command, as the palette does |
| `ctx.keybinds` | `keybind(commandId)` the effective binding for display |
| `ctx.router` | `path()` the app's route |
| `ctx.appearance` | `mode()` light/dark, `font("mono")` |
| `ctx.locale` | Locale; `ctx.t(key, params)` and `ctx.plural(key, count)` read the plugin's `i18n` catalog |
| `ctx.app` | `version`, `channel`, `platform`, `packaged` |
| `ctx.system` | Clipboard, saving files, opening URLs |
| `ctx.desktop` | Desktop-only abilities; `undefined` on the web |
| `ctx.dialogs` | `open(ctx => JSX)` — closes with the owner |
| `ctx.toast` | `show({title, variant, persistent})` → `dismiss()` |
| `ctx.attention` | `notify({title, session})` system notification + sound, only while no window is focused |
| `ctx.servers` | `list()` server ids, `get(id)` live `ServerRef` |
| `ctx.workspaces` | `on("remove", ...)` and other workspace lifecycle events |
| `ctx.ui` | Host components: `Button`, `Icon`, `Menu`, `Tooltip`, `Switch`, `TextField`, `Keybind`, `Markdown`, … |
| `ctx.embeds` | `<ctx.embeds.View id visible />` for pages the main entry created |
| `ctx.provide` / `ctx.use` | In-process contracts between plugins (`Contract.define`) |
| `ctx.main` | Client for an `Ipc` your `main(ctx)` provides |
| `ctx.signal` | Aborts when the plugin goes away; pass it to every request |

## Reactive data

Read app state inside `createEffect` / `createKeyed`; Solid tracks the reads.

```ts
for (const tab of ctx.tabs.list()) {
  const session = tab.session            // undefined for a draft tab
  if (!session) continue
  const branch = session.location
    ? session.server.data.location.vcs.info(session.location)?.branch.current
    : undefined
  const info = session.server.data.session.get(session.id)
  const project = info ? session.server.data.project.get(info.projectID) : undefined
}
```

Fetch with `sync` and it lands in the same store: `void session.server.data.location.vcs.sync(session.location)`, `session.permission.sync(id)`, `session.form.sync(id)`, `session.sync(id)`.

`ShellTab` is `{ key, session, active }`; `SessionRef` is `{ key, id, tab, server, pending, location }`; `MountedSession` adds `visit`, `project`, `listedProject`, `directory`, `local`, `background`.

## Async work

- `createKeyed(source, fn)` runs once per key — each provider generation, or each identity of a plain accessor — and owns its own cleanups. Use it for subscriptions and fetches that follow a session or contract.
- `createLatest(source, fetch)` for the latest result of a fetch; it aborts the previous request with the signal it hands you.
- Never `await` in `setup`; it must return synchronously.

## Contracts and IPC

- `Contract.define<T>("<plugin id>.<name>")` in a `contract.ts`; the provider `ctx.provide(token, impl)` from its window entry, readers `ctx.use(token)` and branch on `live.status` (`pending` / `active` / `inactive`).
- `Ipc.define({ id, methods, events, state })` for main-process work: `ctx.provide(ipc, impl)` in `main`, `ctx.main(ipc)` in the window. On the web there is no main process, so every call rejects — a plugin must keep working while it is inactive.

## i18n and options

- Declare `i18n: { en: { title: "…" } }` in the definition and read it with `ctx.t("title")`; `title` fields may be getters so they follow a locale change.
- Options from the `opencode.json` entry (`{ "package": "…", "options": { … } }`) arrive as `ctx.options`.
