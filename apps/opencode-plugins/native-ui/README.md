# native-ui

Shared components that look and behave like OpenCode Desktop's own sidebar rows, menus, popovers, spinners and icon buttons, for plugins to import.

## What it does
- Exports session tab rows, tab close and row-action buttons, menu content and items (with a submenu chevron and keyboard highlight), a popover, a summary card, project avatars, a progress spinner, a header icon button and a drawn clock icon.
- Uses the host's own class names and data attributes, so the app's CSS styles them. `nativeUiCss` adds the little the host does not provide.
- Imported by relative path and bundled into the importing plugin's build; today only `snooze-archive` does (`agents-panel` has its own copies of the three spinner files, and `snooze-archive/src/menu.ts` re-implements part of the menu). It is not a plugin and is not registered. `demo/` is a separate demo GUI plugin.

## Context
GUI plugins that draw their own rows and menus drift from the app. These components copy the host's markup from the installed 2.2.5 renderer source, and `parity.spec.mjs` checks them against the real elements. It tracks 2.2.5 and may break on a host update.

## Install
Not registered. Import from a sibling plugin:
```ts
import { MenuContent, SessionTabRow, nativeUiCss } from "../../native-ui/src"
```
Kind: library. Rebuild the importing plugin.

## Options
None.

## Credits
- OpenCode (MIT): the markup, class names and layout of each component, adapted from the desktop app's renderer source (2.2.5) at https://github.com/anomalyco/opencode.

## Development
`pnpm typecheck && pnpm test` (no build; consumers bundle the source). Design notes: [DESIGN.md](DESIGN.md).
