---
name: opencode-gui-plugins
description: Build or debug OpenCode Desktop GUI plugins. Use for desktop UI changes (sidebar, chat timeline, composer, panels), plugin loading/build failures, GUI plugin registration, or porting another app's feature into OpenCode as a plugin.
---

A GUI plugin is a normal OpenCode plugin package whose `./gui-experimental` export is a CommonJS bundle the desktop app loads into every window. It registers into public registries (`Command`, `Slot`, `ComposerPill`, `Panel`, `SettingsPage`, `TitlebarItem`, `Style`, `MenuItem`, `LinkHandler`, `Server`), reads the app's reactive state through `ctx`, and — only when no registry fits — injects DOM. Nothing in the app bundle is patched; the installed `.app` stays untouched.

Plugins are registered by absolute path in `~/.config/opencode/opencode.json`:

```json
"plugins": ["/Users/isaac/git/dev-files/apps/opencode-plugins/sidebar-repos"]
```

## Branches

- Choosing where a piece of UI belongs, or the host API's shape → [reference/host-api.md](reference/host-api.md)
- Touching the app's real DOM or CSS (sidebar tabs, timeline, status marks) → [reference/dom-map.md](reference/dom-map.md)
- Any transition, fade or accordion → [reference/animation.md](reference/animation.md)
- Verifying a plugin in the real UI (screenshots, DOM checks, hot reload, seeded long sessions) → [reference/browser-testing.md](reference/browser-testing.md)
- A first build in a new checkout, an install/build failure, or a plugin that does not appear → [reference/build.md](reference/build.md)

## Workflow

1. Confirm the installed app version and the feature's observable behavior. Read https://opencode.ai/v2/docs/build/plugins/gui and the installed SDK declarations for the relevant surface.
2. Choose a public registry or host API. If it lacks the requested surface, isolate the DOM workaround and verify selectors against the installed app before editing.
3. Use `~/git/dev-files/apps/opencode-plugins/sidebar-repos` as the tested scaffold; read its manifest, Vite and workspace config rather than guessing the build contract. Preserve package identity when moving a plugin.
4. Separate pure logic from setup, test it, and run every declared package check. Register the built package through the global config.
5. Test in the real UI with `scripts/desktop-harness.sh` (isolated second app driven over CDP; not `opencode serve`, which never loads GUI plugins) when you can; see the browser-testing reference.
6. Check the actual UI, including cleanup/reload and session switching. Report tests separately from live verification; a working bundle does not prove virtualized navigation works.

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

- **Use the app's primitives; build no UI of your own.** Order of preference: (1) a registry item the host renders (`Command`, `ComposerPill`, `Panel`, `SettingsPage`, `MenuItem`, `TitlebarItem`); (2) the host components in `ctx.ui` (`Icon`, `Button`, `IconButton`, `Tooltip`, `Menu`, `Loader`, `Dialog`, `Switch`, `TextInput`, `Keybind`, `Markdown`, `Code`), mounted with Solid `render` inside the setup owner; (3) for a list that must look like a host list (a session row, a subagent row), copy the host component's real markup, `data-slot`s and classes from the installed source so the app's own CSS styles it; (4) hand-written HTML/CSS only for what the first three cannot express, with `--v2-*` tokens and a one-line reason in the code. Icons come from the app catalog (`IconName`), not inline SVG, unless the catalog lacks one. Before building a row, button or menu, search the extracted app source for the component that already renders it.
- **Reach for a registry before the DOM.** A registry item re-renders from app state and survives app updates; an injected node survives neither. The registry table in `reference/host-api.md` lists every one with its slots.
- **Read state through `ctx`, never by scraping.** `ctx.tabs.list()`, `ctx.sessions.list()`, `ctx.sessions.current()`, and each session's `server.data.*` stores are reactive inside `createEffect`. Scraping the DOM for state produces stale UI the moment the app re-renders.
- **Scope styles.** `ctx.add(Style, css)` registers global CSS while the contribution is active; the host withdraws it on cleanup. Key rules on an attribute you inject (`[data-sidebar-repo]`) and use the app's `--v2-*` tokens so light and dark both work. Use app-wide selectors only when changing that app-wide behavior is the feature.
- **Injection is idempotent and reversible.** Query for your own hook before creating a node, key it on `data-tab-key` / a row key, write only when the value changes, and remove every node and attribute in the cleanup. The setup can run more than once in a window's life.
- **Never rewrite app-owned text.** Inject a sibling node instead: the app rebuilds titles from its own store, and a rewritten `textContent` is lost or duplicated depending on render order (and renaming a session must keep working).
- **A `MutationObserver` filters.** Observe the smallest attribute set that matters (`attributeFilter: ["data-tab-key", "data-orientation", "data-status"]`) and coalesce work into one `requestAnimationFrame`; an unfiltered observer over `documentElement` re-enters on its own writes.
- **Animation earns a purpose first.** Gate by frequency, then follow [reference/animation.md](reference/animation.md): ease-out curve, 150-250ms, `transform`/`opacity`, interruptible transitions, reduced-motion branch, accordions via `grid-template-rows`. Override the app's own motion with `!important` only where it is a `mask-image` fade.
- **Assume the app is hostile to long-lived references.** Elements unmount on session switch; re-resolve your container from the DOM rather than caching an element across renders.
