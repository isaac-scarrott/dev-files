# native-ui: host primitives copied from the installed app

`apps/opencode-plugins/native-ui` holds the rows, buttons, menus and popovers that `ctx.ui` does not export, each copied from the installed app's source (2.2.5) so the app's own CSS styles it. Reach for it before writing a row, button, menu item or popover by hand; a component here already passed [parity](native-parity.md) against its native sibling.

## Using it

A plugin imports by relative path; its own Vite build bundles the source:

```ts
import { SessionTabRow, SessionTabList, TabRowAction, createHost, nativeUiCss } from "../../native-ui/src"

const host = createHost(ctx.ui)
ctx.add(Style, nativeUiCss) // once: the three rules the host's CSS lacks (row action, popover shell, drawn icons)
```

Every component that renders a host control takes `ui: ctx.ui` (through `host.ui`), so the host's own `IconButton`, `Tooltip` and `Icon` are used, never re-implemented. Checks: `pnpm typecheck` and `pnpm test` (happy-dom, Solid compiled through Babel, no Vite) in the package directory; `npm_config_registry=https://registry.npmjs.org` in front of `pnpm` if the default registry is unreachable.

## Components

| component | host source (app.asar 2.2.5) | native sibling in a window |
|---|---|---|
| `SessionTabList`, `SessionTabRow` | `app/src/shell/titlebar/tab-strip.tsx` (SortableTab slot), `tab-popover.tsx`, `tab-nav.tsx` (TabNavItem) | a sidebar session row (`[data-titlebar-tab-slot] > [data-titlebar-tab]`) |
| `TabCloseButton`, `stopPress` | `tab-nav.tsx`, the IconButton in `[data-slot=tab-close]` | the row's X |
| `TabRowAction`, `attachTabRowAction`, `tabRowActionCss` | `tab-nav.tsx`, `[data-slot=tab-close]` repeated | the X (sibling: one button inward; replace: hides the X) |
| `ProjectAvatar`, `getProjectAvatarVariant`, `displayName` | `ui/src/data-display/project-avatar/project-avatar.tsx` | the row's lettered avatar |
| `MenuContent`, `MenuItem`, `MenuSeparator`, `MenuChevron`, `highlight`, `nextItem` | `ui/src/navigation/menu/menu.tsx` over Kobalte DropdownMenu | the tab's right-click menu (`[data-component=menu-v2-content]`) |
| `Popover`, `popoverCss` | `gui-plugins/src/details/popover.tsx` (DetailsPopover) | the Session details popover (`.session-summary-popover`) |
| `SummaryCard`, `SummaryHeading`, `SummaryRows`, `SummaryRow` | `gui-plugins/src/details` and its `style[data-plugin=details]` | the cards inside Session details |
| `HeaderIconButton` | `gui-plugins/src/details/popover.tsx` trigger | the Session details button (`ghost-muted large`) |
| `ProgressSpinner` | `ui/src/components/spinner.tsx` (Soft Radar) and `spinner-radar.ts` | the busy ring in `[data-slot=tab-status]` |
| `HeartbeatIcon`, `heartbeatIconCss`, `heartbeatChipCss`, `syncHeartbeats` | drawn: an ECG trace, states `live` (rows: a transform-slid band sweeps the trace; chip: opacity flash; one shared phase), `still`, `flat` (300ms settle); the monitors' glyph | catalog icons (none has a pulse) |
| `ClockIcon`, `drawnIconCss` | drawn in the catalog's style ([icons.md](icons.md)) | catalog icons |

### SessionTabRow

Indistinguishable from the sidebar row at rest, on row hover, on hover, focused and pressed: same slot/row/link/avatar/title classes (`sessionTabRowClass`), same `data-*` and ARIA on the link, same 44px link inside a 28px row (52px once sidebar-repos' second line is on), the host's own X reveal.

```ts
interface SessionTabRowProps {
  ui: Ui
  title: string
  avatar?: { fallback?: string; src?: string; variant?: ProjectAvatarStyle }
  project?: string            // second line, in the live row's language: "repo · branch"
  detail?: string             // appended to the second line: "repo · branch · 9:00"
  href?: string
  onOpen?(): void             // primary mousedown and keyboard, as the live tab navigates
  onMiddleClick?(): void
  onContextMenu?(event: MouseEvent): void
  active?: boolean; pressed?: boolean
  status?: "busy" | "attention" | "unread"
  action?: JSX.Element        // TabRowAction or TabCloseButton, rendered in the close slot
  tabIndex?: number           // omitted: the link is not a tab stop, as the host's link is not
  ref?(el: HTMLDivElement): void
}
```

- The link carries no `tabindex` unless given one; the host's row is reached through its buttons. `aria-haspopup`, `aria-expanded`, `data-closed` and the context-menu handler sit on the link, as the host's do.
- The second line renders only while sidebar-repos' `Style` is in the document (`hasSidebarRepos`): the host row has no second line of its own, and a lone plugin must not invent one.
- `SessionTabList` is the host's vertical list: flex column, 4px gap, `data-titlebar-tab-list` so the host's `+` hit extension applies from the second row on.

**Snoozed and archived rows.** Say what the live row says. Second line `repo · branch`; the wake time or the word `archived` only as `detail`, after the branch, never a badge above the title or a line of its own. The action slot holds one `TabRowAction` (`Wake`, `Restore`) where the live row has its X.

### Menus

`MenuContent` is the host's content box (`role=menu`, `tabindex=0`, no class, no `aria-orientation`); `MenuItem` the 28px compact item with roving tabindex, `data-highlighted` on hover and focus, `aria-disabled` always set, `variant="critical"` and `submenu` (chevron, `aria-haspopup`); `MenuSeparator` the host's bare `<hr data-slot=menu-v2-separator>`. A tab menu reads item, item, separator, critical item; a plugin extending the host's menu inserts before the separator.

### Popover and summary

`Popover` is a fixed `role=dialog` shell portalled into `<body>` (a plugin mount point can sit under `contain: strict`, which clips a fixed box out of hit-testing), placed bottom-end of an anchor with the host's 8px gutter and 16px overflow padding, Escape and outside-press close, focus handed back. `surface: "summary"` adds the `.session-summary-popover` class the host's details CSS is scoped under; `surface: "none"` is a bare shell for a context menu. `HeaderIconButton` with `expanded` wears the trigger attributes (`aria-haspopup`, `aria-expanded`, `aria-controls`, `data-expanded`, `data-state=pressed`) and prevents `pointerdown`, as Kobalte's trigger does.

## Not copyable, and why

- **Avatar image generation.** The host draws project avatars from its own store (`src`); the library takes `src` or a lettered fallback.
- **Drag-sorting.** Kobalte's sortable on `[data-titlebar-tab-list]` is host state; library rows are not sortable and never carry its attributes, so `dragstart` is prevented like the host's link.
- **Hover preview, double-click rename, middle-click close.** All act on a host session through its store; the row exposes `onMiddleClick`, `onContextMenu` and the host's `data-editing` attribute instead.
- **Busy spinner and status marks.** Verbatim copies, but no seeded session is busy or unread, so parity reports them N/A rather than measured.
- **Tooltip internals and Kobalte's positioning wrapper.** Both come from `ctx.ui.Tooltip` and the host; the library's shell does the same arithmetic without the popper wrapper (placement is checked, the wrapper's `position` is an allowed difference).
- **Extending the host's own tab menu.** snooze-archive's injection keys on the session last right-clicked, so a library menu opened next to it shows no Snooze/Archive lines; the parity spec ignores `[data-sa-menu]`.

## Shared tab marks and the sidebar observer

- **One mark node, one owner.** `createTabMarks({ owner })` stamps `data-notify-owner` on the mark it draws and never replaces or removes a mark of another owner. A plugin that draws its own mark while no hub is installed (snooze-archive's clock, `glyph: "clock"`) and the hub's mark can coexist without removing each other. A plugin that wants the hub to draw instead returns `undefined` from `mark` while `activeSink()` answers.
- **Plugin tests resolve Solid from the plugin.** A plugin's tests import native-ui's source, and each package has its own Solid copy: an `onCleanup` from native-ui's copy finds no owner in the plugin's `createRoot`, so cleanups silently never run. `native-ui/test/solid-hooks.mjs` (loaded by `--import ../native-ui/test/register.mjs`) maps `solid-js` imports from native-ui's source to the package the tests run in. A failing `assert.equal(domNode, null)` on a happy-dom element can hang for minutes and eat memory (the diff of the DOM): compare strings or counts.
