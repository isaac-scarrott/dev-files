# timeline-rail: design

A vertical tick rail in the gutter left of the chat column, one tick per prompt of yours, in the style of t3-code's
message timeline (`MessagesTimeline` minimap, source `apps/web/src/components/chat/TimelineMinimap.tsx` and
`MessagesTimeline.logic.ts` in pingdotgg/t3code). Point at the strip for a card with the prompt and the start of its
reply; click to land that prompt under the sticky header. Written against OpenCode Desktop 2.2.5 (`@opencode/plugin` 2.2.5). Line references
point at the renderer sources extracted from `app.asar`.

## What it does

- Mounts through the `session.header` slot of every timeline, but renders nothing there: the slot's element only
  locates its own scroller (`closest("[data-scrollable]")`) and the session view root (the parent of
  `[data-slot='session-timeline-scroll']`), into which the rail is portalled.
- The rail is absolutely positioned over the visible timeline area (`[data-slot='session-timeline-visible']`, below
  the sticky header's `offsetHeight`), hugging the view's left edge (6px in), moving toward the chat column only when the gutter is narrower. The
  gutter is read from the first mounted `[data-timeline-row][data-message-id]` (which follows the host's panel
  motion), falling back to the `--container-session` token when no row is mounted.
- The tick whose turn contains the fold is the current one and follows the scroll; the card and the click reuse the
  reveal machinery below. The rail stands for the whole conversation: it pages older history in behind the user
  (next section), so ticks, cards and jumps cover every prompt, not just the ones the host has loaded.

## Full history (`history.ts`)

The host loads the newest page of a session and pages older ones only when the user scrolls up
(`message.sync`: `limit` 20 messages, `order: "desc"`; `message.more(id)` is true while a cursor remains;
`message.loadMore(id, { signal, all, beforePublish })` prepends one page, or every page with `all`). A rail built on
`message.list` alone showed only the loaded tail, so in a long thread it was wrong until the user scrolled up.

While the slot is active and `more(id)` is true, `loadHistory` requests one page at a time:

- **Cheap.** One request per page (10 prompts), never `all` (that holds every page back and publishes once, so the rail
  would stay stale for the whole fetch and one huge store write would land at once). Before each request it waits a
  frame and until the user has been still for 160ms (wheel, touch, pointer-down or key on the timeline; a scroll event
  does not count, since the loader's own corrections would reset it). It joins a load the host started itself
  (`loadMore` waits on the in-flight one) instead of duplicating it.
- **Cancelled.** One `AbortController` per run, aborted by the effect's cleanup: the slot unmounting (session switch,
  plugin reload), the timeline going inactive, or `more` flipping. The effect tracks `active` and `more` through
  memos and runs the loader `untrack`ed: the loader's own reads of the cursor would otherwise restart it after every
  page and abort the request in flight (found in the harness, one restart per page).
- **No jump.** `beforePublish` runs inside the store batch, so the row at the fold and its offset are captured just
  before the page lands, and for four frames after it the plugin puts that row back if it moved (more than 1px) unless
  the user has started scrolling. Measured on 2.2.5, the host already holds the reading position (pinned to the end or
  scrolled mid-thread), so the correction fires 0 times: it is a guard, not the mechanism. The plugin never calls
  `scrollTo` for any other reason during a load, so it does not fight the host's virtualizer.
- **Quiet while it works.** The tick column's `aria-busy` is set and a 2px mark above the first tick breathes
  (opacity 0.25↔0.9, 1.4s; static 0.6 under reduced motion). The ticks reflow as pages arrive; the current-position
  marker snaps instead of sliding while they do.
- **Fails soft.** A failed page ends the run with the ticks it has; the next trigger (`more` flipping, reactivation)
  starts again. Errors are the host's to report.

## Model (`rail.ts`, pure)

- **Prompts**: `message.list(id)` filtered as the host's `visibleUserMessages` (`session-domain.ts`): `type ===
  "user"`, and `id < info.revert.messageID` when a revert is pending. Each carries a one-line title
  (`metadata.displayText` for commands, else the text; `[image]` / `[name]` / `@agent` for attachment-only prompts;
  `(empty prompt)` otherwise; cut at 200 chars) and the start of its reply: the first non-blank `text` part of the
  first assistant message with one, markdown stripped, cut at 240 chars. A reply with no text that is still
  streaming (`time.completed` unset, no error) shows "Working…"; a finished tool-only turn shows the prompt alone.
- **Layout** (t3-code's model; there is no bucketing and no scale limit): one tick per prompt, always. The strip is
  `min((n - 1) * 8px, calc(100vh - 18rem))` tall (never negative), centred in the rail's box, with prompt `i` at
  `i / (n - 1)` of it; past the cap, ticks overlap rather than merge into buckets. The height depends on the count and
  the window only, so the composer or a question or permission form appearing does not move or resize it. Every tick
  is 8px long and rests at 0.45 opacity (0.8 while the pointer is over the strip); in-view and current ticks are full
  colour. There is no vertical bar.
- **One hit target.** The strip is a single `<button aria-label="Jump to message: …">` over the whole rail. The pointer's
  position maps linearly to the nearest prompt **index** (`round(progress * (n - 1))`, `indexFromPointer`), so every
  prompt is reachable when ticks overlap, and no tick has a listener. Hover, drag and the keyboard all just set the
  active index. Click jumps to it.
- **Drawing ticks** (`strip.ts`): one DOM node per prompt was measured and rejected, because paint cost is linear in
  the node count even when only a few change (see Verification). The faint ticks are one `repeating-linear-gradient`
  element whose period is `height / (n - 1)`; only prompts with something to show get a real node: the fisheye band
  (active index +-2), the in-view range and the current prompt. A node with nothing left to show is removed 220ms
  later, after its transition. `--max` on the host places every node and the gradient, so a count change writes one
  property.
- **Fisheye by index distance** from the active prompt: scale-x 1, .667, .417 at distance 0, 1, 2 and 1/3 (the 8px rest
  length) beyond, as t3-code, with a little extra thickness near the centre. It replaces the old pixel-distance dock
  lift; the peak is 3x the rest length, against 2.4x before.
- **In view.** Every prompt whose turn intersects the viewport (from the mounted rows: `visibleRange`, owners of rows
  that intersect the area under the header; overscan rows are ignored) is drawn in full colour, not only the current
  one. The current prompt stays the one under the fold, and the aria-label and chevrons use it.
- **Previous / next turn**: the host's `ctx.ui.IconButton` (`ghost-muted`, `small`, `chevron-down`, rotated for
  previous) in `ctx.ui.Tooltip` ("Previous turn" / "Next turn"), above and below the strip, invisible until the
  pointer is over the strip or one of them or one has focus, disabled at the ends. The catalog has no `chevron-up`.
- **Pass-through**: a press that starts on the strip scrubs; a button-down pointer that arrives from elsewhere (a text
  selection drag, a scrollbar) flips the strip to `pointer-events: none` until release, so it never hijacks them. A
  release outside the window skips `pointerup`, so the next button-free move counts. The wheel on the rail is
  forwarded to the timeline scroller (`scrollBy`, with the host's unpin nudge).
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

**Unloaded page**: every prompt with a tick is in `message.list`, because the loader above pages the whole history in.
A click while older pages are still arriving can only name a loaded prompt; `revealFar` keeps its own `loadMore`
step for the case where the id list and the store disagree.

**Glide**: the final screen is tweened by the plugin (`tween.ts`): one `scrollTop` write per frame along
`1 - (1 - t)^4` (a strong ease-out, the host's `--ease-out` shape), 180ms plus 0.12ms per px, capped at 420ms. A wheel,
touch, pointer-down or key on the scroller stops it where the user put it; so does abort. The browser's
`behavior: "smooth"` has no ease-out to match and cannot be interrupted by a new jump, which is why it is not used.
Reduced motion writes the target once with `behavior: "auto"`.

## Telling the host the user scrolled

The host pins the timeline to its end while a session streams, and a pinned virtualizer scrolls back to the end on
every size change (`virtualizer.tsx:413`). Only pointer or touch scrolls unpin it (`virtualizer.tsx:909`); a
programmatic `scrollTo` does not. Before scrolling, the plugin dispatches a bubbling `WheelEvent` with `deltaY: -1`
on the scroller. The host's `handleListWheel` (`virtualizer.tsx:794`) then releases its tool anchor, bumps the
user-scroll mark and unpins. Nothing else in the wheel handler acts on a zero-distance wheel.

## Native look and motion

Motion follows `reference/animation.md` (Emil Kowalski): ease-out `cubic-bezier(0.23, 1, 0.32, 1)` for appearing and
revealing, `cubic-bezier(0.77, 0, 0.175, 1)` for on-screen movement, only `transform` and `opacity`, nothing runs until
`data-armed` (two frames after the rail exists, so nothing animates on first paint).

| what | how often | motion |
| --- | --- | --- |
| Tick in view / current | tens per day | opacity of a second line (`::after`, 0 → 1) 150ms ease-out; no colour or `background` transition |
| Fisheye | tens per day | the active prompt and two neighbours each side scale-x by index distance (above); `transform` 150ms ease-out per tick, so it retargets as the pointer moves; cleared on leave; off under reduced motion |
| Prev / next turn | on hover | `opacity` 150ms ease-out |
| Card enter | occasional | the card mounts in its closed look and flips `data-entered` a frame later: opacity and `scale(.96 → 1)` 140ms ease-out, `transform-origin` at the hovered tick (`--card-origin`) so it grows out of the tick |
| Card between ticks | continuous while open | stays mounted: `translateY` glides 140ms to the next tick, content swaps; no re-pop, no delay (the host tooltip's skip delay) |
| Card exit | occasional | 90ms ease-out to opacity 0 / `scale(.96)`, then unmounts; reopening during it reverses from the current value (transitions, not keyframes, so both directions are interruptible) |
| Rail appear / disappear | when the second prompt arrives | opacity 200ms in, 160ms out with `visibility` delayed; resizes and breakpoint changes are instant |
| Jump | per click | the tween above |
| History mark | while loading | the opacity breathe above |

- Ticks use the host's text scale: `--v2-text-text-faint` at rest, the `-base` line shown at 0.6 for the hovered one
  (a muted stand-in without a colour transition) and fully for in-view and current ticks; `:focus-visible` outlines with
  `--v2-border-border-focus`.
- The card is `menu-v2-content`'s surface (`--v2-background-bg-layer-01`, `--v2-elevation-floating`, 6px radius) at
  8px 10px padding: a faint "73 of 150" (hidden while history loads, because the total is not known
  yet), the title 13px/16px weight 530 on one line with an ellipsis (t3-code: one line), the reply start 11px/14px weight 440 in
  `--v2-text-text-muted` clamped to three lines, `dir="auto"` for RTL. Open delay 400ms, instant re-open within 300ms
  of a close and instant on keyboard focus copy the host tooltip (`ui/src/overlays/tooltip/tooltip.tsx`). A 4px bridge
  keeps the pointer inside while it moves from the rail to the card.
- Keyboard on the focusable strip: focus sets the active index to the current prompt (the card opens at once on
  `:focus-visible`), ArrowUp/Down, PageUp/PageDown (5), Home/End move it, Enter or Space jumps, Escape closes the card.
  Touch pointers never open the card; a tap jumps.
- The rail hugs the left edge and is at most 28px wide, so it never reaches the chat column; it hides under
  the breakpoints in "Model".
- `prefers-reduced-motion: reduce`: jumps write once with `behavior: "auto"`, the fisheye is off, the ticks
  fade (opacity 120ms linear) instead of moving, the card fades without scale or glide, the history mark is static.

### Native parity

The card has no sibling the parity tool can put beside it: the library's `Popover`/`SummaryCard` (the session details
dialog) is a click-opened `role=dialog` that takes focus and closes on outside press, and `ctx.ui.Tooltip` takes one
line of text on the host's dark surface. A rail card must open on hover without focus, hold two text blocks and move
between ticks, so neither fits, and wrapping it in one would change behaviour. N/A, with these stand-ins: surface,
radius, shadow, padding and type scale are the `menu-v2-content` / session-summary values read from the host (list
above), and the tooltip's delays are copied from its source. The ticks, marker and history mark have no native
sibling at all. No `parity.spec.mjs` exists for this plugin.

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
- **Loading older history one page per click on the first tick** (the previous design): the rail was wrong in any thread
  the host had not paged, until the user scrolled up. Replaced by the background loader.
- **`loadMore(id, { all: true })`**: one long request with no intermediate state, then one store write for the whole
  conversation. Page-wise loading keeps the ticks growing and each write small.
- **Browser smooth scrolling for the glide**: no ease-out, not interruptible by a second jump.

- **Bucketing prompts into fewer ticks** (previous design): past 4px of pitch one tick stood for N prompts and the card
  showed the first. Replaced by one tick per prompt and index-based scrubbing.
- **A DOM node per prompt**: paint cost is linear in the count (58ms a frame at 1,000 ticks); gradient plus a band.
- **Per-tick buttons**: impossible once ticks overlap; one strip target maps the pointer to an index.

## Verification

Unit tests (`pnpm test`, `node:test` on happy-dom with `--conditions=browser`) cover the prompt model, labels,
markdown stripping, rail height, index from pointer (every index of 5,000 reachable), fisheye band, in-view range,
the strip's band updates (only the ends that moved are touched, nodes retire), current-prompt selection, the probe direction and its turnaround, the
reveal plan, the glide plan, the history loader (paging, quiet wait, abort, reading-position hold, failure), the scroll
tween (ease-out shape, direction, user take-over, abort), and the slot (geometry, tracking, scrub-to-index, click, card timing and
identity, fisheye, pass-through, wheel forwarding, keyboard, previous/next, history busy state and abort, hide conditions). Live
verification runs against a second, isolated desktop app driven over CDP
(`.claude/skills/opencode-gui-plugins/reference/browser-testing.md`, `scripts/desktop-harness.sh`); GUI plugins do
not load on the web build (`runtime/plugin/root.tsx`: the plugin bridge is desktop-only). Prompt rows only unmount
when a turn has many parts, so the far path needs a seeded session with multi-part answers. Subagent sessions have
no desktop route to open directly, so the `compact` slot input is covered by the unit tests only.

Harness numbers from the earlier bucketed layout (2.2.5, seeded 150-turn session = 300 messages = 15 pages): ticks on open before the loader, 20 prompts
of 150 (13%); after, all 150 covered (124 buckets at that height) in 4 requests-worth of frames locally and one page per
request under a 450ms-delayed network. Reading position while 13 pages landed with the user scrolled mid-thread: tracked
row top 55px → 55px every frame, content grew 8430 → 28230px, corrections fired 0 times; pinned to the end: bottom row
at 850px every frame. Clicking 9 ticks across the thread (first, last, buckets, back and forth) landed the prompt at 0px
under the header each time, except the very last prompt, which the list's end clamps below the fold like the host's
own. Jump tween 290–500ms for 1–10k px. Not verified live: the 768px breakpoint (unit tests only), light/dark, touch.

### Scale (t3-code model, measured on 2.2.5)

The previous layout bucketed prompts once the pitch hit 4px (60% of the height): at the harness window (898px rail box)
that was 134 ticks, so 400 prompts were 134 ticks of 3, 1,000 of 7-8 and 5,000 of 37, and the card showed each
bucket's first prompt only. Now there are 400 / 1,000 / 5,000 ticks and the pointer picks any prompt.

- Harness, seeded 400 and 5,000-turn sessions (the loader paged all 5,000 in, 10 prompts a page, to the end): 360
  scripted mouse moves along the strip, frames p50 8.3ms, p95 9.2ms, max 9.4ms (120Hz); 18 DOM nodes in the rail when
  idle, 28 while hovering (the band: 5 fisheye + 3 in view + current).
- One DOM node per prompt (the first implementation), 800px strip, band updates every frame: frame p50 16.7ms at 400,
  57.9 at 1,000, 116.7 at 2,000 (paint cost grows with the node count while main-thread task time stays ~4-8ms). The
  gradient plus band: p50 8.4ms at 400, 1,000 and 5,000 alike.
- The pointermove handler runs 0.5ms (400) to 2.6ms (5,000) of script in a tight loop of synthetic events including
  the forced layout of the strip rect.
- Not changed: a jump to a far prompt still probes one viewport per frame (`jump.ts`). At 5,000 prompts a jump from the
  end to the middle took about 10s and an interrupting click stops it early; it lands within a few prompts of the
  pointer (one pixel of strip is ~7 prompts at 5,000).
