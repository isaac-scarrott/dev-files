# Host architecture: how OpenCode builds plugins

How the host itself is built from plugins, and what that means for ours. Read it to choose an extension point, predict lifecycle and error behaviour, or copy the core team's idioms. API fields live in [host-api.md](host-api.md); host DOM facts live in [dom-map.md](dom-map.md).

Verified on OpenCode 2.2.5 (tag `v2.2.5`, `9bbb8ce18c80`). The installed renderer sources equal that tag (✔ `host.tsx`, `root.tsx`, `core.ts`, `registries.ts` diffed from `app.asar` source maps), so read the tag instead of unpacking the app. `dev` at `288fa12843` (2026-11-01) differs from the tag in the plugin SDK and window host by one `side-region.tsx` line.

- **`R:path:line`** = `https://github.com/anomalyco/opencode/blob/v2.2.5/packages/<path>#L<line>`; the same path resolves in a local clone.
- **✔** observed in a private harness (`opencode-cli serve` on a throwaway root, or the isolated desktop app); **▸** read from source, not run; **?** unverified.

## 1. Premise verdict

"Everything in OpenCode is a plugin, even internally": **true for features, false for the shell and the services.** The team states it as the design: "the app's own features are built-in plugins on the same SDK" (PR #55246) and "every feature ... that is not the core shell is a built-in GUI plugin" (`R:gui-plugins/README.md:3`).

| Layer | Built-in plugins | Still core (not a plugin) |
| --- | --- | --- |
| Server | ✔ 92 in `/api/plugin` (`source.type: "builtin"`, id `opencode.*`, `features: {server: true}`): providers 31, tools 19, config adapters 18, model prompts 7, web search 5, VCS 2, plus agent, plan, command, skill, goal, mcp defaults, models.dev, wellknown, browser, warming. List: `R:core/src/plugin/internal.ts:228` (`pre`), `:269` (`post`) | The services the plugins edit through `ctx.<domain>.transform`: Session, Permission, Mcp manager, Config, Credential, Bus, KV, Formatter, Worktree, Shell ... (`R:core/src/plugin/internal.ts:116`) |
| TUI | ▸ 14 (home/prompt footers, btw, sidebar context/limit/mcp/todo/footer, notifications, plugins, stats, merman, latex, diff viewer) loaded as `source: "builtin"` (`R:tui/src/plugin/builtins.ts:17`, `R:tui/src/plugin/context.tsx:316`) | Routes, prompt, theme, renderer |
| GUI window | ✔ 15 (context, btw, debug, terminal, file, review, details, browser, pairing, updater, ssh, wsl, microsoft-office, sources, goal): `R:gui-plugins/src/renderer.ts:39` | The shell: sidebar/titlebar tabs, session timeline and rows, composer body, settings frame, model and project pickers, session menus, Home, Extensions page |
| Desktop main | ▸ 6 with a `main.ts` (debug, browser, pairing, updater, ssh, wsl): `R:gui-plugins/src/main.ts:19` | Electron shell, windows, storage host |

A user plugin enters the same registries, the same lifecycle and the same error boundaries as a built-in. The differences are listed in [§4](#4-built-in-versus-user-plugin).

## 2. Anatomy of a plugin

One package, up to four parts, one `@opencode/plugin` dependency (`services/www/src/docs/content/build/plugins/index.mdx`):

| Part | Export | Definition | Runs in | Id |
| --- | --- | --- | --- | --- |
| Server | `.` or `./server` | `Plugin.define({ id, setup(ctx) })` (Promise) or `{ id, effect }` (Effect) | OpenCode server, per location | declared |
| TUI | `./tui` | `Plugin.define({ id, setup(ctx) })` | terminal UI | declared |
| GUI | `./gui-experimental` (prebuilt `.cjs`/`.js` only) | `Plugin.define({ os?, stores?, i18n?, setup?, main? })` | every window (`setup`), Electron main once (`main`) | **assigned**: the server part's id, else the package name, else the directory name |
| RPC | `./rpc` | `Rpc.define({ id, methods, events })` | server implements; other parts call (`ctx.client.rpc(Def)`) | declared |

GUI definition (`R:plugin/src/gui/plugin.ts:77`, `declarations.ts`): `os`, `stores`, `i18n` are read before any setup runs; contracts are not declared, they are provided at runtime. Built-ins declare identically; "built-in" is only the flag of the list that loads them (`R:gui-plugins/AGENTS.md`, Structure).

Built-in layout (one folder each, `R:gui-plugins/README.md:26`):

```text
src/<id>/index.ts       Plugin.define({ os?, stores?, i18n })  the manifest
src/<id>/contract.ts    tokens others may import: Ipc, Contract, Registry (no runtime code)
src/<id>/renderer.tsx   window entry: const setup: Plugin.Setup<typeof definition>
src/<id>/main.ts        main entry: Plugin.MainSetup (desktop only)
src/<id>/page.tsx       heavy UI behind lazy()
src/<id>/i18n/en.ts     copy
```

Config registration (`R:schema/src/config/plugin.ts`): `"plugins": [ "pkg", "pkg@1.2.0", "./dir", "/abs/dir", "file:///dir", { "package": "...", "options": { ... } } ]`. Options are a plain `Record<string, unknown>` with no host-side schema; the plugin validates them (GUI options must be JSON). Entries apply in order; `-id` disables, `*` and `prefix.*` select (`services/www/src/docs/content/plugins.mdx`, Control). Relative paths resolve from the config file; configured local paths must be directories. The desktop loads GUIs only from the global `opencode.json(c)`.

## 3. Lifecycle

### Server (▸ unless marked)

1. `PluginSupervisor` orders plugins `internal.pre` + SDK + instance, then **user packages**, then `internal.post` (`R:core/src/plugin/supervisor.ts:98`, `:150`). ✔ `/api/plugin` lists `arch-p1` between `opencode.warming` and `opencode.config.instruction`. User plugins run after the built-ins that precede them and before the config adapters.
2. `Plugin.activate` diffs by `(id, revision)`. Only the unchanged **prefix** stays alive; the first changed plugin and every plugin after it are torn down in reverse and set up again in order (`R:core/src/plugin.ts:128`, `:141`). Editing one user plugin therefore re-runs the `post` built-ins.
3. A new revision that fails to load keeps the previous generation running (`R:core/src/plugin/supervisor.ts` `retained`; `R:core/src/plugin.ts:172`).
4. Triggers: config change, watched files of a local plugin's import graph and GUI bundle, `plugin.updated`, update checks, every 24 h; bursts debounce 100 ms (`R:core/src/plugin/supervisor.ts:203`). Content decides, not mtime: `touch` changes nothing.
5. Ids must be unique; the first in boot order wins, later duplicates fail (`R:core/src/plugin/supervisor.ts:104`). `-` removal skips two guarded ids: the policy plugin and the `opencode` provider (`R:core/src/plugin/internal.ts:293`).
6. **Features are fixed per service lifetime.** `features.gui`/`server`/`tui`/`rpc` come from `Host.resolve` at load (`R:core/src/plugin/module.ts:147`, `R:plugin/src/host.ts:18`). ✔ After the service started, adding `"./gui-experimental"` to `package.json` plus the file did not set `features.gui`, and neither did a server-entry content change nor a config change; `GET /api/plugin/gui` answered `PluginNotFoundError`. After a service restart `features.gui` was `true`. Cause **?** (likely the Bun resolver caching `package.json`, `R:util/src/runtime/import.bun.ts`). Build the bundle and its `exports` entry **before** the plugin's first load.
7. ✔ Once the GUI exists at start, a rebuild changes `revision`, and so does an options change; the same GUI code is then served again (`GET /api/plugin/gui?id=`).

### GUI

```text
server plugin.list() (features.gui, not source builtin)   R:plugin/src/gui/host.ts:383
  -> main: pluginIdAvailable() reserved check              R:plugin/src/gui/host.ts:317
  -> main: GET /api/plugin/gui?id= {code, revision, options}, evaluates `main` once per revision
  -> every window: pluginGuis message -> evaluate bundle once per revision   R:app/src/runtime/plugin/plugins.tsx:88
  -> window host: Entry (new object per revision) -> forget(old) + activate(new)   R:app/src/runtime/plugin/host.tsx:901
```

- **Load source**: only the desktop's own server; the web app and remote SSH/WSL/HTTP servers load no third-party GUI (`R:app/src/runtime/plugin/plugins.tsx:21`; issue #60976 asks for the web). ✔ `opencode serve` never loads GUIs.
- **Revision** = sha256 of `[operation, server version or installed revision, bundle bytes]` (`R:core/src/plugin/module.ts:154`). A local bundle is watched; an installed package's GUI changes with its version.
- **States**: `loading` -> `active` | `failed`; `disabled`. A failed plugin waits for Reload or a new revision (`R:app/src/runtime/plugin/host.tsx:946`).
- **Startup gate**: the app renders once every built-in settled; user plugins never hold it (`R:app/src/runtime/plugin/host.tsx:879`, `:883`).
- **Setup** runs synchronously under the plugin's Solid root and `untrack` (`host.tsx:453`); an async setup is rejected after its body ran ✔ (log `[plugin] <id> Error: Window setup must be synchronous...`, `host.tsx:468`).
- **Reload semantics** ✔: a rebuild re-evaluates the bundle and runs `setup` again in the same window (a `window` global survived, setup counter 1 -> 2), registrations of the old run are withdrawn (no duplicate nodes or `<style>`), and an options change reloads the same way. Page reload (Cmd+R) re-evaluates everything. A GUI-only rebuild leaves the server entry running (docs); a server-entry change reloads the GUI too, because the revision hashes the server version.
- **Teardown**: `dispose` aborts `ctx.signal`, runs cleanups in reverse, removes every entry in one `batch` (`host.tsx:833`). A registration made after its owner ended is withdrawn at once (`late()`, `host.tsx:523`).
- **Enable**: built-ins always run; others follow the saved switch (default on), which turns off the desktop UI only (`R:plugin/src/gui/host.ts:89`). A plugin whose `os` excludes this system never runs.
- **Reserved ids**: every built-in id, ids nested under or over one, and the `opencode` namespace (`R:plugin/src/gui/host.ts:317`). ✔ A package named `terminal` never loaded. Built-in ids: context, btw, debug, terminal, file, review, details, browser, pairing, updater, ssh, wsl, microsoft-office, sources, goal.
- **Bundle trust**: the code runs through `new Function("require", "module", "exports", code)` (`R:plugin/src/gui/host.ts:251`) with full renderer privileges. The public API is an ergonomics and stability boundary, not a sandbox.

### Error isolation

| Fault | Result | Evidence |
| --- | --- | --- |
| Setup throws, rejects, or returns a promise | Plugin `failed`, every registration withdrawn, shown with its error in Extensions › Plugins | ✔ `host.tsx:438`, `:468` |
| Effect throws in the plugin root | Same (`catchError` -> `crash`) | ▸ `host.tsx:453` |
| A contribution's `render` throws | That contribution renders nothing, error recorded (`phase: "render"`), siblings and the plugin stay | ✔ three `session.header` slots, the middle one threw, the others rendered |
| A cleanup throws | Isolated; the other cleanups run | ▸ `host.tsx:502` |
| Bundle fails to evaluate or has the wrong shape | Entry that fails; only that plugin | ▸ `R:app/src/runtime/plugin/module.ts:41` |
| Main-side finalizer throws or hangs | Logged; the rest run; 3 s deadline | ▸ `R:plugin/src/gui/scope.ts` |
| Server transform fails | Plugin disabled with an `err_xxxxxxxx` ref | ▸ `R:core/src/plugin.ts:68` |

## 4. Built-in versus user plugin

Registration:

| | Built-in | User plugin |
| --- | --- | --- |
| Server | `internal.pre`/`post` arrays of `{ id: "opencode.<area>.<name>", effect }`, `source: "builtin"` | `plugins` config entry, `source: "local"` or `"package"` |
| TUI | array in `tui/src/plugin/builtins.ts`, merged as `source: "builtin"` and can be disabled with `-id` (`R:tui/src/plugin/context.tsx:321`) | `cli.json` or the server's list |
| GUI | `compose({ id: definition })` lists with lazy `windowEntry`/`mainEntry` (`R:plugin/src/gui/host.ts:56`); window host's `definitions = [...builtins, ...plugins]` (`R:app/src/runtime/plugin/root.tsx:65`) | `./gui-experimental` bundle from the server list |

`PluginInfo.source.type: "builtin"` means a **server** built-in. GUI built-ins never appear in `/api/plugin`; a server built-in never ships a GUI (`shipsPluginGui`, `host.ts:383`). Settings › Extensions › Plugins hides built-ins unless one failed (`R:app/src/runtime/plugin/extension-plugins.tsx:24`).

Same API or private hooks: **the same context plus extras.** Gaps between internal and external power:

| Capability | Built-in | User plugin (2.2.5) |
| --- | --- | --- |
| Server: core services | `yield* Config.Service`, `Session.Service` ... via the captured Effect context (`R:core/src/plugin/internal.ts:297`, e.g. `R:core/src/tool/plugin/glob.ts:46`) | `ctx.<domain>` only (client-shaped API) |
| Server: placement | `pre` before user plugins, `post` after | between them |
| TUI | imports app components directly (`R:tui/src/feature-plugins/sidebar/todo.tsx`) | `Plugin.Context` |
| GUI: components | imports `@opencode/ui/*`, `@opencode/session-ui`, Kobalte, TanStack in 65 source files | `ctx.ui`: 12 components |
| GUI: modules | any workspace package; real code splitting (`lazy`, `onIdle`) | `pluginSharedModules` + `pluginWindowModules` only; one file, dynamic `import()` inlined; build fails on others (`R:plugin/src/gui/modules.ts:10`) |
| GUI: extra fields | `BuiltinCommand.follows`, `BuiltinPanel.legacy`, `BuiltinPanelTab.first`/`dom`, `BuiltinStore` imports from app keys, `builtinContext` (`desktop.forceFocus`, `locale.setDirection`), `builtinMainContext` (`lifecycle.restart`, main store imports), `builtinCatalog` lazy locales, `onIdle` (`R:plugin/src/gui/builtin.ts`) | none |
| GUI: extra slots | `session.location.workspace` (replaces the location row), `session.location.branch.menu`, `session.location.path.menu` through `BuiltinSlot` (`builtin.ts:100`) | the four public slots |
| GUI: privilege is type-level | the `Builtin*` registries share the public ids (`"slot"`, `"command"`, `"panel"`); the host reads items through them | ✔ a user plugin that passed `at: "session.location.workspace"` to the public `Slot` rendered in that slot. Unsupported: the team can tighten it. |
| GUI: lifecycle | always runs, no switch, gates startup, first in every ordering | switch, async, after built-ins |
| GUI: storage | `from` imports parts of the app's own keys | `from` imports own older keys |

Both packages are co-versioned, so built-in CSS may reference host ids and classes (`#review-panel`, `data-slot`). A user plugin never gets that guarantee.

## 5. Registry contracts

Fields: [host-api.md](host-api.md). This table lists behaviour. All registries are per window; a plugin adds with `ctx.add(Registry, item | () => item | undefined)`.

| Registry | Host consumes it in | Order | Contract notes |
| --- | --- | --- | --- |
| `Command` | palette, keybinds, slash (`R:app/src/runtime/plugin/commands.tsx:14`) | definition order (built-ins first), then registration | Published as `<plugin>.<id>`. Same published id from several owners: the newest wins (`pluginCommandItems`). `run` returns `false` synchronously to decline the key. `enabled: false` drops palette entry and keybind. `scope` is a CSS selector for focus. |
| `MenuItem` | + menu of the side panel, Add server, server row | `order` ascending | Fields are typed per `menu`; a field the menu ignores fails to compile. `primary` (first by `order`) makes + run directly. |
| `Panel` | side region strip, mobile switcher (`R:app/src/runtime/plugin/panels.tsx`) | tab order from `list`; pinned first | `list` is reactive and returns the **same tab object** while unchanged. `render` runs once per tab and receives getters; a session switch does not remount. Tab key `<plugin>:<id>`. `fallback`, `restored`, `closed`/`restore` are in the SDK TSDoc. |
| `SettingsPage` | settings nav and search (`R:app/src/runtime/plugin/settings-pages.ts`) | after the app's pages | `entries` are indexed without mounting. Page, a section on `general`/`servers`, or rows in the General section. Objects with `render` are kept stable: labels from getters. |
| `Server` | server list and startup | `order` | Startup waits until every source is `ready`; a ready source's entries are the complete inventory. |
| `LinkHandler` | message markdown links, composer chips (`host.tsx:271`) | highest `priority`, tie: first contributed | `exists` defaults to `false`, so text never looks like a link. Local links only. |
| `TitlebarItem` | titlebar pill / tabs footer | contribution order | The pill element survives while `id` stays. |
| `ComposerPill` | row above each mounted composer (`R:app/src/session/composer/plugin-pills.tsx:49`) | `order`; app pills first | `show` runs per composer, reactive. Floats over the timeline, so it never resizes the composer. Hidden in a subagent's session. `menu` gives a host-owned popover (placement, focus, dismissal) around your content. |
| `Slot` | `window.bottom` (`R:app/src/shell/shell.tsx:309`), `session.header`, `session.location.menu`, `session.panel.end` (`R:app/src/runtime/plugin/render.tsx:49`) | `order` ascending | Render once; reactivity inside updates it. `session.header` exists per cached timeline (`active: false` while hidden). `session.*` slots get a non-null `screen`. |
| `Style` | `<style data-plugin="<id>">` in `document.head` (`render.tsx:71`) | contribution order | ✔ A plugin's style comes after the built-ins', so equal specificity favours the plugin. |
| `FileViewer` (`gui/file`) | file view for binary kinds | n/a | A viewer lists `kinds`; text files have no viewer registry (#59797 closed not planned). |
| `Registry.define<T>(id)` | your own | n/a | Others contribute with `ctx.add`; you read with `ctx.list(Registry)`. Id under your plugin id. |
| `MenubarItem` (`gui/main`) | native app menu | n/a | Main process only. |

Contribution rules (`host.tsx:699`):

- A function item runs in a `createMemo` under the current owner; returning `undefined` withdraws it; the host keeps the same item object while the returned value is `===` (`host.tsx:221`).
- Each entry gets key `<plugin>/<n>`; the returned cleanup removes it; the owner's end removes it too.
- Registries are the extension surface: they **add**. Only built-ins replace host UI (the `session.location.workspace` row), and the host exposes no replace or wrap point to user plugins.

Contracts the app provides to plugins: `FileTree`, `OpenInApp`, `FileViewer` (`gui/file`), `Changes` (`gui/review`), `Browser` (`gui/browser`, `inactive` on the web). Follow one with `ctx.use(token)` and handle `pending`/`inactive`.

## 6. Scope, ownership and context

- **Window**: `setup` runs once per window. `Store.global` and `ctx.storage` persist under `plugin.<id>.<key>` (main: namespace `plugin.<id>`). `main` runs once per app; windows reach it with `ctx.main(Ipc)`.
- **Owner**: everything registered through `ctx` ends with the current Solid owner (component, `createKeyed` run), else with the plugin. `createKeyed` roots its runs so late registrations dispose immediately (`R:plugin/src/gui/reactive.ts:62`).
- **Session**: a routed session is a frozen `MountedSession`; another session arrives through the same getters without a remount. Key per-session state by `session.key`; key per-screen caches by the `SessionScreen`. `ctx.screen.current()` and `ctx.sessions.current()` are undefined on Home, on a draft and during the first render.
- **Server**: read `session.server.client`, `data`, `url` from the live `ServerRef` every time; a restarted server gets a new controller under the same id.
- **Cross-plugin**: `ctx.provide(Contract, impl)` only under your id; `ctx.use(token)` returns `Accessor<Live<T>>` (`pending` | `active` with `generation` | `inactive` `disabled`|`failed`). Ipc is `inactive` on the web.
- **Before the interface mounts** no host API throws: reads return defaults, writes (including dialogs) wait and apply in call order.
- **Per-session state in the host**: declared `Store.session` loads when a session mounts.
- **Server client**: `ctx.client` is the OpenCode client of the server that runs the plugin; call your server part with `ctx.client.rpc(Def)`.

## 7. Idioms of the core team's own plugins

Sources: `R:gui-plugins/AGENTS.md` (rules), `R:gui-plugins/README.md` (guide with source-checked blocks), `.oxlintrc.json:74`, `script/ast-grep/gui-plugins/`. Enforced by `bun run lint`.

- **Effects**: `createEffect`/`createRenderEffect`/`createComputed` are banned imports in built-ins. Side effects that sync with something outside Solid (DOM, widget, embed, Ipc subscription) go through `createKeyed(source, fn, { otherwise, equals })`; async data through `createLatest`; per-visit state through `createVisitState`; derived values through `createMemo`; user-action logic in the handler. No effect chains, no effect that sets a signal from another signal.
- **State**: no module-level `let`, `Map`, `Set`, `createSignal`, `createStore` (ast-grep `gui-plugin-no-module-state`); state lives in `setup`, `ctx.stores`, or `ctx.storage`. Declare stores with `Store.global`/`Store.session` so the desktop's async storage never races a read; key objects by fields (`equals`).
- **Imports**: never `@opencode/app`, `@opencode/desktop` or `@/`; other plugins only through their `contract.ts`; CSS with `?inline` plus `ctx.add(Style, css)`; heavy UI behind `lazy()` with its own `<Suspense>` and an idle `preload`.
- **Contributions**: labels in function form (`ctx.add(Command, () => ({ title: ctx.t("open") }))`) or getters on stable objects; a literal-typed field needs a return annotation `(): Command => (...)`; return stable objects from `Panel.list`.
- **Failure is a state**: branch every `ctx.use(token)()` on `Live`; offer an action only while it can answer; no silent `return`, no endless spinner. After each `await` in `main`, return if `ctx.signal` aborted.
- **Panels/slots**: read `props.session`, `input.session`, `state.session` where used; no destructuring of getters; no work on timeline rows (`session.header` is the timeline's only surface).
- **Copy**: each plugin owns `i18n/en.ts` with short keys; `ctx.plural` for counts; shared vocabulary comes from `common.*`.
- **DOM**: built-ins keep to their own markup (`data-slot`, `data-component` attributes on nodes they render). Across `gui-plugins/src`, `document.querySelector` appears only in the `debug` plugin (3 calls); `getElementById` targets ids the terminal and review plugins render themselves; no `MutationObserver` outside the updater.
- **Tests**: unit tests beside the code for contract-carrying logic (paths, migrations, protocols); user-visible behaviour in the app's keeper e2e suites (`R:app/e2e/regression/`); a main entry through its `Ipc` contract with real inputs; lifetime races (reload during async setup, store loading late, Ipc going away). The real window host runs in component tests with a graph matrix that boots the built-ins with each one disabled in turn (`R:app/component-tests/plugin-graph.spec.ts`). The SDK ships **no test helpers** (no `./testing` export).
- **Docs as a gate**: every SDK export, member and parameter has TSDoc; `script/sdk-docs.ts` fails lint on a missing one and on a guide block that differs from its shipping source.
- **Server plugins**: `id: "opencode.<area>.<name>"`, `Effect.fn("<Name>.Plugin")`, services bound to named variables before use, `export * as X from "./x.js"` namespaces, Layer nodes (`makeLocationNode({ name, layer, deps })`), tests with in-memory fixtures (`R:core/test/plugin/fixture.ts`) and recorded HTTP for providers.
- **Style**: no aliased or star imports, no `else`, no needless destructuring or single-use helpers; `SAFETY:` comments only for checked invariants (`R:AGENTS.md`).

## 8. Public and internal boundary

| Public (`@opencode/plugin`) | Workspace-only (exported `null` when published) |
| --- | --- |
| `.`, `./effect`, `./tui`, `./rpc`, `./host`, `./runtime`; `./gui`, `./gui/main`, `./gui/file`, `./gui/review`, `./gui/browser`, `./gui/vite` | `./gui/host` (hosts' protocol, `evaluatePluginBundle`), `./gui/builtin`, `./gui/updater`, and any other `./gui/*` (`R:plugin/package.json:30`, `R:plugin/script/pack.ts:7`) |

- The bundle may require only: `effect`, `@opencode/plugin/gui`, `/gui/main`, `@opencode/plugin/rpc`, `@opencode/schema/rpc`, `@opencode/client`, `/client/effect` in both processes; `solid-js`, `/web`, `/store`, `@opencode/client/solid`, `gui/{file,review,browser}` in windows; `electron` and Node built-ins in main. The other process gets inert placeholders (`R:plugin/src/gui/modules.ts`).
- The GUI API is `-experimental`: "may change between releases". No API version handshake exists; a bundle that does not match the host fails alone. Pin `@opencode/plugin` to the installed app version.
- **Not API**: host DOM and CSS classes, `data-*` hooks, command ids of the app (`ctx.commands.run` runs them, "not a stable API", PR #59469), `--v2-*` tokens (observed, stable in practice), storage keys of the app.
- **No extension point in 2.2.5** (host DOM is the only route): sidebar/titlebar tab rows and their menus, session context menu, timeline rows and message parts, composer body, model picker dialog, project picker rows, Extensions page rows, Home content (`Panel.home` closed not planned, #59802), side panel width per tab (#60389 open), `LinkHandler` for external URLs (#59798 closed not planned), omitting a built-in (#59799 closed not planned).

## 9. Decision guide

| Job | Use | Notes |
| --- | --- | --- |
| Action in the palette, with a key or `/name` | `Command` | `ctx.layout.draft`, `ctx.tabs`, `composer.*` cover most actions |
| Status or action capsule near the composer, with a popover | `ComposerPill` (`menu` for your own content) | host-owned placement; no subagent sessions |
| Button or readout in the session title row | `Slot` `session.header` | honour `compact`, `active` |
| Strip across the window bottom | `Slot` `window.bottom` | |
| Items in the project/location menu | `Slot` `session.location.menu` | subscribe only while `shown` |
| Action at the end of the side tab strip | `Slot` `session.panel.end` | |
| A tab with arbitrary content beside the chat | `Panel` + `MenuItem` `session.panel` launcher | `mobile` view for narrow screens |
| Titlebar pill | `TitlebarItem` | |
| Settings | `SettingsPage` (page, section, or rows) + `Store.global` | |
| Open a path, or render a file kind | `LinkHandler`, `FileViewer` | |
| Modal UI, confirmation, input | `ctx.dialogs.open` + `ctx.ui.Dialog`; `confirm`/`prompt`/`select`/`alert` | |
| Transient feedback, system notification | `ctx.toast`, `ctx.attention.notify` | notify only while no window is focused |
| Native look | `ctx.ui` (12 components), then [native-ui.md](native-ui.md) | |
| CSS | `ctx.add(Style, css)` with attribute-scoped rules | |
| Read or change the composer | `ctx.screen.current()?.composer` | read at the call, not in setup |
| Node or Electron work | `main` + `Ipc`; windows call `ctx.main(Ipc)` | inactive on the web |
| An API for other plugins | `Contract` (window) or `Ipc` (main) in `contract.ts`; own list: `Registry.define` | consumers handle `Live` |
| Model tools, hooks, background work | server part; GUI calls it through `ctx.client.rpc` | |
| Persisted state | declared `Store.global`/`Store.session`; runtime keys: `ctx.storage.store` | |
| Anything in the "no extension point" list in [§8](#8-public-and-internal-boundary) | isolated DOM injection per [dom-map.md](dom-map.md), or an upstream request | state which in the plugin's `DESIGN.md` |

## 10. Anti-patterns

| Instead of | Do |
| --- | --- |
| `createEffect` to sync the DOM or a subscription | `createKeyed(source, fn, { otherwise })`: it runs per value or provider generation and owns its cleanups |
| `createEffect` that fetches then sets | `createLatest(source, fetch)` (aborts stale requests) |
| Module-level `Map`/`Set`/`let`/signal | state in `setup` or `ctx.stores`; module state survives reload and leaks across windows |
| `async setup` | sync `setup`; async work in `createKeyed`/`createLatest` with `ctx.signal` |
| Reading `ctx.sessions.current()` once in setup | read where used; `session.key` for per-session state |
| Destructuring `props`/`input` of a panel or slot | read `props.session` where used |
| Keeping `server.client`/`data` | read the live `ServerRef` each time |
| Fixed `title: ctx.t(...)` | function item `() => ({ ... })` or a getter on a stable object |
| Importing a sibling's code | its `contract.ts` tokens plus `ctx.use` |
| Silent return when a dependency is missing | branch on `Live`, show an unavailable state |
| Timeline row work | `session.header` slot (the only timeline surface), or a panel |
| Adding `exports` or the GUI file after the service started | build first, then add the plugin; restart the service once if it was resolved without a GUI |
| Typing around a `Builtin*` token | none: it works today and is not supported |

## 11. Version notes and open questions

- Plugin SDK and window host are identical between `v2.2.5` and `dev` (2026-11-01) except one `side-region.tsx` line. GUI plugins shipped in v2.2.0 (2026-10-27, PR #55246), so the API is days old.
- Open upstream issues that touch us: #58647 (absolute-path plugin dirs silently not loaded, v2.0.32), #59750 (one unreadable `package.json` empties the plugin list), #59859 (local plugins resolve through `exports`), #58922 (a plugin can take a guarded internal id), #60976 (GUI on the web), #60389 (per-tab side panel width).
- Closed not planned: `Panel.home`, `Command.scopeLabel`, external `LinkHandler`, `createVisitState` for drafts, text `FileViewer`, omit-a-built-in (#59797 to #59802). A missing extension point is not a promise that one will come.
- **?** Cause of the fixed-features behaviour (§3.6). **?** Whether `session.location.branch.menu` and `path.menu` accept user items (code path identical, not rendered in the harness: the probe project had no branch). **?** Whether a bundle that is absent at first resolution is retried later (only the `exports`-added case was tested).
- Source of this document: repo clone at `v2.2.5`; `services/www/src/docs/content/build/plugins/gui/index.mdx` (the page behind https://opencode.ai/v2/docs/build/plugins/gui); PRs #55246, #59469, #59489; `/api/plugin` and a three-plugin probe on a throwaway root (torn down).
