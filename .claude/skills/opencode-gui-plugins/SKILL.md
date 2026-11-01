---
name: opencode-gui-plugins
description: Build or debug OpenCode Desktop GUI plugins and prove their UI matches the host (native parity). Use for any desktop UI change (sidebar rows, context menus, popovers, header buttons, chat timeline, composer, panels), a plugin element that must look and behave like the app's own, plugin loading/build failures, GUI plugin registration, or porting another app's feature into OpenCode as a plugin.
---

A GUI plugin is a normal OpenCode plugin package whose `./gui-experimental` export is a CommonJS bundle the desktop app loads into every window. It registers into public registries (`Command`, `Slot`, `ComposerPill`, `Panel`, `SettingsPage`, `TitlebarItem`, `Style`, `MenuItem`, `LinkHandler`, `Server`), reads the app's reactive state through `ctx`, and — only when no registry fits — injects DOM. Nothing in the app bundle is patched; the installed `.app` stays untouched.

Plugins are registered by absolute path in `~/.config/opencode/opencode.json`:

```json
"plugins": ["/Users/isaac/git/dev-files/apps/opencode-plugins/sidebar-repos"]
```

## Branches

- Choosing where a piece of UI belongs, or the host API's shape → [reference/host-api.md](reference/host-api.md)
- A row, button, menu, popover or avatar that must look like the app's own → [reference/native-ui.md](reference/native-ui.md)
- Proving a UI change matches its native sibling, writing or reading a parity spec or report → [reference/native-parity.md](reference/native-parity.md)
- Touching the app's real DOM or CSS (sidebar tabs, timeline, status marks) → [reference/dom-map.md](reference/dom-map.md)
- An icon the catalog lacks, or which catalog icon to use → [reference/icons.md](reference/icons.md)
- Any transition, fade or accordion → [reference/animation.md](reference/animation.md)
- Running a plugin in the real UI (harness, screenshots, DOM checks, hot reload, seeded long sessions) → [reference/browser-testing.md](reference/browser-testing.md)
- Plugin cost: profiling, overhead budgets, hill-climbing a slow plugin → [reference/performance.md](reference/performance.md)
- A first build in a new checkout, an install/build failure, or a plugin that does not appear → [reference/build.md](reference/build.md)

## Workflow

1. Confirm the installed app version and the feature's observable behaviour. Read https://opencode.ai/v2/docs/build/plugins/gui and the installed SDK declarations for the relevant surface.
2. **Align** before building. The request is aligned when it pins all four: where the UI lives (a native surface to extend, or a new one), which native sibling it must be indistinguishable from, scope and defaults, and entry points. When any is open, or a plugin can reach the goal by more than one route, load the `grilling` skill and settle each with the user through the question tool, one decision at a time with a recommended answer, until every one is written in the plugin's `DESIGN.md` under `## Decisions`. A worker without the question tool returns the open questions to its orchestrator before building the less obvious route.
3. Choose a public registry or host API. If it lacks the requested surface, isolate the DOM workaround and verify selectors against the installed app before editing.
4. Scaffold from `~/git/dev-files/apps/opencode-plugins/sidebar-repos`: read its manifest, Vite and workspace config rather than guessing the build contract, and preserve package identity when moving a plugin. Build each UI element from [native-ui](reference/native-ui.md) or from the host source of the sibling named in step 2.
5. Separate pure logic from setup, test it, and run every declared package check. Register the built package through the global config.
6. Load the plugin in the harness (`scripts/desktop-harness.sh`: an isolated second app driven over CDP; `opencode serve` never loads GUI plugins) and exercise it there: open the element, hot reload, switch sessions, run the cleanup. The hand-off shows a screenshot of the real window for each, listed apart from the package checks.
7. **Parity** closes the task: run `scripts/parity.mjs` against the native sibling and iterate until the report is all PASS (next section). The hand-off carries the report and its side-by-side screenshot.
8. **Free** also closes it: profile the plugin against the bare app and hill climb until every scenario is inside the bars in [reference/performance.md](reference/performance.md). The hand-off carries the table.

## Parity

A UI change is done when `scripts/parity.mjs` reports PASS for style, motion and behaviour against the named native sibling, and `report.md` plus `side-by-side.png` are in the hand-off. An N/A carries a written reason in the spec (`allow` for a difference by design, `na` for a sibling the harness cannot show). A FAIL means the change is not done, whatever it looks like.

Name the sibling before building (the element table in [reference/native-parity.md](reference/native-parity.md)) and build from [native-ui](reference/native-ui.md), whose components already pass. The spec format, the run command and how to read the three layers are in [reference/native-parity.md](reference/native-parity.md).

## Scaffold

A plugin is its own package, outside the app. Copy these four files.

`package.json` — the export path and the app's own SDK version are both load-bearing:

```json
{
  "name": "sidebar-repos",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { "./gui-experimental": "./dist/gui-experimental.cjs" },
  "scripts": { "build": "vite build", "typecheck": "tsc --noEmit", "test": "tsx --test src/*.test.ts" },
  "dependencies": { "@opencode/plugin": "2.2.5", "solid-js": "1.9.10" },
  "devDependencies": { "@types/node": "^22.20.5", "happy-dom": "^21.0.4", "tsx": "^4.23.15", "typescript": "^5.9.3", "vite": "^7.3.7", "vite-plugin-solid": "^2.11.15" }
}
```

Pin `@opencode/plugin` to the installed app's version (`defaults read /Applications/OpenCode.app/Contents/Info.plist CFBundleShortVersionString`). A mismatch type-checks against an API the running app does not have.

`vite.config.ts` and `tsconfig.json`:

```ts
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"
export default defineConfig({ plugins: [gui({ entry: "src/gui.ts" })] })
```

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true,
    "noEmit": true, "skipLibCheck": true, "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`src/gui.ts` — the default export is the plugin:

```ts
import { Plugin, Style, Command } from "@opencode/plugin/gui"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, `[data-sidebar-repo] { color: var(--v2-text-text-muted); }`)
    ctx.add(Command, {
      id: "hello",
      title: "Say hello",
      run: () => { ctx.toast.show({ title: "Hello" }) },
    })
  },
})
```

- `setup(ctx)` runs once per window, synchronously, inside a Solid root owner. Do not return a promise; return a cleanup (or use `onCleanup`). Async work goes in `createKeyed` / `createLatest` with `ctx.signal`.
- `main(ctx)` runs once in the desktop app's main process, may be async, and is where Node-only work and `ctx.provide(Ipc)` belong. Windows reach it through `ctx.main(Ipc)`.
- The plugin's id is its package name, assigned by the host; ids starting `opencode.` are reserved.
- Rebuild after source changes. Local GUI bundles are watched and reload in every window; use Extensions → Plugins → **Reload** if the running version stays stale. Config changes are watched too.

## Rules that keep a plugin working

- **Native UI comes from the host, in this order.** (1) A registry item the host renders (`Command`, `ComposerPill`, `Panel`, `SettingsPage`, `MenuItem`, `TitlebarItem`); (2) a `ctx.ui` component (`Icon`, `Button`, `IconButton`, `Tooltip`, `Menu`, `Loader`, `Dialog`, `Switch`, `TextInput`, `Keybind`, `Markdown`, `Code`), mounted with Solid `render` inside the setup owner; (3) a [native-ui](reference/native-ui.md) component, the host's own markup and classes copied from the installed source so its CSS applies; (4) when none exists, copy the host component's real markup from the extracted source into native-ui with a parity spec; (5) hand-written HTML/CSS only for what none of these express, with `--v2-*` tokens and a one-line reason in the code. Icons come from the app catalog (`IconName`), or are drawn in its style ([reference/icons.md](reference/icons.md)).
- **Reach for a registry before the DOM.** A registry item re-renders from app state and survives app updates; an injected node survives neither. The registry table in `reference/host-api.md` lists every one with its slots.
- **Read state through `ctx`, never by scraping.** `ctx.tabs.list()`, `ctx.sessions.list()`, `ctx.sessions.current()`, and each session's `server.data.*` stores are reactive inside `createEffect`. Scraping the DOM for state produces stale UI the moment the app re-renders.
- **Scope styles.** `ctx.add(Style, css)` registers global CSS while the contribution is active; the host withdraws it on cleanup. Key rules on an attribute you inject (`[data-sidebar-repo]`) and use the app's `--v2-*` tokens so light and dark both work. Use app-wide selectors only when changing that app-wide behavior is the feature.
- **Injection is idempotent and reversible.** Query for your own hook before creating a node, key it on `data-tab-key` / a row key, write only when the value changes, and remove every node and attribute in the cleanup. The setup can run more than once in a window's life.
- **Never rewrite app-owned text.** Inject a sibling node instead: the app rebuilds titles from its own store, and a rewritten `textContent` is lost or duplicated depending on render order (and renaming a session must keep working).
- **A `MutationObserver` filters.** Observe the smallest attribute set that matters (`attributeFilter: ["data-tab-key", "data-orientation", "data-status"]`) and coalesce work into one `requestAnimationFrame`; an unfiltered observer over `documentElement` re-enters on its own writes.
- **Animation earns a purpose first.** Gate by frequency, then follow [reference/animation.md](reference/animation.md): ease-out curve, 150-250ms, `transform`/`opacity`, interruptible transitions, reduced-motion branch, accordions via `grid-template-rows`. Override the app's own motion with `!important` only where it is a `mask-image` fade.
- **Assume the app is hostile to long-lived references.** Elements unmount on session switch; re-resolve your container from the DOM rather than caching an element across renders. A popover or menu of your own portals into `<body>`: a plugin mount point can sit under `contain: strict`, which clips a fixed box out of hit-testing.
