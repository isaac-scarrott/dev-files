# model-picker

The model picker (OpenCode Desktop 2.2.5) shows provider sections only, no Recent. Favorites stays above them. Providers run A to Z by displayed name (case-insensitive). Models within a provider run by output price per million tokens, highest first, ties by name A to Z; a model with no price counts as 0.

## Decisions

- **Native sibling:** the host's own model dialog (`DialogSelectModel`, `select-dialog.tsx`), whose results list this plugin replaces.
- **Where it lives:** inside the host's dialog. Every entry point opens that dialog (composer pill, `mod+'`, the palette's "Choose model", `/model`), so the plugin watches for `.model-dialog` instead of hooking each entry.
- **Scope and defaults:** always on, no setting. Search mode keeps the host's search; the same provider and price order applies to the results.
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
- **Prices** come from `ctx.servers.get(id).data.location.model.list(ref)` (`ModelInfo.cost[].output`, USD per million tokens, tier-less entry first), keyed `providerID:modelID`. `ref` is the mounted session's location, else the first project's directory (the new-session draft has no mounted session); one sync per ref, and a solid effect re-lays the pane out when the list changes.
- **Dispose** removes the pane, the hiding attribute and the box patches; hot reload with the dialog open rebuilds the pane in place.

## Cost of this approach

- It depends on the dialog's markup (data-slots, `search-list-row`, header ids `<list>-section-<id>`) and on the host's delegated mouse/keyboard handlers. A host update that renames them stops the pane from attaching; the host's own list then shows, unchanged.
- The host's list is rendered but hidden, so the dialog does the work twice.
- Sorting by price needs a loaded model list for the chosen `ref`; until it loads (or for a model it lacks) price counts as 0 and the order falls back to name.
- Console workspace providers (`console-*`, grouped under one header in the host) are laid out as plain providers.

## Verified and measured

Unit tests (`pnpm test`): ordering, tie-break, recent/favorite handling, arrow stepping, and the pane against a fixture in the host's markup. Live (harness, seeded stub providers with prices): all four entry points, arrows with wrap, hover flyout geometry, favorite toggle by flyout and `mod+f`, search, Enter and click selection through the host, hot reload with the dialog open, Escape, and no frame in which the host's list was visible. `parity.spec.mjs` compares the clones with the host's rows in the same dialog.
