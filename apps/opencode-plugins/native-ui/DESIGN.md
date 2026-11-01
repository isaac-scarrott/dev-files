# native-ui: design

A library of components copied from OpenCode Desktop 2.2.5's own markup, for GUI plugins to import by relative path. It is not a plugin and is not registered. What it exports is in [README.md](README.md).

## Decisions

Reason for each copy, against the public components `ctx.ui` offers and the "no extension point" list in [host-architecture.md §8](../../../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary).

- **Copy the host's markup, class names and data attributes** instead of drawing new look-alikes: the app's own CSS then styles them, so a theme or host update changes them together. `parity.spec.mjs` compares each component with the real element in the running app. The cost is that the copy tracks 2.2.5 and may break on an update.
- **Menu** (`src/menu.tsx`): `ctx.ui.Menu` exists but is a trigger-bound dropdown that cannot open at a point, so a point-anchored context menu (session rows) cannot use it. The host's `Menu.Content`, `Item` and `Separator` markup and the attributes Kobalte sets are copied. Roving focus, which Kobalte provides in the host, is reimplemented (`nextItem`, `highlight`). `data-expanded` is set after a frame so the host's menu CSS plays its enter.
- **Spinner** (`src/spinner.tsx`, `spinner-radar.ts`, `spin-phase.ts`): `ctx.ui` offers only `Loader`, which the host reserves for non-AI loading, so the Soft Radar dot grid and keyframes are copied. Spin phases are pinned while visible so several spinners stay in step; reduced motion shows a still frame.
- **Session tab rows, close and row-action buttons, popover, summary card, project avatar, clock icon**: tab rows have no extension point, and `ctx.ui` has no equivalent. Tab row actions and close have `transition: none`, like the host's `[data-slot=tab-close] > button`.
- **Header icon button** wraps `ctx.ui.IconButton` (public) and adds the pressed look, `aria-haspopup`, `aria-expanded` and `aria-controls` the host's header buttons carry.
- **`createHost(ctx.ui)`** keeps the setup owner, so components rendered later from an observer, timer or DOM event still find the plugin's Solid context.
- **Sharing by relative path**, not a package: a consumer bundles the source into its own build (`snooze-archive` does, via its `tsconfig` include). `agents-panel` has its own copies of the three spinner files and `snooze-archive/src/menu.ts` re-implements part of the menu; both are known duplicates, not decisions.

## Known gaps

- Module state: a `let added` guard plus a `<style>` appended to `document.head` in the spinner, and a module `WeakSet` in the header icon button. Neither is owned by a plugin owner, so a Reload leaves the style and the set behind.
- 6 tests for 14 exports; the parity spec covers the rest live.
- `demo/` is a separate GUI plugin used to exercise the components; it has a document-wide observer and is not part of the library.

## Performance

Not measured. The library registers nothing itself. Standing cost of what it exports: a `ResizeObserver` and an `IntersectionObserver` created at import in `spin-phase.ts` and never disconnected. Method and bars: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md).

| Scenario | Bare | With plugin | Delta | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle | | | | zero callbacks | not measured |
| 10 session switches | | | | within 3% scripting | not measured |
