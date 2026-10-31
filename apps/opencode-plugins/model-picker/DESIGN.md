# model-picker: design notes

Goal: model picker (2.2.5) shows provider sections only (Favorites stays), providers A→Z, models by output price desc then name A→Z, no model missing.

Current plugin: hides the host's Recent section by DOM. Known bug: the host moves recent models out of their provider group, so they vanish.

## Host facts (chunk `server-unavailable-panel-D76IWs6Q.js`, 2.2.5)

- `Ja` builds sections: `favorite`, `recent`, then provider groups with every favorite/recent model removed.
- `Ka.groups` sorts providers with `Ha`: pinned providers (`yn`) first, then provider name. `Ka.models` sorts by model name.
- `Ka.recent()` reads the model store (`QLt` in `main-*.js`, persisted via `EW.global("model")`). `cycle()` (composer model cycling) also uses that recent list. `select()` re-adds the model to recent on every pick.
- The search list (`Dwt`/`gwt` in `main-*.js`) groups `items` by `section(item)`; ArrowUp/Down moves the active key through that flat item order, not DOM order. Rows are keyed by `data-option-key`.
- The plugin API has no hook for picker data, recent or favorites. Nothing under `ctx` exposes the model store.
- Cost is reachable: `ctx.servers.get(id).data.model.list(locationRef)` returns `ModelInfo[]` with `cost: ModelCost[]` (`input`, `output` USD per million tokens, optional `tier`) and `providerID`, `name`. No extra client call is needed.

## Options

- (a) DOM-move recent rows into provider sections and reorder sections/rows. Rows stay native (look, flyout, star). Fails keyboard parity: arrow order follows the host's item order (favorites, recent, providers in `Ha` order, names A→Z), so after any reorder the highlight jumps around the screen; Enter/Home/End likewise. Fixing it needs the plugin to replay synthetic arrow presses or hover events, which also trips the flyout timer. Moving rows also fights Solid's keyed updates (it inserts new rows against its own anchors).
- (b) Empty the host's recent list. Not reachable from the plugin API; writing the persisted store bypasses the host's reactivity, and it breaks `cycle()` and the recent-model fallback. It also fixes only membership, not the sort order (`Ha`, name sort), so (a)'s keyboard problem remains.
- (c) Plugin-owned picker. Correct data and order, but re-implements rows, flyout with variants, favorites star, keyboard, scroll-synced headers; the pill and `mod+'` still open the host dialog, so the plugin would have to intercept those.

No option gets native keyboard behaviour with a small, robust plugin. Nothing was built beyond the existing hide-Recent behaviour.

## Open question for the user

Pick one:
1. Accept (a): provider-only sections, sorted visually, with arrow keys following the host's order instead of the visible order (not recommended).
2. Build (c): a plugin-owned dialog replacing the host's, with the intercept of the composer pill and `mod+'`.
3. Ask upstream for a picker option (hide recent, sort) and keep the current plugin until then. Recommended: smallest, no fragile code.
