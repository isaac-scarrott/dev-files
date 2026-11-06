# Spaces design

Arc's Spaces for OpenCode sessions. The full research (row hiding, the sidebar layout, trackpad events, menus, keyboard, store limits, risks) is in
`SPIKE.md` beside this file; this one records what the plugin does and why, milestone by milestone.

## Decisions already taken with the user

- **A space groups hand-picked sessions**; each session belongs to exactly one space, and a space to many sessions.
- **The sidebar is filtered**, not a separate panel: the active space's sessions are the ones you see.
- **One space by default**, so nothing changes until a second exists.
- **Create by swiping right on the last space** (Arc), and **switch by swiping or clicking a dot** in a strip at the
  bottom of the sidebar.
- **Opening a session that belongs to another space switches to that space.**
- **The host's own `Alt+Arrow` and `Cmd+1..9` are guarded** so they only see the active space.
- **Moving a session uses the row menu and the palette**, not drag (drag conflicted with the host's and `session-drag`'s
  reordering in the harness).
- **Accent colour lives on the strip only**; the sidebar is not tinted.
- **Switching to an empty space shows an empty sidebar**, without opening a tab.
- **State is the plugin's own store**, and the plugin is **self-contained**: no link to `session-drag` or any other
  plugin, so vanilla OpenCode behaves identically.

## Milestone 1: spaces exist and show

State model, all pure and unit-tested in `src/model.ts`:

- `spaces[]` with `id`, `name`, `emoji`, optional `accent`, optional `lastSession`; `active` is an index, clamped on read.
- `assigned[]` maps a session (server + session id) to a space, capped at 2000 oldest-dropped; `drafts[]` maps a draft tab
  key to a space, capped at 50.
- Resolution order: draft by tab key, then assignment by session, then `spaces[0]` — the first space owns everything
  unassigned and receives a deleted space's sessions. The first space cannot be deleted.
- `settle()` repairs anything the store hands back (a hand-edited value, a damaged schema), never throws, and keeps at
  least one space. `version` stays a number so a future field can be optional without wiping saved data.

The strip (`src/strip.ts`) is one injected row:

- Placed in the sidebar's own flex column, immediately before `[data-slot="vertical-tabs-footer"]`, so it moves with the
  sidebar's collapse and resize and never floats over the list. Verified shape from the spike: 248×34 above the footer.
- Hidden (`data-spaces-empty`, no height) until there are two spaces.
- One button per space, emoji as its face, `role="tab"`, `aria-selected` on the active one, the space name as its title
  and label; a plus at the end creates one. Clicks stop propagation so the host's row handling never sees them.
- Styled only through host tokens (`--v2-text-*`, `--v2-background-bg-layer-02`, `--v2-overlay-simple-overlay-hover`) so
  light, dark and future themes follow. No pointer cursor: these are controls, not links.
- Placement runs at setup and is retried until the sidebar exists (the host mounts it late), then a `MutationObserver` on
  the sidebar re-places it only if the host detaches it. Everything is removed on cleanup; hot reload leaves one strip.

Commands are the palette's (`ctx.add(Command, …)`), not keybinds yet: **New space…** (asks for a name) and **Switch
space…** (only offered with two or more spaces).

## Milestone 2: the sidebar shows one space

- **Membership.** `reconcile()` gives every tab a space exactly once: an assignment or draft it already has wins; a tab
  that was open when the plugin started joins the first space; anything appearing later joins the active space. A draft
  whose tab became a real session hands its space to that session. Stale drafts are pruned.
- **Hiding.** One attribute per row plus one rule in our style sheet
  (`[data-slot="vertical-tabs"] [data-tab-key][data-spaces-hidden]{display:none!important}`). A pass over 119 rows is
  ~0.1ms, and the observer watches `childList` + `attributeFilter:["data-tab-key"]`, so our own writes wake nothing.
- **The active row may be hidden.** Switching to a space with nothing in it leaves an empty sidebar while the timeline
  keeps the previous session (the user's choice: no surprise tabs). Starting a session there puts a row in that space.
- **Restoring.** The routed session is recorded as the active space's `lastSession`; switching to a space focuses its
  `lastSession` when it has one.

## Milestone 3: managing spaces

- Commands for rename, emoji, colour, delete (confirmed first; its sessions return to the first space, matching the
  store's fallback owner) and move-to-space. Only what is needed is asked; with one space, rename does not ask which.
- **Move to space ▸** is written into the host's own menu markup above Delete…, with submenu, chevron, disabled current
  space, arrow-key handling and the host's own close. The technique is the one `snooze`/`archive` proved; it is copied
  here rather than imported so spaces still works alone. Only our nodes are removed when a menu re-renders or the plugin
  goes away.

## Milestone 4: swipe

- The wheel machine (`src/swipe.ts`) is pure and tested: axis lock (a vertical scroll stays the host's), threshold,
  one change per gesture, a cooldown that swallows a momentum tail, and, at the last space, reveal then create.
- The listener is on the document and acts only over `[data-slot="vertical-tabs-sidebar"]`: the sidebar is mounted late
  and can be replaced, so binding to the element at setup left the handler attached to nothing (caught in the harness).
- The list slides in from the side swiped from (160ms, `cubic-bezier(0.2, 0, 0, 1)`), and the plus scales up as it is
  revealed. Reduced motion turns both off.

## Milestone 5: keys

- A window-capture `keydown` takes `Alt+↑/↓` and `Mod+1..9` while more than one space exists, and moves over the rows on
  screen instead. Nothing reaches the host's handlers (`stopImmediatePropagation`), so a hidden session cannot be
  selected. A single space leaves the host's keys untouched.
- Next/Previous space are commands with `ctrl+alt+arrowright`/`left`, shown and remappable in Settings → Shortcuts.

## Milestone 6: hardening

- **Fail open.** Nothing is hidden unless the sidebar exists and the strip has a real box. A layout without a sidebar
  (top tabs, Inbox) or a moved anchor leaves every session visible and says so once, instead of filtering with no
  visible control.
- Verified in the harness: switch by swipe and by click, overscroll → plus → create, `Alt+Arrow` never routing to a
  hidden row, six spaces in the strip, light and dark, reload persistence, and a coexistence pass with `sidebar-repos`
  and `session-drag` (rows still filter, strip intact).

## Reordering

Dragging a dot sideways moves its space. The pure move is `reorderSpace`: the array changes, the active space keeps its
id (so the highlight follows it to the new slot), and assignments are untouched because they name spaces by id. A press
that travels less than 4px stays a click; a real drag sets a marker so the click that follows the drop does not also
switch space.

## What is deliberately not here

- **Dragging a session row onto a dot** (dots themselves are draggable; sessions move through the menu). The harness could not start the host's own drag (`[data-dragging]` appeared, the list
  never reordered), and a second drag system over the host's dnd-kit risks moving rows across a hidden boundary. The
  menu and palette cover the action.
- **Tinting the sidebar per space.** Would mean overriding host background variables on host elements. The accent lives
  on the strip's dots, as agreed.
- **Live drag-following of the list during a swipe.** The host owns the list; we slide it after the change instead of
  transforming it mid-gesture, which avoids fighting its scroll container.

## Fragility, and why it is acceptable

The filter is knowledge the host does not have: selection, ordering and keyboard navigation run off the real tab list.
We intercept the keys that would expose that difference, and every write is an attribute the host ignores. Selectors are
documented ones (`vertical-tabs`, `vertical-tabs-scroll`, `data-tab-key`, `vertical-tabs-footer`); if a host update moves
them, the plugin fails open and says so rather than hiding sessions it cannot show.
