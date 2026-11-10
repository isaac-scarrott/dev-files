# Spaces (Arc-style session spaces): spike findings and proposed design

Read-only spike, OpenCode Desktop **2.2.5** (Electron 44.9.1 / Chromium 152), Side tabs layout, GUI plugin only.
Worktree `../dev-files-spaces-spike` on branch `spike/spaces` (off `master` at `9634bfc`). No plugin code written,
`apps/opencode-plugins/spaces` not created.

Legend: **✔** observed in the private harness, **▸** read from the 2.2.5 source, **?** unverified.

## What I ran

Harness: the skill's own `scripts/desktop-harness.sh`, private root `/private/tmp/oc-spaces-spike`, **CDP 9601, service
49701** (9333/49555 were free but left alone; every port checked with `lsof` first). Plugins loaded by absolute path:
`sidebar-repos`, `snooze-archive`, `session-drag`, `notifications`, `fixtures/sidebar-seed`, and one scratch probe
plugin (`.spike/probe-plugin`: a `Slot window.bottom` bar, a `TitlebarItem`, and an injected strip inside the sidebar).

```sh
OC_HARNESS_ROOT=/private/tmp/oc-spaces-spike OC_HARNESS_CDP_PORT=9601 OC_HARNESS_SERVICE_PORT=49701 \
  OC_HARNESS_TURNS=2 apps/opencode-plugins/.claude/skills/opencode-gui-plugins/scripts/desktop-harness.sh start <abs plugin dirs...>
password=$(node -e 'console.log(require("/private/tmp/oc-spaces-spike/state/opencode/service.json").password)')
node seed-session.mjs http://127.0.0.1:49701 "$password" /private/tmp/oc-spaces-spike/project 0 --sidebar 120,40,4
```

Every run under `NODE_OPTIONS=--max-old-space-size=1500` and `perl -e 'alarm N; exec @ARGV'`. Probes are Playwright
(`playwright-core` 1.60 from `~/git/t3code/node_modules`) over CDP; page scripts are `.spike/probe*.mjs`, results
`.spike/probe*.json`, screenshots `.spike/shot-*.png`. The harness was stopped at the end; nothing outside the private
root was touched (the user's app/service on 49374 was only ever read by nothing at all).

Evidence files kept on this branch: `.spike/shot-probe-placed.png` (probe strip in place, full-width `window.bottom`
bar), `.spike/shot-no-active-row.png` (filtered list with the routed row hidden), `.spike/shot-hidden.png` (filtered
list with the active row kept), and the raw probe results `.spike/probe{3,4,5,6}.json`.

Seeded state: **120 live sessions over 4 projects, 40 archived**, all 120 opened as tabs (`__seedTabs=120`), plus the
persisted draft tab → **121 sidebar rows** (a later reload re-ran the seed fixture and produced 122; the filter numbers
below are from the 121-row run).

---

## A. Sidebar structure

### Structure ✔

The vertical sidebar is a **flat list of open shell tabs** — not sessions, not grouped, not virtualized.

| Fact | Evidence |
|---|---|
| 121 open tabs → **121 rows in the DOM**; no windowing | `document.querySelectorAll('[data-slot="vertical-tabs"] [data-tab-key]').length === 121` with 121 tabs |
| Rows are Solid `<For each={props.tabs}>`, keyed by tab key, all mounted | ▸ `tab-strip.tsx:580`; scrollHeight 6892 vs clientHeight 734 |
| No group headers, no project grouping | all direct children of `[data-titlebar-tab-list]` are `[data-titlebar-tab-slot][data-tab-key]`; grouping exists only on Home |
| Scroll container | `[data-slot="vertical-tabs-scroll"]` (`flex-col overflow-y-auto overflow-x-hidden max-h-full`), mask fade from `--vertical-tabs-fade-top/bottom` ▸ `tab-strip.tsx:504`; measured `scrollHeight 6836 / clientHeight 850` at 121 rows (and 6892/734 with a 40px `window.bottom` probe bar) |
| Sidebar column | `[data-slot="vertical-tabs-panel"]` (`absolute inset-0 overflow-hidden contain:layout_style_paint`) → `[data-slot="vertical-tabs-mount"]` (`contain-strict`, flex column, `pb 10px`) → one Portal child (`flex size-full flex-col`) whose children are: header, Home/Search/Recently-closed column, 16px spacer, `flex-1` column holding `[data-slot="vertical-tabs"]`, `[data-slot="vertical-tabs-footer"]` (only when a `TitlebarItem` exists) ✔ measurement + ▸ `shell.tsx:249-265`, `titlebar.tsx:813-893` |
| Row markup | `[data-titlebar-tab-slot][data-tab-key][data-active]` > `[data-titlebar-tab][data-orientation=vertical][data-status][data-active]` > `a[data-slot=tab-link]` (avatar, injected `[data-sidebar-repo]`, `[data-slot=tab-title]`) + `[data-slot=tab-close]` (status marks, close X, snooze-archive's action) ✔ `liveRowHTML` in `.spike/probe2.mjs` output |
| Tab key | `` `${server}\n${sessionHref}` `` for session tabs, `draft:<uuid>` for drafts ▸ `tabs.tsx:51`; value joins to `ctx.tabs.list()[].key` |
| Keyboard uses the *tab list*, not the DOM | ▸ `visibleTabs()`/`visibleTabIds()` (`tab-strip.tsx:415-416`) drive `session.previous/next` and `tab.1..tab.9` = `mod+1..9` (`:474-484`) |

Other plugins' nodes coexist inside those rows: `sidebar-repos` appends `[data-sidebar-repo]` inside the link and sets
`data-sidebar-active-at`/`data-sidebar-time-shown` on the row; `snooze-archive` sets `data-sa-tab-host` on the tab slot
and appends its own `[data-sa-actions]` inside `[data-slot=tab-close]`; `session-drag` adds no nodes, only window
capture listeners. Verified with all four loaded: 120 `[data-sidebar-repo]`, `[data-snooze-archive]` groups present,
tab menu extended (`Rename, Close tab, Snooze, Archive, Delete session…`). No plugin clashes over `display` on rows.

### Hiding rows with an attribute + injected CSS ✔

Rule used: `[data-tab-key][data-spaces-hidden]{display:none!important}`; hidden **119 of 121** rows:

| Measurement | Value |
|---|---|
| JS to set 119 attributes | **0.10 ms** |
| Forced synchronous layout right after | **3.90 ms** |
| `scrollHeight` before → after | **6836 → 850 px** (clamped to clientHeight) |
| MutationObserver (subtree, childList + `attributeFilter:["data-tab-key"]`) during hide+unhide | **0 callbacks, 0 records** — the platform filters attributes, so our writes wake nothing |
| Visible row hover/close | close button `opacity: 1`, row `:hover` true — intact |
| Attribute survival | survives a session switch, sidebar collapse/reopen, window resize; **lost on Cmd+R** (plugin re-applies on first pass) |
| Native tab right-click menu on a visible row | opens normally (`Rename / Close tab / Snooze / Archive / Delete session…`) |

The host does not re-render the row element on a status/title change, so the attribute persists; only a full page
reload recreates the list (plugin setup re-runs, which re-applies). No row height/`gap` side effects once hidden
(`display:none` removes the 4px gap too).

### What hiding breaks ✔

The host's own navigation and numbering run off `ctx.tabs.list()`, not the DOM:

- `Alt+ArrowDown` (session.next) moved the active tab to a row with `data-spaces-hidden` — the sidebar then shows no
  active row at all while the timeline renders that session (`probe3.json > keyboard.altDown1.activeHidden === true`).
- `Cmd+1` selected the **hidden** draft tab (`activeHidden: true`); `Cmd+2/3` happened to be visible.
- `Alt+ArrowUp`, `Shift+Alt+Arrow*`, `Cmd+1..9`, Ctrl+Tab native cycling: same class of bug, all unverified individually
  but the mechanism is identical.

**A window-capture keydown guard fixes it** ✔: a `keydown` listener on `window` with `{capture:true}` that calls
`preventDefault()` + `stopPropagation()` for `Alt+ArrowUp/Down` and `Cmd+<digit>` (and our own bindings) stops the host
handlers — the active tab did not change while the handler logged both keys. So the filter *can* own navigation, at the
cost of intercepting host shortcuts (see risks, G).

Also broken/at risk with CSS-only filtering:

- **Active row must never be hidden.** If the routed tab's row is hidden, the sidebar shows a list with no selected
  row (screenshot `.spike/shot-no-active-row.png`) while the timeline shows that session. Invariant: keep the active
  tab's row visible, and on a space switch focus a session inside the new space so the invariant is natural.
- **Drag reorder** (dnd-kit, `RestrictionToVerticalAxis`, 4px activation `tab-strip.tsx:519-526`) runs on the full tab
  list. Hidden rows remain sortable participants, so a visible row dropped one slot down can jump two global slots.
  **?** Not reproduced: synthetic pointer drags started the host drag (`[data-dragging=true]`, `cursor: grabbing`) but
  never reordered the list (`probe6.json > realDragChanged === false`), so I could not measure the filtered case.
  Needs real-hardware confirmation.
- **Scroll position**: clamped when the list shrinks; per-space scroll has to be restored by us (or dropped).
- **Home row** (`[data-action="vertical-tabs-home"]`), Search, New session are not tab rows and are unaffected
  (sidebar-repos hides Home with its own CSS).
- **Snoozed/Archived groups** are injected inside the same scroll region below the tab list; they are not tab rows and
  are unaffected. Archived sessions exist as closed tabs, so they are not in the sidebar at all (snooze-archive closes
  their tab when archiving, ▸ `gui.ts:189`).
- **Subagent sessions** are ordinary tab rows (their tabs carry `parentID` on the session), so they filter like any
  other row. A subagent row may be hidden while its parent is in another space — fine, but "the active row is always
  visible" means a routed subagent leaks one row into its space.
- **Draft tabs** have no session, so membership must be keyed by tab key; `promoteDraft` replaces the draft tab in
  place and changes its key (`draft:<uuid>` → `server\n/...`, ▸ `tabs.tsx:298-315`), so the assignment must migrate.
- **Sessions of other projects**: the sidebar is flat, so there is nothing project-specific to preserve. Home's
  project groups are a different surface and are not touched by this filter (see F).

### Group headers

None. A space filter only hides tab rows; there is nothing else to do to the list. (Home's per-project groups are not
in scope — see F/G.)

---

## B. Bottom strip

### The documented slot is full width ✔

`Slot at: "window.bottom"` rendered a probe bar **1600 × 40 at y=960 in a 1600 × 1000 window**. Its parent is the
shell root column (`relative bg-v2-background-bg-deep flex-1 …`), as a third sibling after the titlebar and the
sidebar+main row: `<PluginSlot at="window.bottom">` ▸ `shell.tsx:309`, immediately before `<ToastRegion/>`.

Consequences measured:

- It spans **the whole window**, under both sidebar and main, not just the sidebar.
- It **consumes layout height**: the shell row shrank to 960px, so the sidebar and the timeline both lost 40px.
  A 40px footer for a 276px sidebar therefore costs every session 40px of vertical space.
- It is above toasts and below everything else. It does not scroll, and survives render/layout changes by construction.

Verdict: correct place for a window-wide status bar, wrong place for an Arc space switcher.

### What the host DOM allows instead ✔

The sidebar's own flex column can hold one more in-flow row at its bottom. Probe: inserted a `div[data-spaces-probe-strip]`
into the Portal child (the `flex size-full flex-col`), immediately **before** `[data-slot="vertical-tabs-footer"]`:

| Measurement | Value |
|---|---|
| Strip box | 248 × 34 at x=18, y=880 (sidebar 276 wide, 18px start padding) |
| What it sits above | `[data-slot="vertical-tabs-footer"]` at y=922 holding a real `TitlebarItem` pill (28 × 28 at x=18), then the mount's 10px bottom padding |
| Sidebar collapse (`Cmd+Shift+B`) | strip translated off-screen with the rest (x = -258), returned at the same place; no re-attach needed |
| Window resize to 1180×760 | strip at y=640, still pinned above the footer |
| Cmd+R (full reload) | plugin setup re-ran, one strip, same place |
| Hot reload (bundle touched) | `setup` count 1 → 2, **exactly one** strip and one `window.bottom` node (cleanup removes the old one) |
| Coexistence | snooze-archive's Snoozed/Archived groups sit **inside** the scroll region above the strip; no overlap |

So: **inject a sibling into the Portal's flex column, before `vertical-tabs-footer` when present, else append**. Width
follows the sidebar (percent/auto), no `position: fixed` (the mount is `contain-strict` and the panel clips paint — a
fixed popover would be clipped out of hit-testing, as the skill warns).

Caveat: this assumes the mount's first child is the Portal column and that `[data-slot="vertical-tabs"]` is inside it.
Both are 2.2.5 internals (▸ `titlebar.tsx:813`, `shell.tsx:264`), not SDK contracts. Fallback chain below (G).

Alternative considered: one `TitlebarItem` per space. It is a public registry and renders in exactly that footer, but
each item is a 28px **circular pill, `self-start`, stacked vertically**, label on hover (`titlebar-items.tsx:54-64`) —
a vertical emoji stack, not an Arc strip. Probe rendered one: correct place, wrong shape. Usable only as a degraded
fallback.

What already sits at the sidebar bottom: `vertical-tabs-footer` (TitlebarItems — none in the user's current setup,
one in the probe), then the mount's `max(10px, safe-area)` padding. Nothing else. The Snoozed/Archived groups are the
last thing in the scroll region, so they scroll; a pinned strip does not collide with them.

---

## C. Trackpad swipe

### What the platform gives us ✔

On macOS Electron/Chromium there are **no gesture events**: `"ongesturestart" in window === false`,
`window.GestureEvent === undefined`, `maxTouchPoints === 0`. A two-finger trackpad swipe is delivered as a stream of
`wheel` events (`deltaMode 0`, pixels; `wheelDeltaX/Y` also present). So the swipe must be built on `wheel` + pointer
events only.

Synthetic wheel over the sidebar (CDP `Input.dispatchMouseEvent{type:"mouseWheel"}`) reached handlers on the strip and
on rows ✔:

- Target of a wheel over a row was the row's `SPAN` (title/badge), `deltaMode: 0`, deltas preserved proportionally
  (CDP's `deltaX` arrives **×2** in the event — a harness scaling artifact; do not hard-code thresholds from these
  numbers alone).
- `preventDefault()` from a `{passive:false}` listener on the strip worked (`defaultPrevented: true` for the later
  bubble listener too).
- A decaying tail simulates inertia: dispatched 8, 26, 44, 52, 40, 28, 16, 9, 4 → received 16, 52, 88, 104, 80, 56, 32,
  18, 8. A **naive accumulator committed 4 times in one tail** — a real state machine needs a latch: one commit per
  gesture, a reset on a ~120ms gap of no wheel events, and a cooldown after a commit.
- Vertical wheel over the strip is untouched (`axis: "y"`, not prevented) and still scrolls the list.

### Direction lock and history navigation

- Direction lock is ours: first event with `|deltaX| > |deltaY|` (and above a 2px noise floor) takes the gesture;
  otherwise never preventDefault, so normal list scrolling is unchanged.
- Unprevented horizontal wheel for 8 events (`deltaX` -300) over the list did **not** navigate: URL unchanged,
  `history.length === 1`. The app routes with in-memory history (`HistoryLocation`, ▸ `titlebar.tsx:132`), so a
  Chromium overscroll history swipe has nothing to go back to. `body` already computes `overscroll-behavior-x: none`;
  html and the scroll container are `auto` (`vertical-tabs-scroll` is `overflow-x: hidden`). **?** A real macOS
  rubber-band overscroll gesture is an OS/Chromium-level behaviour that CDP wheel injection does not reproduce; I
  cannot prove it is inert on hardware. Mitigation anyway: preventDefault on every x-locked wheel, plus
  `overscroll-behavior-x: none` on the sidebar element in our `Style`.
- **?** Inertia, momentum phase, and the exact feel (rubber-band, velocity) can only be validated on a real trackpad.

### Trackpad vs Shift+wheel

No reliable signal exists: `WheelEvent` carries no device type; Chromium translates Shift+wheel into a horizontal
delta too. Only heuristics are available (per-event magnitude, inter-event spacing: a mouse wheel gives isolated large
ticks, a trackpad a dense stream). Consequence for the design: a swipe must never be *required* — every space action
also has a dot click, a menu item and a keyboard binding. Treat a detected horizontal gesture as an accelerator, not
the only path.

### What a state machine needs (from the measurements)

`idle → arming (accumulate ≤2 events)` → `locked-x` (preventDefault, drive the strip transform) or `locked-y`
(hand back, do nothing until a 120ms gap) → `commit` (threshold reached; latch + 300ms cooldown) → `settle`
(animate back if below threshold). A new gesture starts only after a gap ≥120ms. Ignore events with `ctrlKey` (pinch
zoom) and events whose target is an editable field. Deltas must be accumulated, never treated as one-shot.

---

## D. Move-to-space entry points

### Registry: there is no session-row or tab menu ✔

`MenuItem` only accepts `menu: "session.panel" | "server.add" | "server.row"` (▸ `registries.d.ts:74-144`; matches
`host-api.md`). `session.panel` is the side-panel **+ menu**, `server.*` are Settings server rows. There is **no public
extension point for the tab right-click menu, the session header menu, or the Home row menu**, and `ctx.ui.Menu` has no
"open at a point" API.

The native tab menu is a Kobalte `Menu.Context` with exactly four entries: `Rename`, `Close tab`, separator,
`Delete session…` (`critical`) — ▸ `tab-nav.tsx:385-427`; verified in the harness (it also contained snooze-archive's
injected `Snooze`/`Archive`).

### How to add an item (proven pattern, own copy) ✔

`snooze-archive` does it by watching `<body>` portals for `[role="menu"][data-component="menu-v2-content"]`, recognising
the tab menu by the opener (`closest("[data-tab-key]")`) and by shape (last item after a separator / `data-variant=critical`,
language-independent), then inserting `menu-v2-item` nodes above the native Delete with `extendNative`
(▸ `snooze-archive/src/sessionmenu.ts:40-80`, `menu.ts:132-168`). Observed working in this harness: the menu contained
`Snooze` and `Archive` between `Close tab` and `Delete session…`.

For Spaces: **"Move to space ▸"** submenu (one item per space, emoji + name, current one disabled with a check,
separator + "New space…"), inserted the same way, with our own copy of the markup builder (self-contained plugin, no
sibling import). What breaks it: a host that renames `menu-v2` markup or changes the menu shape; Kobalte's internal
collection for arrow keys (we must move the highlight ourselves as snooze-archive does); items re-rendered after we add
(we must re-add idempotently); Escape-to-close must be dispatched on the menu, not called directly.

### Dragging a row onto a dot

Native rows emit `pointerdown/mousedown/pointermove/pointerup`; the host's own dnd-kit **PointerSensor activates at 4px
and owns vertical reorder** (`RestrictToVerticalAxis`, ▸ `tab-strip.tsx:519-526`), and `session-drag` already owns
**horizontal** drag from the same row (window-capture, holds the host's mousedown-navigation back, starts its own ghost
at 4px horizontal ▸ `session-drag/src/drag.ts:145-227`). A self-contained third gesture would have to steal one of
them. My synthetic attempts could not even trigger the host's reorder, so I could not test a clean takeover; a
`pointercancel` dispatched at `window` did not clear the host drag state either (`probe6.json`).

Recommendation: **v1 ships the menu entry only**; drag-to-dot is a v2 item behind a modifier (e.g. hold Option and drag)
or from the 16px avatar as a dedicated handle, once it can be proven on hardware. Do not claim it in v1.

---

## E. Session identity and events

### Enumerating

| Need | API | Notes |
|---|---|---|
| Open tabs | `ctx.tabs.list()` → `{ key, session?, active }` | reactive; **only open tabs**, so a space's "list of sessions" is the subset of open tabs |
| Tab sessions | `ctx.sessions.list()` → `SessionRef{ key, id, tab, server, pending, location }` | only sessions of open tabs |
| Routed session | `ctx.sessions.current()` | undefined on Home, drafts, first render |
| Titles / project / archived | `session.server.data.session.get(id)`, `.project.get(projectID)` | reactive stores |
| All sessions (Home, not the sidebar) | `server.client.session.list({…})` | not needed for the filter |
| Servers | `ctx.servers.list()/get(id)` | joined per server |
| Tab key | session tab: `` `${server}\n${href}` ``; draft: `draft:<uuid>` | tab key ≠ session key |

**Assignment key**: `${server}\n${sessionId}` (exactly `SessionRef.key`), plus tab-key entries for drafts. Never key by
tab key for sessions — the same session's tab key survives reorder/close/open, but the key contains the route, and a
subagent route can point at the parent's tab; session key is stable and is what persists.

### Events

`server.data.on("session.deleted" | "session.archived" | "session.unarchived" | "session.renamed" | "session.inbox.enqueued" | …)`
(used by snooze-archive, ▸ `gui.ts:570-588`). For Spaces v1 only `session.deleted` matters (prune the assignment); a new
session needs no event: `createKeyed(() => ctx.tabs.list())` sees the new tab, and the first prompt promotes the draft
in place (key change, ▸ `tabs.tsx:298`). Stale assignments for sessions deleted while the app was closed are inert; cap
and prune them.

### Store ✔/▸

- `Store.global(schema, initial)` in `Plugin.define({ stores })`, loaded before setup; key `plugin.<id>.<name>`,
  JSON in `opencode.global.dat` (SQLite `state` table). Values are **app-wide and synced across windows**; there is no
  per-window `StorageScope` (`"global" | {server,directory} | {session}`, ▸ `host-apis.d.ts:921-937`).
- Decoding: a field of a struct that is missing/fails takes its `initial`; a value that fails as a whole reads as
  `initial` (▸ `core.ts` Store docs). So additive optional fields are safe; **bumping a version literal that old data
  lacks would wipe the value** — keep `version` a `Number` and migrate in code instead.
- Writes are **debounced 100ms and serialise the whole value per write** (▸ `persistence/persist.ts:5,56,79`); the read
  cache caps at 8 MB (`storage.ts`), and there is no documented per-value size limit. Keep the value small (a few KB
  to tens of KB) and write on user actions only — never per render or per streamed delta.
- Expected frequency for Spaces: one write per create/rename/delete/move/switch, plus `lastSession` coalesced (≤1/s).
  Compare: the host itself writes ~11 KB per tab switch into `drafts.sqlite-wal` (performance.md), so this is noise.

---

## F. Switch behaviour

- **The sidebar list *is* the tab strip** in the vertical layout. `[data-slot="titlebar-tabs"]` is absent when
  `[data-slot="vertical-tabs"]` exists ✔; the horizontal titlebar strip is not rendered at all (▸ `titlebar.tsx:813`,
  `tab-strip.tsx:497`). So filtering the sidebar = filtering the tabs, and there is no second list to keep in sync.
- **Non-active spaces' tabs stay open** and their rows are hidden. That preserves the host's tab keys, composer state,
  scroll and side-panel state, avoids "recently closed" pollution, and costs nothing per switch. Closing them instead
  (snooze-archive's model) would make every space switch a batch of `tabs.close` + `tabs.open`, re-sync timelines and
  rebuild the tab order — rejected.
- **Restore a space's last active session**: keep `lastSession {server,id}` per space. On switch:
  1. record the outgoing space's current session (`ctx.sessions.current()`),
  2. set active, apply the filter,
  3. `const tab = ctx.tabs.list().find(t => t.session?.server.id === server && t.session.id === id)` →
     `ctx.tabs.focus(tab.key)`; if no tab is open any more, `ctx.tabs.open({server,id},{focus:true})` (only if the
     server is connected), else focus the space's first tab; if the space has no tabs at all, leave the route alone and
     keep the active row visible (see decisions).
- **Navigation across spaces**: opening a session from Home/palette/notification that belongs to another space must
  switch the active space to it (otherwise the routed row is invisible). Enforce the invariant
  `space(routedSession) === active` in the same sync that filters.
- **Drafts**: `Cmd+T` creates a draft tab; assign it to the active space at creation, migrate on promotion.
- **Home**: not a tab row, not filtered. It lists every session of every project (groups by project). A space with no
  tabs therefore looks empty in the sidebar; Home still shows everything. Filtering Home would be a second, much larger
  DOM job (project groups, lazy rows) — out of scope for v1.

---

## G. Risks and limits

1. **The filter is a lie the host does not know about.** Hiding rows leaves the real tab list intact, so every host
   feature that enumerates tabs (keyboard cycling, `mod+1..9`, reorder, "recently closed", tab count in the titlebar on
   mobile, dnd auto-scroll) still sees the hidden ones. Only the parts we intercept behave. This is the central
   fragility, and it does not go away with a nicer implementation.
2. **Keyboard interception is a hack.** It works today (proved) because the host's command key handlers sit below a
   window-capture listener. If the host moves to a capture listener, or to a native menu accelerator, our guard stops
   working and Alt+Arrow/⌘1-9 silently select invisible sessions. Degrade: if the guard cannot confirm it suppressed a
   host action (e.g. two consecutive key presses changed the active tab away from the space), turn the guard off and
   surface a warning in the strip rather than fighting.
3. **Selectors.** Stable-ish and documented: `[data-slot="vertical-tabs"]`, `[data-slot="vertical-tabs-scroll"]`,
   `[data-tab-key]`, `[data-titlebar-tab]`, `[data-slot="tab-link"]`, `[data-slot="tab-title"]`. **Undocumented** and
   the ones I would worry about: `[data-slot="vertical-tabs-mount"]` and its first-child Portal column,
   `[data-slot="vertical-tabs-footer"]`, `[data-slot="vertical-tabs-panel"]`'s containment, and the `menu-v2` markup.
   A host update that changes the column nests the strip in the wrong place (clipped or scrolled away) while rows still
   hide — the worst failure mode: silently filtering with no visible control. Guard: verify the anchor *and* that the
   strip has a non-zero box after placement; if not, **remove the strip and stop filtering** (fail open, all rows
   visible) and show one non-blocking warning row where the strip would be / a toast once per session.
4. **Layout switches.** Horizontal tabs and the Inbox layout have no sidebar. On `data-orientation`/layout change the
   strip is removed and filtering stops; switching back re-applies. (Inbox is a different list entirely — stand down.)
5. **Multi-window.** `Store.global` is shared and synced, so both windows share the active space and the assignments;
   switching in one window re-filters both. There is no per-window scope. Accept for v1 (document it) or keep `active`
   in `ctx.storage.memory` per window and persist only assignments (loses the active space on reload).
6. **Arc's page slide cannot be reproduced.** The host owns the list; we can transform/fade it but cannot show two
   spaces side by side. See "cannot match Arc".
7. **Accent colour.** Painting the sidebar per space means overriding host backgrounds (`--v2-background-bg-deep`) on
   host elements with `!important`, or a background layer behind the list; both are visual hacks that will look wrong
   on host updates. Recommend accent only on our strip (dots/pill) and an optional 2px rail we draw ourselves.
8. **Vertical drag reorder under a filter is unverified** and may move rows across a hidden boundary. If it does, the
   user sees a row jump. Mitigation: after a reorder, re-derive assignments from the *visible* order and keep hidden
   rows where they are (we can't easily reorder the host's array), or accept it and document.
9. **Performance** is not the risk (0.1ms + 3.9ms for 119 rows, zero extra observer callbacks); **correctness under
   host change** is.

---

# PROPOSED DESIGN

## Shape

One self-contained GUI plugin (`apps/opencode-plugins/spaces`), no sibling imports, no server part. It touches:

| Surface | Mechanism |
|---|---|
| State | `Store.global` (spaces + assignments), `ctx.tabs`/`ctx.sessions`/`ctx.servers` reads |
| Sidebar filtering | one injected `Style` rule + `data-spaces-hidden` attribute on `[data-tab-key]` rows |
| Bottom strip | one injected node in the sidebar's Portal flex column, before `vertical-tabs-footer` |
| Swipe | one `wheel` listener (`passive:false`) on `[data-slot="vertical-tabs-sidebar"]` |
| Menu | `menu-v2` items inserted into the native tab menu (own markup builder) |
| Keyboard | `Command` items + one guarded window-capture keydown remap |
| Row drag | **not in v1** (see D) |

## State model

```ts
type Space = {
  id: string            // "sp_" + short id, stable
  name: string          // "Work", "Home", …
  emoji: string         // one grapheme
  accent?: string       // token name, e.g. "info" | "warning" | "success" | "danger" | "muted"
  lastSession?: { server: string; id: string }
}
type State = {
  version: number       // 1, numeric so old data still decodes
  active: number        // index into spaces; clamped on read
  spaces: Space[]       // never empty; spaces[0] is the default and the fallback owner
  assigned: { server: string; session: string; space: string; at: number }[]  // capped 2000, pruned oldest
  drafts: { tab: string; space: string }[]                                    // capped 50
}
```

Resolution, in order: `drafts[tabKey]` → `assigned[server+session]` → `spaces[0]`. Invariants enforced in one place:

- `spaces.length >= 1`; `spaces[0]` cannot be deleted (delete moves its sessions to `spaces[0]` and refuses to delete
  the last space).
- `active` in range.
- new tab/draft: active space; unknown at startup: assigned space, else `spaces[0]`.
- draft promotion (`draft:<uuid>` → session tab) inherits the draft's space.
- `session.deleted` prunes the assignment.

Persist only on actions; coalesce `lastSession` writes (≤1/s). No `Store.session` (assignment is not per-session state).

## Filtering

```ts
const rows = document.querySelectorAll('[data-slot="vertical-tabs"] [data-tab-key]')
for (const row of rows) {
  const tab = byKey.get(row.dataset.tabKey!)
  const visible = !tab || spaceOf(tab) === activeId || tab.key === activeTabKey
  if (row.hasAttribute(HIDDEN) !== !visible) row.toggleAttribute(HIDDEN, !visible)
}
```

- One `Style`: `[data-tab-key][data-spaces-hidden]{display:none!important}`.
- One scoped `MutationObserver` on the sidebar (like `native-ui`'s DomHub): `childList` + `attributeFilter:["data-tab-key"]`
  (our attribute is never observed), coalesced into one rAF; plus `createKeyed` over
  `{tabs, activeId, assigned, drafts, activeTabKey}` for reactive changes; plus a `ResizeObserver`-free re-place pass
  for the strip.
- The active row is never hidden (invariant, A).
- On layout change (no `[data-slot="vertical-tabs"]`) remove everything and stop filtering.

## Strip

```
[data-spaces-strip]            height 28px, 6px radius, --v2 tokens, 4px gap above the footer
  [data-spaces-track]          overflow hidden, transform translateX(overscroll)
    [data-spaces-indicator]    absolute, slides via transform (180ms)
    button[data-spaces-dot]    emoji, aria-selected, 20px hit box
    button[data-spaces-plus]   width 0 → 22px, opacity/scale reveal on overscroll
  [data-spaces-add]            a 20px plus at the end (visible when ≥2 spaces) for create without swipe
```

- With one space: the strip is `hidden` (zero height, no border), so nothing changes for the default user.
- With ≥2: dots/emoji, active one highlighted, click switches.
- Overflow (many spaces): dots cap at the available width and the track scrolls horizontally with a mask, active dot
  scrolled into view (`scrollIntoView({inline:"nearest", block:"nearest"})` — the sidebar's vertical scroll must not
  move).
- Accent: the active dot's ring/pill uses the space's accent token; nothing else is tinted (decision).

## Swipe state machine (Arc-like)

Events: `wheel` on the sidebar (`passive:false`), plus pointer drag on the strip for mouse users? No — dots are buttons;
the strip itself needs no pointer gesture in v1.

```
S = idle | arming | x | y | cooling
onwheel(e):
  if e.ctrlKey or target editable or menu open or no strip → pass
  if S == cooling and now - last < 120 → accumulate nothing, pass
  if S in (idle, arming):
     if |dx| > 2 or |dy| > 2: S = |dx| > |dy| ? x : y ; acc = 0 ; start = now
  if S == y: if now - lastEvent > 120 → S = idle ; pass
  if S == x:
     e.preventDefault()
     acc += dx ; lastEvent = now
     overscroll = clamp(acc, -MAX, MAX)
     render: track transform, indicator offset, plus reveal
     if |acc| >= COMMIT (= min(0.45 * stripWidth, 90px)):
         commit(direction) ; S = cooling ; acc = 0 ; cooldownUntil = now + 300
on idle gap > 120ms:
  if S == x and not committed: spring back (220ms) ; S = idle
```

- **One commit per gesture** (the probe's naive version committed 4× in one inertia tail).
- Vertical gestures are never prevented: normal list scrolling is unchanged.
- `preventDefault` on every x-locked event, and `overscroll-behavior-x: none` on the sidebar, so no rubber-band or
  history-swipe can fire (history swipe unverified on hardware, C).
- Commit at the first space: reveal the plus; commit at the last: reveal the plus. Past `+60px` of overscroll the plus
  **fills** (accent background, icon cross-fades to a check over 120ms), creating the space on release; below threshold
  it springs back.
- Reduced motion (`prefers-reduced-motion`): no transforms; commit on threshold; dots swap instantly.
- All animation is `transform`/`opacity` only, no layout reads in the handler (read the strip width once on resize).

Animation plan (feel):

- indicator: `transform: translateX()` 180ms `cubic-bezier(.2,.8,.2,1)`; dots `scale(1.12)` on active.
- switch: rows swap in one frame (host rows are ours to hide), while the list column gets a one-shot
  `translateX(±24px)→0` + `opacity .85→1` over 140ms; reduced motion: instant. Two-phase (swap at midpoint) only if the
  first version feels too abrupt — measure on hardware.
- plus reveal: width/opacity/scale 140ms with the overscroll; fill = background-color 120ms + icon swap.

## Keyboard

- `Command`s: `spaces.next` (`ctrl+alt+ArrowRight`), `spaces.previous` (`ctrl+alt+ArrowLeft`), `spaces.new`,
  `spaces.rename…`, `spaces.delete…`, `spaces.move…` (palette), `spaces.go1..9` (`ctrl+<n>`, macOS only — on Windows/Linux
  Ctrl+N is the host's tab number).
- Window-capture guard (only while ≥2 spaces and the sidebar exists): remap `Alt+ArrowUp/Down` and `Cmd+1..9` onto the
  **visible** rows of the active space (skip when the event target is editable, inside a dialog/menu, or when a
  modifier combination other than the exact one is present). This is the fragile part; it fails open (see G.2).

## Menu

"Move to space ▸" in the native tab menu, above Delete, plus the same action in a palette command. Submenu lists spaces
with emoji; current space disabled with a check; separator; "New space…". Keyboard (arrows/Home/End/Enter/Escape) handled
by our own capture on the menu, as snooze-archive does. Re-added idempotently if the menu re-renders.

## Failure / degrade

| Failure | Behaviour |
|---|---|
| Sidebar absent (horizontal/Inbox/mobile) | do nothing; commands still work on the active space's tabs? No — commands are disabled while unfiltered. Strip removed. |
| Strip anchor not found, or strip box 0 after placement | **stop filtering** (remove all `data-spaces-hidden`), remove the strip, one toast: "Spaces: the sidebar layout changed; spaces are off until the plugin updates." |
| Menu markup changed | menu item absent; the palette command still moves a session. No toast (the feature is discoverable elsewhere). |
| Keyboard guard cannot suppress a host action | guard off, small warning glyph in the strip with a tooltip; dots/menu/swipe keep working. |
| Store value fails to decode | initial state (one space, no assignments); never throws in setup. |
| Session/server gone | assignment kept until `session.deleted`, then pruned; opening a session whose server is disconnected does nothing. |

Everything we add is removed in cleanup (attributes, style, strip, listeners, observer, timers), and setup is
idempotent (proved with hot reload: one strip after two setups).

## Test plan

**Unit (tsx + happy-dom, as the sibling plugins do)**

- reducers: create/rename/delete/move, resolve (draft → session key migration, unassigned → first, active clamp,
  delete → first, prune cap), startup reconciliation (unknown tabs → first, not active).
- swipe machine: pure reducer over `{dx,dy,t}[]`: axis lock, vertical pass-through, inertia tail (decaying deltas) =
  one commit, direction reversal re-arms, 120ms gap reset, 300ms cooldown, overscroll → plus reveal/fill, reduced motion.
- menu builder: items, disabled current, separator, keyboard navigation.
- DOM fixture (captured from this harness): filter idempotency, active-row exemption, unknown rows hidden, cleanup
  removes every attribute/node, observer ignores our own writes.

**Harness (bare vs spaces-only vs all plugins)**

- bare: strip absent/no visual change with one space; commands create a space.
- spaces-only: 2/3/12 spaces on 120 tabs — dots, click switch, filter count, active row visible, last session restored,
  reload persistence, sidebar collapse/resize, hot reload (one strip), menu move, delete moves rows, rename/recolour.
- all plugins (`sidebar-repos`, `snooze-archive`, `session-drag`, `notifications`): badges intact after filter, Snoozed/
  Archived groups unaffected, menu shows both plugins' items, session-drag horizontal drag still works on a visible row
  and on a hidden-space row (unverified today), notifications marks on hidden rows do not leak (they are hidden).
- keyboard: Alt+Arrow/⌘1..9 land only on visible rows; guard off means no worse than today.
- parity (`scripts/parity.mjs`): strip row vs a native sidebar row (height 28, radius 6, 13px/16px, muted tokens,
  hover), dots vs `IconButton size=small`; animation layer for the indicator (180ms) and the switch (140ms).
- perf (`scripts/perf.mjs --sidebar 150,600,12`): idle, sbscroll, sbhover, switch, coldload; plus a plugin-local number
  for a full filter pass (<5ms layout at 150+ rows, zero extra observer callbacks at idle).
- stress: 1 space, 12 spaces (overflow), 300 tabs, 0 tabs, long names, multi-codepoint emoji, light/dark, reduced motion,
  RTL sidebar (if in scope).

## Milestones (each ends in something visible)

1. **Spaces exist and show** — store, palette "New space…", bottom strip with dots (only with ≥2), click a dot to make
   it active (highlight only), persistence across reload. *Visible: two dots, the right one lit.*
2. **The filter** — hide non-active rows, new session/draft lands in the active space, active row exempt, switch
   restores the space's last session. *Visible: the sidebar shows only the active space's sessions.*
3. **Manage** — rename + emoji + accent picker, delete (sessions move to the first space), "Move to space ▸" in the tab
   menu and the palette. *Visible: rename dialog, menu item, rows move.*
4. **Swipe** — wheel state machine, dot slide, list offset/fade, overscroll → plus reveal/fill → new space, reduced
   motion. *Visible: a two-finger swipe switches spaces; overscrolling the end creates one.*
5. **Keyboard (+ drag if proven)** — commands, Ctrl+1..9, capture remap; drag a row onto a dot behind a modifier only
   if the harness/hardware pass proves it. *Visible: keys switch spaces; the row lands in another space.*
6. **Hardening** — degrade paths, parity report, perf table, all-plugins pass, stress, README + media.

## Effort

One experienced dev: **M1 1–1.5d, M2 1.5–2d, M3 1–1.5d, M4 2–3d (feel iteration dominates), M5 1–2d (drag +1–2d if it
survives), M6 2d** → **~9–12 dev-days**. Risk is concentrated in M4 (trackpad feel, needs hardware) and M5 (keyboard
takeover, drag). M1–M3 are low risk; M2 is the one that decides whether the whole concept holds.

## Cannot match Arc (no host API), and the closest alternative

| Arc behaviour | Why not | Closest |
|---|---|---|
| Slide whole pages sideways, two spaces visible at once | the list is the host's tab strip; we can only hide/transform it | dot strip slides + 140ms list offset/fade |
| Per-space tab bar, per-space split view, per-space pinned tabs | tabs and panes are global host state | none in v1; a space only filters the same global tabs |
| A space's list includes sessions not open as tabs | the sidebar lists open tabs only; Home groups all sessions by project | membership applies to tabs; Home untouched |
| Native "Move to space" in the tab menu | no `MenuItem` slot for session/tab menus | injected `menu-v2` item (own markup) + palette command |
| Space colour tinting the whole sidebar/window | no theming hook per surface; would mean overriding host variables | accent on our strip only (optional 2px rail we draw) |
| True trackpad gesture phases/inertia | Chromium exposes no gesture events; wheel only | wheel state machine with gap/velocity heuristics |
| Animated reflow of the list when switching | host owns layout; FLIP on host rows is possible but fragile | two-phase offset/fade of the list column |
| Drag a row into a space as a first-class gesture | dnd-kit owns vertical drag; session-drag owns horizontal | menu in v1; modifier/handle drag later |
| Per-space scroll position of the sidebar | host owns the scroller and its content height | save/restore `scrollTop` approximately, or reset |
| Per-window active space | plugin storage is app-wide and synced | shared active space, documented |

---

## Decisions I need from you

1. **Scope of a space**: filter only the open tabs (Home stays a global list of everything), or also hide non-space
   sessions on Home? (Home is a second, grouped, lazily-rendered surface — I recommend tabs only for v1.)
2. **Cross-space navigation**: opening a session from Home/palette/a notification that belongs to another space should
   (a) switch to that space automatically (recommended), or (b) move the session into the current space?
3. **Keyboard**: may I take over the host's own `Alt+ArrowUp/Down` and `Cmd+1..9` with a window-capture guard so they
   only see the active space (fragile but verified to work today), or should I add only new bindings
   (`Ctrl+Alt+←/→`, Ctrl+1..9) and leave the host ones alone (they can land on an invisible session)?
4. **Drag a row onto a dot**: ship v1 with the context menu / palette only (recommended, I could not verify a clean
   drag takeover), or spend the extra 1–2 days on a modifier/handle drag?
5. **Accent colour**: strip only (recommended), or also tint the sidebar background for the active space (a host-variable
   override that will be fragile)?
6. **Empty space**: when you switch to a space with no open tabs, should it (a) open a new draft in that space, or
   (b) leave the current session on screen while the sidebar shows an empty space (recommended: no surprise tabs)?
