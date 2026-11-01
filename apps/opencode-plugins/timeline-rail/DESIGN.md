# timeline-rail: design

A vertical tick rail in the gutter left of the chat column, one tick per prompt of yours, built to behave exactly like
t3-code's message timeline minimap (`TimelineMinimap.tsx`, `MessagesTimeline.logic.ts` in pingdotgg/t3code), including
how much of a conversation it covers: the newest 10 prompts, more only when the user scrolls for them. Point at the
strip for a card with the prompt and the end of its reply; click to land that prompt under the sticky header. Written
against OpenCode Desktop 2.2.5 (`@opencode/plugin` 2.2.5). Line references point at the renderer sources extracted
from `app.asar`.

## t3-code reference

Studied at pingdotgg/t3code `8760d063e903406c8e8f695b0852c0a15fc1e00f` (MIT). Files under `apps/web/src/components/chat/`
unless noted. This section is what the rail is held to; "Model" and below describe how OpenCode's data model realises it.

**Which prompts the rail knows (the limit).** The minimap has no limit of its own and loads nothing: it is
`deriveTimelineMinimapItems(rows)` ([timelineMinimapItems.ts](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/apps/web/src/components/chat/timelineMinimapItems.ts)),
one item per user-message row of the rows the timeline currently holds. The limit is the thread history window:

- Server: `THREAD_HISTORY_PAGE_POLICY = { maxUserTurns: 10, maxItems: 75, maxTurnItems: 500, maxEncodedBytes: 1 MiB }`
  ([apps/server/src/orchestration-v2/threadHistoryPaging.ts](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/apps/server/src/orchestration-v2/threadHistoryPaging.ts)).
  The initial window holds the newest **10 user turns** (all their items, at most 500 rows); an older page is
  `OLDER_THREAD_USER_TURN_LIMIT = 20` user turns. `THREAD_HISTORY_MAX_RAW_TURNS = 150`.
- Client: `useThreadHistory` / `hasMoreHistory` ([ChatView.tsx:529-548](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/apps/web/src/components/ChatView.tsx#L529-L548),
  [threadHistoryMerge.ts](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/packages/client-runtime/src/state/threadHistoryMerge.ts)).
  Older turns load **only when the user presses "Load earlier turns"** (`TimelineHistoryControl`, the first row of the
  list, [MessagesTimeline.tsx:1389-1415](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/apps/web/src/components/chat/MessagesTimeline.tsx#L1389-L1415)).
  Nothing loads in the background.
- Past the limit: the minimap shows only the loaded window, 10 ticks at first. The ticks grow by the page (20) when
  the user loads earlier turns; there is no marker, count or "more above" affordance on the rail, and no way to jump to
  a prompt that is not loaded (no tick exists for it). Nothing is thinned, bucketed or capped by count.

**Rail geometry** ([MessagesTimeline.logic.ts:281-284, 336-364, 432-469](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/apps/web/src/components/chat/MessagesTimeline.logic.ts#L336-L364)):
`TIMELINE_MINIMAP_MIN_ITEMS = 2` (fewer: render nothing); strip height `min(max(1, (n - 1) * 8)px, calc(100vh - 18rem))`,
vertically centred; item `i` at `i / (n - 1)` of the height (`resolveTimelineMinimapTopPercent`); pointer maps linearly to
`round(progress * (n - 1))` (`resolveTimelineMinimapIndexFromPointer`), so every item is reachable when ticks overlap.
Side gutter = `(viewport - min(viewport, content)) / 2`; persistent (always visible) when it is at least 48px, otherwise
the rail is `opacity-0` and shows on hover or focus-within; hit strip width = `clamp(floor(gutter) - 12, 0, 40)` (strip at
`left-3` = 12px); chevrons are interactive only when that width is at least 14 (`TIMELINE_MINIMAP_NAVIGATION_REACH`);
while a card is showing, the hit area widens to `22rem` so the card stays under the pointer. Only for `pointer: fine`.

**Ticks** ([TimelineMinimap.tsx:155-186](https://github.com/pingdotgg/t3code/blob/8760d063e903406c8e8f695b0852c0a15fc1e00f/apps/web/src/components/chat/TimelineMinimap.tsx#L155-L186)):
one `<span>` per prompt, `h-0.5 w-6` (2x24px) `origin-left`, scale-x by index distance from the active index:
0 -> 1, 1 -> 0.667, 2 -> 0.417, otherwise 0.333 (8px at rest). Colour `muted-foreground/25` at rest, `/60` for the active one.
`transition-transform duration-150` (Tailwind default curve). **In view** = `after:` overlay `foreground/55` fades in
(opacity 150ms) for each prompt whose **own user row** intersects the viewport (`isTimelineMinimapRowVisible`,
`resolveTimelineMinimapVisibleRange`). There is no separate "current" tick colour. Only transform and opacity animate. There is no
vertical line beside the ticks (t3-code draws a `border/15` hairline; dropped by choice).

**Hover, card, keyboard** (same file, 60-153, 188-258):
- One `<button aria-label="Jump to message: <active text or 'User message'>">` covers the strip. `mousemove` sets the
  active index from the pointer (ignored while a button is held that did not go down on the strip: pass-through for
  selections); `mouseleave` and `blur` clear it. **No open delay, no enter or exit animation, no glide**: the card is
  mounted while an index is active and removed when it is not.
- Click selects the pointed index and blurs the button; clicks on the card do nothing (text selectable).
- Keyboard: focus sets the active index to the current one (or 0); ArrowDown/ArrowUp +-1 (clamped), Home, End,
  Enter/Space select. No PageUp/PageDown, no Escape.
- Card: `left-8` (32px from the strip), `w-80` (320px), `rounded-xl p-3`, glass surface, `shadow-xl`. Top at the item's
  percentage; `translateY(-50%)`, except `0%` for the first item and `-100%` for the last (no viewport clamping).
  Content: the user text on one line (`text-sm font-medium leading-5`, ellipsis) and, if any, the turn's **final
  assistant message** text (`resolveFinalAssistantTextForTurn`: the last assistant message before the next user
  message) parsed from markdown to plain text (first 1,500 chars), `text-sm leading-5` muted, three-line clamp. No
  "n of N", no "working" state; an empty user text reads "User message".
- Chevrons: "Previous turn" / "Next turn" (`ChevronUp` / `ChevronDown`, `icon-micro` ghost buttons with a tooltip) centred
  on the strip's left edge (`left-1`, `-translate-x-1/2`), 2px above/below the strip. `opacity-0` until the button itself
  is hovered or focused (not on strip hover). They select the item before/after the **current** index, disabled at the
  ends. Current index = the first visible user row, else the user row before the visible range, else none.
- Wheel over the rail is forwarded to the timeline (`timelineMinimapWheel.ts`), ignoring `ctrlKey` and `deltaY === 0`.
- Jump: `listRef.scrollToIndex({ index: item.rowIndex, viewOffset: 24, animated: !reducedMotion })` after
  `navigateTimeline()` (releases follow).

**Never in t3-code:** background history loading, count text, thinning, a current-tick colour, PageUp/PageDown, Escape,
open delay, glide between ticks, "Working...", a separate loading mark, bucketing.

## How OpenCode realises it

| t3-code | here |
| --- | --- |
| Rows the timeline holds = thread history window (10 user turns, then 20 per "Load earlier turns") | `message.list(id)` is what the host has loaded (`message.sync`: newest `limit` 20 messages, older pages when the user scrolls up; in the harness the host also fetches a second page by itself ~250ms after the first). The rail covers the newest **10** prompts of that (`INITIAL_PROMPTS`), whatever the host holds; a page of older history joins (at most 20 prompts, `PAGE_PROMPTS`) only if it lands **after the user has scrolled, touched or typed in the timeline**, the stand-in for pressing "Load earlier turns" (`promptWindow`, `rail.ts`) |
| `deriveTimelineMinimapItems(rows)` | `prompts(messages)`: user messages of the window, minus those at or after a pending revert (the host's `visibleUserMessages`) |
| No loading by the minimap | The plugin has no way to request history: `Host` in `jump.ts` has no `loadMore`; `message.loadMore` and `message.more` are never called. The bundle does not mention them |
| Item with no tick past the window | No tick, so no click, key, chevron or card can name a prompt older than the window; the host's own scrolling still reaches it, and when the host has loaded it after the user scrolled, it gets a tick |
| `scrollToIndex(rowIndex, viewOffset 24)` | No API scrolls the host's virtualizer to an index, so `jump.ts` probes and glides (below); the landing is the sticky header's inset, not 24px |
| Current index (first visible user row, else the turn before the visible range) | `currentPrompt` in `target.ts`, the same rule on the mounted rows inside the area under the sticky header |
| In view = the prompt's own user row intersects the viewport | `visibleRange`, same rule, from the mounted `UserMessage` rows |
| Final assistant message's text | The last assistant message of the turn, its `text` parts joined, first 1,500 characters, markdown stripped by `stripMarkdown` (regexes; t3-code parses with remark, which is not in a plugin bundle) |
| Gutter from `[data-timeline-root]` width | Gutter from the first mounted row's left edge (follows the host's panel motion), else the `--container-session` token |
| Rail inside the timeline viewport, which ends above the composer | The composer overlays the timeline here, so the rail spans from under the sticky header to the view's bottom and is centred in that box, so a composer or form appearing does not move it |

## What it does

- Mounts through the `session.header` slot of every timeline, but renders nothing there: the slot's element only
  locates its own scroller (`closest("[data-scrollable]")`) and the session view root (the parent of
  `[data-slot='session-timeline-scroll']`), into which the rail is portalled.
- Nothing under two prompts. For `pointer: fine` only. Strip 12px from the view's left edge, `min(gutter - 12, 40)`px
  wide, hidden entirely when that is 0. At least 48px of gutter: always visible; less: invisible until the pointer is
  over it or it has focus. Chevrons need a strip of at least 14px.
- Inactive (cached) timelines unmount the rail and read nothing. Below the host's 768px breakpoint there is none.

## Model (`rail.ts`, pure)

- **Window** (`promptWindow`): see the table. Pure: `(previous window, host's loaded ids, asked) -> window`. The first call
  keeps the newest 10; new prompts at the end always join; older ones join by page (<= 20) only when `asked`.
  A reverted edge hands over to the next listed prompt; a window whose edge is gone reopens on the newest 10.
- **Prompts**: title = `metadata.displayText` for commands, else the text, whitespace collapsed, cut at 200 chars, else
  "User message". Snippet = the turn's last assistant message, markdown stripped.
- **Layout**: strip `max(0px, min((n - 1) * 8px, calc(100vh - 18rem)))` tall, centred in the rail's box; prompt `i` at
  `i / (n - 1)`. One `<span>` per prompt (`<Index>`, so a streaming update patches in place), 2x24px, drawn at a third
  (8px). No thinning, no bucketing: past the cap, ticks overlap.
- **One hit target**: a single `<button aria-label="Jump to message: <title of the pointed prompt, or 'User message'>">`
  over the strip. The pointer maps linearly to `round(progress * (n - 1))`. Click jumps to the prompt the card shows.
- **Fisheye**: scale-x by index distance from the pointed prompt, 1 / .667 / .417 / .333 at distance 0 / 1 / 2 / more.
  `transform` 150ms on Tailwind's default curve. The pointed tick is the stronger colour.
- **In view**: a second layer fades in (opacity 150ms) over ticks whose own prompt row is on screen. There is no
  current-prompt tick.
- **Card**: inside the button at 32px, 320px wide, 12px padding and radius, 14/20 type: the title on one line and the reply
  at three lines of muted text. Mounted while a prompt is pointed or focused, removed when not: no delay, no animation, no
  glide. It hangs off the tick (`top: <percent>%`, `translateY(-50%)`, `0%` for the first, `-100%` for the last). The
  strip widens to 22rem while it shows, so the pointer can reach the card. Moving over the card keeps its prompt; its text
  is selectable and a click on it does nothing. Colours and shadow are the host's menu surface tokens
  (`--v2-background-bg-layer-01`, `--v2-elevation-floating`).
- **Chevrons**: `ctx.ui.IconButton` (`ghost-muted`, `small`, `chevron-down`, rotated for previous) in `ctx.ui.Tooltip`,
  centred on the strip's left edge 2px above and below it, invisible until the chevron itself is hovered or focused.
  They step from the current prompt and disable at the ends.
- **Keyboard** (t3-code's): focus opens the card on the current prompt; ArrowUp/ArrowDown move by one (clamped), Home and
  End go to the ends, Enter or Space jump. The card goes when the strip loses focus.
- **Pass-through**: a press that starts on the strip scrubs; a button-down pointer that arrives from elsewhere (a text
  selection drag, a scrollbar) flips the strip to `pointer-events: none` until release. A release outside the window skips
  `pointerup`, so the next button-free move counts. The wheel on the rail scrolls the timeline (`scrollBy`, preceded by the
  host's unpin nudge), ignoring Ctrl and zero-`deltaY` wheels.
- **First paint**: ticks and the in-view layer animate only from two frames after the rail exists (`data-armed`), so
  nothing fades or slides in when the thread opens. t3-code has no such guard and fades the in-view layer on first load.

## Peer messages

A user message with `metadata.peerMessage` (set by orchestrator-tools' `send_message`) is not the user's prompt: no tick,
not in `loadedIds`, not a jump target, not counted for `MIN_ITEMS` or the window. It still ends the previous turn, so
the previous tick's snippet is the reply before it.

## Current prompt

Recomputed on every scroll (rAF-throttled), resize (`ResizeObserver` on the view and the visible area), list change and
after each jump. The viewport for the rule is the scroller below the sticky header's `offsetHeight`
(`[data-session-title]`, the inset `use-session-hash-scroll.ts` `scrollToElement` uses). Every mounted row carries
`data-message-id` = its owning prompt (`session-timeline-row.tsx:585`) and the prompt's own row has
`data-timeline-row="UserMessage"`.

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

**First prompt of the window**: it is probed for like any other. Older prompts the host has loaded may sit above it, so
scrolling to the top is not the same as reaching it. The jump never loads history: every prompt with a tick is already in
`message.list`.

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

## Look and motion

Motion is t3-code's, nothing added: `transform` on the ticks (150ms, Tailwind's default `cubic-bezier(.4, 0, .2, 1)`),
`opacity` on the in-view layer (150ms), on the chevrons' reveal (150ms) and, when the gutter is under 48px, on the rail's
own (150ms). Only `transform` and `opacity`; nothing runs until `data-armed`. The card and its removal are instant.

- Ticks use the host's text scale: `--v2-text-text-faint` at 45% at rest, `--v2-text-text-base` at 60% for the pointed
  one and in full for in-view ticks (t3-code: `muted-foreground` 25% / 60% and `foreground` 55%). `:focus-visible` outlines with
  `--v2-border-border-focus`.
- The jump itself is the plugin's: the final screen is tweened by `tween.ts`, one `scrollTop` write per frame along
  `1 - (1 - t)^4`, 180ms plus 0.12ms per px, capped at 420ms; a wheel, touch, pointer-down or key on the scroller stops
  it. Reduced motion writes the target once with `behavior: "auto"`, drops the tick transitions and fades the in-view
  layer in 120ms linear.

### Native parity

The card has no sibling `parity.mjs` can put beside it: the library's `Popover`/`SummaryCard` is a click-opened
`role=dialog` that takes focus and closes on outside press, and `ctx.ui.Tooltip` takes one line of text on the host's
dark surface. A rail card opens on hover without focus and holds two text blocks, so neither fits. N/A, with these
stand-ins: the colour and shadow tokens of `menu-v2-content`; the geometry is t3-code's (320px, 12px, 14/20), not the
host's menu (6px radius, 13px). The chevrons are the host's own `IconButton` and `Tooltip`. The ticks have no native
sibling. No `parity.spec.mjs` exists for this plugin.

## Lifetimes

- One slot instance per timeline; cached timelines keep theirs with `active: false`, where the rail unmounts and
  reads nothing. The scroller is found from the slot's own element, never by a global query, so a hidden timeline
  cannot act on the visible one.
- Listeners (`scroll`, `ResizeObserver`, media query, timers, the jump controller) live in the slot's Solid owner
  and are removed by `onCleanup`; plugin reload disposes them with the plugin root, so a reload leaves one rail.

## Rejected

- **Background history loading so the rail covers the whole conversation** (the previous design, `history.ts`): the
  conversation was fetched a page at a time behind the user, the rail grew visibly after opening, and it added requests
  the host would not have made. t3-code's minimap covers only the window it has loaded. Removed.
- **Tick thinning (`tickStride`) and the gradient-plus-band strip (`strip.ts`)**: built for 5,000 ticks, which the limit
  makes unreachable by anything but the user scrolling up through that many pages. t3-code draws one span per prompt at
  any count and so do we; measured below.
- **Card open delay (400ms), enter/exit animation and glide between prompts, "n of N", "Working...", `[image]` /
  `@agent` labels, PageUp/PageDown, Escape, the current-prompt tick colour, the hover brightening of the whole strip,
  the history breathe mark, the appear/disappear fade, chevrons shown on strip hover, the 28px column at 6px from the
  edge**: not in t3-code, removed.
- **Header button + palette command** (the original `message-jump`): one target at a time, no overview.
- **DOM-scraped floating pill**: fixed positioning over the timeline broke on pane resize and bled over other sessions.
- **`location.hash = "#message-<id>"`**: desktop uses a memory router; the hash never changes the host's `useLocation`.
- **Aiming the host's `message.previous` / `message.next`**: back-to-back host navigations collide in
  `use-session-hash-scroll.ts` and land the wrong prompt.
- **Browser smooth scrolling for the glide**: no ease-out, not interruptible by a second jump.

## Open questions (OpenCode's data model differs from t3-code's)

- **"Load earlier turns" has no counterpart.** OpenCode loads older pages when the user scrolls up. The rail takes a page
  that lands after user input as asked-for. Alternatives: a rail that never grows past 10 (t3-code's *initial* window
  only), or one that grows with every page the host loads, including the second page it fetches by itself (what the
  rail did first: the ticks grew 10 to 17 about 300ms after a long realistic thread opened).
- **Card text.** t3-code parses markdown with remark; here regexes, which handle fences, lists, quotes, links, tables and
  emphasis, but not nested or HTML-heavy markdown.
- **Card surface.** t3-code's `dropdown-glass` has no host equivalent; the host's menu surface colours are used.
- **Initial window by turns, not messages.** t3-code's server counts 10 user turns; the host pages by 20 messages, so the
  rail cuts the host's list to 10 prompts itself.

## Verification

Unit tests (`pnpm test`, `node:test` on happy-dom with `--conditions=browser`, 55) cover the window (first 10, growth by
page capped at 20 and gated on user input, revert edge, thread swap), prompts and the final-assistant snippet, labels,
markdown stripping, rail height, index from pointer (every index of 5,000 reachable), in-view and current prompt, the
probe direction, the glide plan, the scroll tween, and the slot (geometry, hit width and persistence by gutter, the
card's timing, position and content, fisheye, pass-through, wheel forwarding, keyboard, chevrons, window limits with
5,000 messages, zero `loadMore` calls, hide conditions). Live verification runs against a second, isolated desktop app
driven over CDP (`.claude/skills/opencode-gui-plugins/reference/browser-testing.md`); GUI plugins do not load on the
web build.

Harness, 2.2.5, isolated root, window 1400x1000 (strip 40px, gutter persistent), seeded sessions of 50, 300 and 5,000
plain turns and 400 realistic turns (1 to 3 assistant messages each, reasoning, bash tool parts with 300-line output,
fenced code and lists):

- Appears 68-124ms after the click with 10 ticks, and the count never changes over the next 6s, in all four sessions.
  The realistic thread, where the host fetches a second page of its own 250ms after the first, went 10 -> 17 before the
  user-input gate and stays at 10 with it.
- Requests to `/message` on a first open: realistic 2 (`limit=40`, then `limit=20&cursor`), plain 5,000 and 300 turns 1,
  identical with the plugin and without it (a baseline run with no plugin, same data). None come from the plugin: the
  bundle contains no `loadMore`, `more` or fetch.
- Scrolling up the realistic thread with the wheel (40 x 3,000px): 40 more page requests, all the host's, and the rail
  grew from 10 to 263 ticks as they landed; 120 x 6,000px reached all 390 loaded prompts. The ticks overlap into a grey
  bar there, as t3-code's do at 2px ticks on a 1.8px pitch.
- Clicks on ticks 0, 4 and 7 landed the pointed prompt at 0px under the header; the previous-turn chevron, Home + Enter
  and the arrows did the same and moved the label as expected. A wheel over the rail scrolled the timeline.
- Frames during a 240-move sweep over the strip: p50 8.3ms, p95 9.1ms, max 9.3ms with 10 ticks (idle 8.3 / 9.0 / 9.3,
  120Hz); with 390 ticks p50 8.3, p95 10.1, max 17.0.
- Card: left edge at strip + 32px, 320px wide, flush with the strip's top for the first prompt, centred for the others,
  flush with its bottom for the last; the strip widens to 22rem while it shows; chevrons at opacity 0 while the pointer
  is on the strip and 1 on their own hover.

Not verified live: touch and `pointer: coarse`, reduced motion, a gutter under 48px (unit tests only), light theme, the
768px breakpoint, subagent sessions (no desktop route).
