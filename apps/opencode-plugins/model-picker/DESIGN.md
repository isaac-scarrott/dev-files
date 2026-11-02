# model-picker

The model picker (OpenCode Desktop 2.2.5) shows provider sections only, no Recent. Favorites stays above them. Providers run A to Z by displayed name (case-insensitive). Models within a provider run by output price per million tokens, highest first, ties by name A to Z; a model with no price counts as 0.

## Decisions

- **Native sibling:** the host's own model dialog (`DialogSelectModel`, `select-dialog.tsx`), whose results list this plugin replaces.
- **Where it lives:** inside the host's dialog. Every entry point opens that dialog (composer pill, `mod+'`, the palette's "Choose model", `/model`), so the plugin watches for `.model-dialog` instead of hooking each entry.
- **Scope and defaults:** always on. One option, `rank`, for models the catalog leaves unpriced (below).  Search mode keeps the host's search; the same provider and price order applies to the results.
- **DOM hooks, and why each:** `.model-dialog` and the `search-list-*`/`model-dialog-*` data-slots (the dialog has no extension point, host-architecture §8; the rows must be the host's own markup). Dialogs are looked for only in the containers beside `#root` (they portal to `body > div > [data-dialog-layer]`), so the app tree, where replies stream, is never observed.
- **Unpriced models:** the Claude Agent provider runs through the claude CLI and has no catalog price, so its families get stand-in ranks (`fable 100, opus 75, sonnet 15, haiku 5`). That is a default of the `rank` option, `{ "<providerID>": { "<model key or name substring>": number } }`; a provider listed replaces its default entry. Without a rank an unpriced model counts 0.
- **No new UI element:** no dialog, row, button or menu is added; the host's rows are cloned. The parity spec compares the clones with the host's rows.

## Why the host dialog stays alive

The host builds Favorites, Recent and provider sections in `Ja`, and removes every favorite and recent model from its provider group, so hiding Recent made those models vanish. The plugin API has no hook for the picker's data, and the model store (recent, favorites, hidden models) is the host's own persisted store, out of reach. A plugin-owned dialog (`ctx.dialogs.open`) would need that store for favorites and hidden models, and would re-implement selection, the variants flyout, usage tags and the ChatGPT-plan note.

So the host's dialog runs untouched on its own state and only its results list is hidden (`[data-mp-hidden]`). `src/pane.ts` renders a second list beside it:

- **Rows** are clones of the host's rows (re-cloned when a host row changes), so look, tags (Free, Latest), usage marks, the check and the variant label are the host's. A row from the host's Recent section loses its provider label under its own provider's header; a Favorites row keeps it, as in the host.
- **Favorites** is the host's section with its rows, in the host's order (newest star first). A starred model is listed there only, as in the host (`Ja` removes it from its group). Nothing is lost: every model the host lists is shown once.
- **The pointer** drives the host's real rows: a move over a clone is re-dispatched to the host's row (with its coordinates and movement), and a click clicks the host's row. The host's highlight, delayed flyout, selection and `dialog.close()` run unchanged. The host places its flyout from the row's box, so the host row's `getBoundingClientRect` returns its clone's box while the pane is up; the flyout lands 6px beside the clone, as beside a host row.
- **The highlight** is the host's: the clone mirrors `data-active`. Arrow keys are the one thing taken over, because the host walks its own order (Favorites, Recent, providers by name), not the shown one. A plain ArrowUp/ArrowDown is stopped and replaced by the host's own arrow-key presses, enough of them to land the host's highlight on the next row of the shown order, so `keyboard` state, flyout closing, Enter, Left/Right variant cycling and `mod+f` all act on the right row. Home/End, Escape, typing and Tab stay the host's.
- **Search**: the host filters its own rows; the pane re-lays them out. After typing, the highlight goes to the first shown row.
- **Sticky headers**: the host's header fade (`fadeHeaders`) is copied onto the pane's scroller and also runs natively, since the pane's rows and headers carry the host's data-slots.
- **Prices** come from `ctx.servers.get(id).data.location.model.list(ref)` (`ModelInfo.cost[].output`, USD per million tokens, tier-less entry first), keyed `providerID:modelID`. `ref` is the mounted session's location, else the first project's directory (the new-session draft has no mounted session); one `createKeyed` sync per server and location until the list is loaded, a memo for the price map, and a `createKeyed` on it re-lays the pane out when the list changes.
- **Dispose** removes the pane, the hiding attribute and the box patches; hot reload with the dialog open rebuilds the pane in place.

## Cost of this approach

- It depends on the dialog's markup (data-slots, `search-list-row`, header ids `<list>-section-<id>`) and on the host's delegated mouse/keyboard handlers. **Fail-safe:** `attach` hides the host's list only after a snapshot of it was read in full (every `search-list-row` has an option key; an empty list is empty or carries `search-list-empty`) and the pane shows every row of it. If a later render cannot be read, or laying out throws, the pane is removed, the host's list shown again and the box patches undone; the pane returns when the markup is readable again. Tested on the 2.2.5 dialog (`test/fixtures`) with the results container, the row slot and the option key renamed, and live in the harness (results slot renamed on the open dialog: host list visible, no pane; renamed back: pane returns). A changed container that dialogs portal into means no dialog is found and the host's picker is untouched.
- The host's list is rendered but hidden, so the dialog does the work twice.
- Sorting by price needs a loaded model list for the chosen `ref`; until it loads (or for a model it lacks) price counts as 0 and the order falls back to name.
- Console workspace providers (`console-*`, grouped under one header in the host) are laid out as plain providers.

## Verified and measured

Unit tests (`pnpm test`): ordering, tie-break, recent/favorite handling, arrow stepping, the pane against hand-written markup, and against the real 2.2.5 dialog (`test/fixtures`) including the fail-safe cases. Live (harness, seeded stub providers with prices): all four entry points, arrows with wrap, hover flyout geometry, favorite toggle by flyout and `mod+f`, search, Enter and click selection through the host, hot reload with the dialog open, Escape, and no frame in which the host's list was visible. `parity.spec.mjs` compares the clones with the host's rows in the same dialog.

## Performance

Method: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md), reduced: harness 2.2.5 with the plugin loaded, a counting `MutationObserver` wrapper installed before the plugin reloaded, then 300 message-sized nodes (20 children each) appended under `#root` over 60 frames (a stand-in for a streaming reply), three runs. The seeded 500-prompt session was not used, so the long-conversation cost is not measured.

| Scenario | Before | After | Bar | Result |
| --- | --- | --- | --- | --- |
| streaming, observer callbacks per 300 appended nodes | 61 callbacks, 302 records, ~1 ms in callbacks (each record: `closest` + `querySelectorAll`) | 0 callbacks, 0 records | zero callbacks without a host change | PASS |
| idle | not measured (no timers; the old observer fired on any body change) | not measured | zero callbacks | not measured |
| dialog open (idle, host list rendered and hidden) | not measured | not measured | | not measured |

Standing cost: one `childList` observer on `body` plus one subtree observer per direct body child other than `#root` (8 in the harness), and one observer per open dialog (`src/pane.ts`). The host's list is rendered but hidden, so the open dialog does its work twice.
