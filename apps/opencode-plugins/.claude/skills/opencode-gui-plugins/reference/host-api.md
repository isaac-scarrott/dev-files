# Host API

Everything here is typed in `node_modules/@opencode/plugin/dist/gui/*.d.ts` for the app's own version — read those files when a signature matters, and prefer them over this page. It covers `2.2.5`. Registry behaviour (order, scope, error isolation), lifecycle, built-in versus user differences and the job-to-extension-point guide are in [host-architecture.md](host-architecture.md).

## Registries — `ctx.add(Registry, item)`

`ctx.add` returns a `Cleanup`, and an item may also be a function (`() => item | undefined`) so it appears, disappears and relabels reactively. The host re-runs the function when what it reads changes; keep returning the same object while it is unchanged. Read labels with `ctx.t` inside the function; a literal-typed field (`hidden: true`, `section`, `icon`, `menu`) needs a return annotation, `(): Command => ({ ... })`. Objects the host keeps stable (`Panel.list` tabs, items with a `render`) take getters: `get title() { return ctx.t("title") }`.

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
| `FileViewer` (`@opencode/plugin/gui/file`) | A viewer for a binary file kind | `kinds`, `View` |
| `Registry.define<T>(id)` | A list your plugin owns; others `ctx.add` to it, you read `ctx.list(Registry)` | id under your plugin id |
| `MenubarItem` (`@opencode/plugin/gui/main`, main process) | An item of the native app menu | `menu`, `id`, `label`, `run(window)` |

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
| `ctx.stores` | Stores declared in `Plugin.define({ stores })` with `Store.global(schema, initial)` (loaded before setup, `ctx.stores.name.value`) or `Store.session(...)` (`ctx.stores.name(session).value`, undefined until it loads). Prefer them over `ctx.storage`. |
| `ctx.storage` | For keys known only at runtime: `store(key, {schema, initial, scope, from})` durable, `memory(key, {initial})` window-local, `remove()` |
| `ctx.id`, `ctx.options`, `ctx.client` | The plugin's id (prefix of everything it creates), its `opencode.json` options, and the OpenCode client of the server that runs it (`ctx.client.rpc(Def)` reaches your server part; read it where you call it) |
| `ctx.list(Registry)` | Reactive list of every contribution to a registry |
| `ctx.links` | `open(link)` / `exists(link)` through the best `LinkHandler` |
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
| `ctx.ui` | The 12 host components: `Icon`, `Button`, `IconButton`, `Tooltip`, `Menu`, `Loader`, `Dialog`, `Switch`, `TextInput`, `Keybind`, `Markdown`, `Code` |
| `ctx.embeds` | `<ctx.embeds.View id visible />` for pages the main entry created |
| `ctx.provide` / `ctx.use` | In-process contracts between plugins (`Contract.define`) |
| `ctx.main` | Client for an `Ipc` your `main(ctx)` provides |
| `ctx.signal` | Aborts when the plugin goes away; pass it to every request |

## Reactive data

Read app state in render, in `createMemo`, or in a `createKeyed` source; Solid tracks the reads. The core team's plugins import no `createEffect` ([host-architecture.md §7](host-architecture.md#7-idioms-of-the-core-teams-own-plugins)).

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

- Declare `i18n: { en: { title: "…" } }` in the definition (every locale inline) and read it with `ctx.t("title")`; shared keys such as `common.*` fall through to the app. Labels follow a locale change through the function item form or getters (see Registries above).
- Options from the `opencode.json` entry (`{ "package": "…", "options": { … } }`) arrive as `ctx.options`.
