# timeline-rail: design

A vertical tick rail in the gutter left of the chat column, one tick per prompt of yours, in the style of t3-code's
message timeline. Hover or focus a tick for a card with the prompt and the start of its reply; click to land that
prompt under the sticky header. Written against OpenCode Desktop 2.2.5 (`@opencode/plugin` 2.2.5). Line references
point at the renderer sources extracted from `app.asar`.

## What it does

- Mounts through the `session.header` slot of every timeline, but renders nothing there: the slot's element only
  locates its own scroller (`closest("[data-scrollable]")`) and the session view root (the parent of
  `[data-slot='session-timeline-scroll']`), into which the rail is portalled.
- The rail is absolutely positioned over the visible timeline area (`[data-slot='session-timeline-visible']`, below
  the sticky header's `offsetHeight`), centred in the gutter between the view's left edge and the chat column. The
  gutter is read from the first mounted `[data-timeline-row][data-message-id]` (which follows the host's panel
  motion), falling back to the `--container-session` token when no row is mounted.
- The tick whose turn contains the fold is the current one and follows the scroll; the card and the click reuse the
  reveal machinery below. Older history that is not loaded yet has no ticks; clicking the first loaded tick when
  `message.more(id)` is true loads one page and probes for the prompt.

## Model (`rail.ts`, pure)

- **Prompts**: `message.list(id)` filtered as the host's `visibleUserMessages` (`session-domain.ts`): `type ===
  "user"`, and `id < info.revert.messageID` when a revert is pending. Each carries a one-line title
  (`metadata.displayText` for commands, else the text; `[image]` / `[name]` / `@agent` for attachment-only prompts;
  `(empty prompt)` otherwise; cut at 200 chars) and the start of its reply: the first non-blank `text` part of the
  first assistant message with one, markdown stripped, cut at 240 chars. A reply with no text that is still
  streaming (`time.completed` unset, no error) shows "Working…"; a finished tool-only turn shows the prompt alone.
- **Layout**: ticks are laid at a pitch of 10px down to 4px so they fit 60% of the rail's height; beyond that, prompts
  are bucketed into evenly sized ticks (`(and N more)` in the label; the card shows the bucket's first prompt).
  Tick length (6/10/14px) follows title length (<40 / <160 / longer).
- The rail hides under two prompts, when the gutter is under 44px (the column's own padding), below the host's 768px
  desktop breakpoint, and for inactive (cached) timelines.

## Current prompt

Recomputed on every scroll (rAF-throttled), resize (`ResizeObserver` on the view and the visible area), list change
and after each jump. The fold is the viewport top plus the sticky header's `offsetHeight` (`[data-session-title]`,
the inset `use-session-hash-scroll.ts` `scrollToElement` uses) plus an 8px tolerance. Every mounted row carries
`data-message-id` = its owning prompt (`session-timeline-row.tsx:585`), so the first mounted row whose bottom is
below the fold names the current turn; a row the host does not list resolves to the listed prompt before it.

## Reveal (`jump.ts`)

Two paths, chosen at click time by whether the prompt's row is mounted. A new click aborts a jump in flight.

**Mounted anchor** (short distance): `scroller.scrollTo({ top: anchorTop - inset, behavior })`, the host's own
geometry. When the anchor is more than two viewports away, the scroller first jumps to one viewport beside the
anchor and glides from there; the host's `scrollToEnd` does the same in the other direction ("Glide only the final
screen", `virtualizer.tsx:602`) because gliding across the whole history streams every row through the virtualizer.

**Unmounted anchor** (far): no plugin API scrolls the virtualizer to an index, and desktop routes through a
`MemoryRouter` (`src/renderer/window/router.tsx`), so writing `location.hash` never reaches the host's hash scroll.
The plugin probes: it pages the scroller towards the prompt one viewport per frame with `behavior: "auto"` until
the virtualizer mounts the prompt's row. The direction comes from the rows in view: every row carries its turn's
prompt id, so rows of the target's turn (or later) without the prompt row mean it is above, and rows of earlier
turns mean it is below. Only rows intersecting the viewport count, because the virtualizer keeps the last turn's
final row mounted at every scroll position, and it would otherwise read as "a later turn is below" everywhere. A
flip in direction halves the step (floor: a quarter viewport), so an overshoot corrects within a frame or two.
One-viewport steps overlap, so a rendered prompt row cannot fall between two stops; TanStack's two items of
overscan (`virtualizer.tsx:191`) are not enough for larger steps.

The virtualizer can render a stop one frame late, so the row found at one stop may unmount on the next render. The
plugin waits until the anchor is mounted and the scroll offset has held still for three frames; if the anchor goes
missing instead, it probes again from where it is, at most three attempts. Then it glides the final screen as above.

**Unloaded page**: `message.loadMore(id, { signal })`, then probe. One page per click; the rail is `aria-busy` and
dimmed meanwhile. The `AbortController` is aborted when the slot unmounts or the plugin reloads.

## Telling the host the user scrolled

The host pins the timeline to its end while a session streams, and a pinned virtualizer scrolls back to the end on
every size change (`virtualizer.tsx:413`). Only pointer or touch scrolls unpin it (`virtualizer.tsx:909`); a
programmatic `scrollTo` does not. Before scrolling, the plugin dispatches a bubbling `WheelEvent` with `deltaY: -1`
on the scroller. The host's `handleListWheel` (`virtualizer.tsx:794`) then releases its tool anchor, bumps the
user-scroll mark and unpins. Nothing else in the wheel handler acts on a zero-distance wheel.

## Native look and motion

- Ticks use the host's text scale: `--v2-text-text-faint` at rest, `-muted` on hover (fine pointers only), `-base`
  for the current tick; `:focus-visible` outlines with `--v2-border-border-focus`.
- The card is `menu-v2-content`'s surface (`--v2-background-bg-layer-01`, `--v2-elevation-floating`, 6px radius) at
  8px 10px padding; title 13px/16px weight 530, snippet 11px/14px weight 440 in `--v2-text-text-muted`, clamped to
  three lines, `dir="auto"` for RTL. Enter/exit copy the host tooltip (`ui/src/overlays/tooltip/tooltip.tsx`):
  `.12s ease-out` scale .96→1 in, `80ms ease-in` out, 400ms open delay, instant re-open within 300ms of a close,
  instant on keyboard focus. A 4px bridge keeps the pointer inside while it moves from the rail to the card.
- Keyboard: roving `tabindex` (the current tick is the tab stop), ArrowUp/Down, Home/End, Enter activates, Escape
  closes the card. Touch pointers never open the card; a tap jumps.
- `prefers-reduced-motion: reduce` scrolls with `behavior: "auto"` (as the host's jump-to-latest does) and drops the
  card animations and tick transitions.

## Lifetimes

- One slot instance per timeline; cached timelines keep theirs with `active: false`, where the rail unmounts and
  reads nothing. The scroller is found from the slot's own element, never by a global query, so a hidden timeline
  cannot act on the visible one.
- Listeners (`scroll`, `ResizeObserver`, media query, timers, the jump controller) live in the slot's Solid owner
  and are removed by `onCleanup`; plugin reload disposes them with the plugin root, so a reload leaves one rail.

## Rejected

- **Header button + palette command** (the previous `message-jump`): one target at a time, no overview, and the
  user reported the button not working for them. The rail shows every prompt and aims at any of them.
- **DOM-scraped floating pill**: fixed positioning over the timeline broke on pane resize and bled over other
  sessions. The portal into the session view root with per-timeline measurement has none of these problems.
- **`location.hash = "#message-<id>"`**: desktop uses a memory router; the hash never changes the host's `useLocation`.
- **Aiming the host's `message.previous` / `message.next`**: back-to-back host navigations collide in
  `use-session-hash-scroll.ts` and land the wrong prompt; the probe needs nothing from the host's navigation state.
- **A load-more affordance for unloaded history**: ticks only exist for loaded prompts; the first tick pulls one
  page per click, which keeps the rail honest about what can be reached.

## Verification

Unit tests (`pnpm test`, `node:test` on happy-dom with `--conditions=browser`) cover the prompt model, labels,
markdown stripping, layout and bucketing, current-prompt selection, the probe direction and its turnaround, the
reveal plan, the glide plan, and the slot (geometry, tracking, click, card timing, keyboard, hide conditions). Live
verification runs against a second, isolated desktop app driven over CDP
(`.claude/skills/opencode-gui-plugins/reference/browser-testing.md`, `scripts/desktop-harness.sh`); GUI plugins do
not load on the web build (`runtime/plugin/root.tsx`: the plugin bridge is desktop-only). Prompt rows only unmount
when a turn has many parts, so the far path needs a seeded session with multi-part answers. Subagent sessions have
no desktop route to open directly, so the `compact` slot input is covered by the unit tests only.
