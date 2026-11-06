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
- Sits on the chat panel's bottom line: the panel is inset `--shell-bottom-inset` from the window, the sidebar mount pads
  10px, so the row drops the 2px difference into that padding with `top` (painting only, so the footer never moves). The
  dot's hover box therefore lines up with the panel's bottom edge.
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
  one change per gesture, and, at the last space, reveal then create. What a gesture is, and how its edges are found,
  is the next section.
- The listener is on the document and acts only over `[data-slot="vertical-tabs-sidebar"]`: the sidebar is mounted late
  and can be replaced, so binding to the element at setup left the handler attached to nothing (caught in the harness).
- The list slides in from the side swiped from (160ms, `cubic-bezier(0.2, 0, 0, 1)`), and the plus scales up as it is
  revealed. Reduced motion turns both off.

## What a swipe gesture is

A gesture is one stroke of the fingers plus the momentum tail macOS sends after they lift. It changes space at most
once. A second stroke is a second gesture even while the first one's tail is still running, because touching the
trackpad cancels the tail. The first version latched after a change until 320ms of silence, so a quick second swipe
was swallowed. A tail at 0.94 a frame runs about a second, so the next change could come 1.3s after the last at best.
The latch is gone. After a change the machine watches for evidence that a new gesture has started:

- **`WheelEvent.momentum`.** Chromium 151 shipped it (spec: Pointer Events, `momentum`), and OpenCode 2.2.5 runs
  Chrome 152 with the getter present. It is true only for the OS's inertia. A tail is never a new gesture, a finger
  event after a momentum one always is, and inertia with no gesture under way starts nothing. When the flag is there,
  this settles it. CDP cannot produce a momentum event, so on hardware it is unverified; the live check dispatches
  constructed events through the real listener.
- **The stream's shape**, for engines or devices that never set the flag. A tail only decays. A new stroke shows as
  the stream falling to a third of its peak (`DECAYED`), then climbing two events running (`CLIMB_EVENTS`) to at least
  twice the trough and 4px/frame above it (`CLIMB_RATIO`, `CLIMB_PIXELS`). The travel since the trough carries into
  the new gesture.
- **A pause of 150ms** (`GESTURE_GAP`), measured on `event.timeStamp`. Chromium stamps input with the OS event time,
  so a busy page cannot open a gap inside a tail.
- **A swing back**: two events running against the committed direction, 6px or more.

Each event is read two ways, in pixels per 16ms frame. `burst` is the event's delta over the stream's usual spacing
(the median of the last six intervals), so a late event cannot shrink it. `speed` is the travel of the last three
events over their time, so Chromium merging events that queued while the page was busy cannot swell it. An event is
low only if it is low both ways, and high only if it is high both ways. Either reading alone failed: by delta, the
merged events after a switch looked like a new spike. By speed, a CDP stall (the harness's events land 18-35ms apart,
with stalls up to 188ms right after a switch re-renders) looked like a dip. And with a fixed frame cap, the two
readings disagreed by 1.6× at 25ms spacing.

The wheel binding's idle timer (the same 150ms, wall clock) only lets go of the slot. A full pull creates, and the
rest of that gesture is swallowed as after a change. It no longer resets the machine: that is the events' own times'
job, so a page too busy to deliver events for a while cannot split one gesture in two.

Measured (fuzz of 6000 gestures per run. Strokes ease to their lift speed, then momentum decays at 0.88-0.97 a
frame. Hardware model: 8 or 16ms spacing, with merges when the page is busy. CDP model: irregular spacing and stalls):

| | flag | shape only |
|---|---|---|
| one gesture changes space more than once | 0 | 0 in 48,000, both models |
| second swipe, no landing gap, first tail cut after 5 / 10 / 20 / 30 / 45 events | caught at once | 60% / 74% / 82% / 89% / 94% caught |

Live, in the harness (side tabs, trusted CDP wheel over the sidebar, stamped 16ms apart like a trackpad):

- 74 events, 66 of them a decaying tail: one change.
- A tail cut by a fresh stroke with no pause: two.
- Three back-to-back swipes: three with the flag, at any tail length. Without it: three once each tail runs about 20
  events (320ms); shorter tails read as one gesture.
- At the last space, a full pull and release creates one space.

`deltaMode` is always 0 (pixels) on Chromium (SPIKE C), so no line or page scaling is applied.

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

## Switching back to a space

Each space remembers the tab that was on screen (`lastTab`, and its session when it has one). The tab on screen is
recorded wherever every tab change passes (`sync`), not by an effect guessing at what counts as navigation, and again as
a space is left. Arriving focuses that tab when it still belongs to the space; failing that, its last session; failing
that, the first session the space owns — so a switch always lands inside the space rather than leaving another space's
thread on screen. A focus the plugin performs is remembered for one routed change, so it is not mistaken for the user
opening a session elsewhere and switched away from again.

Navigation from elsewhere (a notification, Home, Search, the palette) lands in the space the session belongs to, and so
does clicking into the session area when the sidebar shows another space because the last switch landed somewhere empty:
the session on screen decides the space. A focus the plugin performs itself is exempt, and a switch made in the sidebar
is never undone by the click that made it.

## Reordering

Dragging a dot sideways moves its space. The dot follows the pointer and every dot it passes slides one slot the other
way, so the row shows the order as you choose it rather than only after the drop; letting go asks for exactly the order
on screen. The pure move is `reorderSpace`: the array changes, the active space keeps its id (so the highlight follows
it to the new slot), and assignments are untouched because they name spaces by id. A press that travels less than 4px
stays a click; a real drag sets a marker so the click that follows the drop does not also switch space.

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
