# session-ui

What the [`snooze`](../snooze) and [`archive`](../archive) plugins share. Not a plugin: a library they import by relative path
(`../../session-ui/src`), bundled into each plugin's build, the way `native-ui` is.

- `sidebar.ts` — the group stack at the end of the host's scroll region, and the rows inside it (`SessionTabRow` in replace
  mode, the "Show N more" row, right-click menus). Whichever plugin loads first puts the stack there; the other appends to it,
  so Snoozed and Archived stay one block and it goes when the last group does. CSS `order` keeps Snoozed above Archived.
- `sessionmenu.ts` — adds entries to the host's own session menus (tab, header, Home row) above a native Delete…, each plugin
  under its own `data-sa-owner` so both can extend the same menu.
- `menu.ts` — the `menu-v2` markup, the submenu, keyboard handling, and the popup the group rows use.
- `session-ops.ts` — archive and unarchive through the client's own call or `session.update({ archived })`, delete with the
  host's confirm dialog, error toasts.
- `sessions.ts` — the session behind a tab, the project label and avatar, the composer's send stamp.
- `hub.ts` — one scoped MutationObserver per plugin (native-ui's), told what the plugins inject.
- `host.ts`, `avatar.ts`, `page.ts` — mounting host components, project avatars, paging.

## Install (development)

The three packages (`session-ui`, `snooze`, `archive`) are pnpm workspace members of `apps/opencode-plugins`, so they install
into one `node_modules` there and resolve a single copy of Solid — a plugin and the library must not run two. Run
`pnpm install` in `apps/opencode-plugins`, not in here.

```sh
npm_config_registry=https://registry.npmjs.org pnpm install
pnpm typecheck && pnpm test
```
