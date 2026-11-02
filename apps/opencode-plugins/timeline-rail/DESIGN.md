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
one `<span>` per prompt, `h-0.5 w-6` (2x24px) `origin-left`, scale-x by index distance from the active index (the
pointer's or keyboard's index, `null` when neither is on the strip, so **at rest every tick is at 0.333**, 8px, equal):
0 -> 1, 1 -> 0.667, 2 -> 0.417, otherwise 0.333. Colour `muted-foreground/25`, `/60` for the pointed one (distance 0).
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
| Current index (first visible user row, else the turn before the visible range) and the in-view marks | Replaced by the user's decision: one active prompt, by conversation context (`activePrompt` in `target.ts`, see Active prompt). Deliberately not t3-code's |
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
- **Fisheye**: scale-x by index distance from the pointed (or keyboard) prompt, 1 / .667 / .417 / .333 at distance
  0 / 1 / 2 / more, **only while the strip is pointed or focused**. At rest there is no centre and every tick is the
  rest width (0.333), the lit one included. `transform` 150ms on Tailwind's default curve, both ways (t3-code's
  `transition-transform duration-150` is always on, so the ticks ease back to equal widths when the pointer leaves).
- **Lit ticks**: a layer that fades in (opacity 150ms) over a tick, in the host's text colour at 60%. At rest exactly one
  tick is lit, the active prompt; its only difference from the others is that colour, never its width. While the strip is
  pointed or focused the pointed tick is lit too (two ticks, or one when the pointer is on the active one). Nothing marks
  the prompts on screen.
- **Card**: inside the button at 32px, 320px wide, 12px padding and radius, 14/20 type: the title on one line and the reply
  at three lines of muted text. Mounted while a prompt is pointed or focused, removed when not: no delay, no animation, no
  glide. It hangs off the tick (`top: <percent>%`, `translateY(-50%)`, `0%` for the first, `-100%` for the last). The
  strip widens to 22rem while it shows, so the pointer can reach the card. Moving over the card keeps its prompt; its text
  is selectable and a click on it does nothing. Colours and shadow are the host's menu surface tokens
  (`--v2-background-bg-layer-01`, `--v2-elevation-floating`).
- **Chevrons**: `ctx.ui.IconButton` (`ghost-muted`, `small`, `chevron-down`, rotated for previous) in `ctx.ui.Tooltip`,
  centred on the strip's left edge 2px above and below it, invisible until the chevron itself is hovered or focused.
  They step from the active prompt and disable at the ends.
- **Keyboard** (t3-code's): focus opens the card on the active prompt; ArrowUp/ArrowDown move by one (clamped), Home and
  End go to the ends, Enter or Space jump. The card goes when the strip loses focus.
- **Pass-through**: a press that starts on the strip scrubs; a button-down pointer that arrives from elsewhere (a text
  selection drag, a scrollbar) flips the strip to `pointer-events: none` until release. A release outside the window skips
  `pointerup`, so the next button-free move counts. The wheel on the rail scrolls the timeline (`scrollBy`, preceded by the
  host's unpin nudge), ignoring Ctrl and zero-`deltaY` wheels.
- **First paint**: ticks and the active layer animate only from two frames after the rail exists (`data-armed`), so
  nothing fades or slides in when the thread opens. t3-code has no such guard and fades the in-view layer on first load.

## Peer messages

A user message with `metadata.peerMessage` (set by orchestrator-tools' `send_message`) is not the user's prompt: no tick,
not in `loadedIds`, not a jump target, not counted for `MIN_ITEMS` or the window. It still ends the previous turn, so
the previous tick's snippet is the reply before it.

## Active prompt

Exactly one tick is lit: the prompt whose turn is being read, `activePrompt(ids, rows, line, scroll)` in `target.ts`
(pure). `line` is the reading line, `READING_OFFSET` (8px) under the sticky header's bottom edge (`[data-session-title]`
`offsetHeight`, the inset `use-session-hash-scroll.ts` `scrollToElement` uses), so a prompt a jump has landed under the
header is at or above it. Rows are the mounted `[data-message-id]` rows in document order; each carries its turn's
prompt id (`session-timeline-row.tsx:585`) and a prompt's own row has `data-timeline-row="UserMessage"`.

- Active = the owner of the last mounted row whose top is at or above the line. A long reply keeps its prompt active
  though the prompt's own row is far above and unmounted.
- A chat that fits (`scrollHeight - clientHeight <= 2`) and a chat scrolled to its very end (within 2px) are on the
  **last** prompt, even when its row is far above the line. A new streamed turn is therefore active at the bottom, and
  when scrolled up as soon as its row reaches the line.
- Above every row (the very top), or on a turn older than the rail's window: the **first** prompt. When every mounted row
  starts below the line, a prompt row means the line is in the turn before it, any other row means its prompt is above.
- One prompt is that prompt. There is no state without an active tick while there is a prompt (the rail needs two).
- An owner the rail does not list resolves to the listed prompt before it: a peer message (never a tick), a prompt past a
  pending revert (not listed, as before).

Resolved by observers, not by reading layout (`reading.ts`, `readReading`). The virtualizer mounts each row in a keyed
wrapper (`[data-timeline-key]`) under one container. Three observers and no scroll listener:

- **The line.** An `IntersectionObserver` whose root is everything above the reading line (`rootMargin` grown 10,000,000px
  upward, shrunk from below to end on the line) observes every wrapper. A wrapper intersects it exactly when its top is at
  or above the line, so the browser reports the crossing after layout, and a frame of scrolling costs nothing unless a
  row crosses. A thin band on the line was tried first and failed: a row that jumps across it in one frame (a far jump,
  history prepended above) never touches it, gets no callback and stays wrong; a half-plane cannot be skipped.
- **The very bottom.** A second `IntersectionObserver` on the container, threshold 1, whose root reaches far above the
  viewport and ends `tail` (the spacer under the container, measured) minus 2px above the viewport's bottom edge: the
  container lies wholly inside it exactly when the scroller is within 2px of its end. Nothing reads `scrollTop`: reading
  it from a scroll listener forced a layout every frame (the host's own scroll handler had just dirtied it), which was
  most of the earlier cost.
- **Size.** A `ResizeObserver` on the scroller, the sticky header and the container. Its notification (after layout, so
  reads are free) measures the line and the range, rebuilds the observers only when the margins changed, and is also the
  first measurement after a container is found (no read at mount). A `MutationObserver` on the container's children
  (children only) observes and unobserves wrappers as the virtualizer mounts and unmounts them.

`activePrompt` itself is unchanged and pure; `readReading` feeds it the wrappers in DOM order, each marked reached (top
at or above the line) or not, and the end state. The rail's place (`measure`: view box, gutter, `getComputedStyle`) is
measured on resize and list changes only, in one rAF.

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

**Glide**: the final screen scrolls with the browser's own `scrollTo({ top, behavior: "smooth" })`, with no plugin tween.
That is the host's: `use-session-hash-scroll.ts` `scrollToElement` (the host's jump to a message) and the virtualizer's
jump-to-latest (`scrollToEnd({ behavior })`, `virtualizer.tsx:594-604`) both call `scrollTo` with `"smooth"`, and the host
has no tween, duration or easing of its own. The plugin then waits until the scroll offset holds still for three frames and
corrects any drift. A wheel, touch or key during the glide takes over natively. Reduced motion writes the target once with
`behavior: "auto"` (the host's jump-to-latest does the same).

## Telling the host the user scrolled

The host pins the timeline to its end while a session streams, and a pinned virtualizer scrolls back to the end on
every size change (`virtualizer.tsx:413`). Only pointer or touch scrolls unpin it (`virtualizer.tsx:909`); a
programmatic `scrollTo` does not. Before scrolling, the plugin dispatches a bubbling `WheelEvent` with `deltaY: -1`
on the scroller. The host's `handleListWheel` (`virtualizer.tsx:794`) then releases its tool anchor, bumps the
user-scroll mark and unpins. Nothing else in the wheel handler acts on a zero-distance wheel.

## Look and motion

Motion is t3-code's, nothing added: `transform` on the ticks (150ms, Tailwind's default `cubic-bezier(.4, 0, .2, 1)`),
`opacity` on the active tick's layer (150ms), on the chevrons' reveal (150ms) and, when the gutter is under 48px, on the rail's
own (150ms). Only `transform` and `opacity`; nothing runs until `data-armed`. The card and its removal are instant.

- Ticks use the host's text scale: `--v2-text-text-faint` at 45% at rest and `--v2-text-text-base` at 60% for the active
  one (t3-code: `muted-foreground` 25% / 60%). `:focus-visible` outlines with `--v2-border-border-focus`. The strip keeps
  the default cursor: the host reserves the pointer cursor for links.
- The jump itself is the plugin's: the final screen is tweened by `tween.ts`, one `scrollTop` write per frame along
  `1 - (1 - t)^4`, 180ms plus 0.12ms per px, capped at 420ms; a wheel, touch, pointer-down or key on the scroller stops
  it. Reduced motion writes the target once with `behavior: "auto"`, drops the tick transitions and fades the active
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
- Observers (`IntersectionObserver` x2, `MutationObserver`, `ResizeObserver`s), the media query, timers and the jump
  controller live in the slot's Solid owner and are removed by `onCleanup` (`stop()` disconnects all of them); plugin
  reload disposes them with the plugin root, so a reload leaves one rail. They are `createKeyed` runs (the scroller's
  input marks, the observers keyed on the scroller while the timeline is active, the resize watch, the re-read on a list
  change); the scroller and view root are one signal, so a run never sees one without the other. An inactive timeline
  holds no observer.
- The prompt window is one memo that folds its previous value (`{ id, window }`) with the host's list and whether this
  session saw user input (a signal); a different session id starts it over. It holds no closure state. `ids` keeps its
  array identity while the prompts are the same, so a streaming reply does not wake the re-read.

## Decisions

- **Jump scroll = the host's (decided by the user).** The jump glides with native `behavior: "smooth"`, as the host's own jump to a message and jump to latest do (source: OpenCode 2.2.5 `use-session-hash-scroll.ts` `scrollToElement`, `virtualizer.tsx` `scrollToEnd`; neither has a custom tween). An earlier plugin tween (`1 - (1 - t)^4`, 180ms + 0.12ms/px, max 420ms) was removed. The tick, card and chevron hover motion stays t3-code's (decided by the user: keep t3-code's behaviour); the host has no sibling for it.

- **One active tick, by conversation context (decided by the user; deliberately not t3-code).** t3-code lights every
  prompt whose own row is on screen and has no current-prompt tick. Here exactly one tick is lit: the last prompt at or
  above a reading line just under the sticky header, i.e. the turn whose content is being read, even when a long reply has
  scrolled its prompt row far above (see Active prompt). Edges: short chat and the very bottom = last prompt, very top =
  first, one prompt = that one, never no-active while there is a prompt. The multi in-view marks are gone. Chevrons step
  from the active prompt. The hover card, pointer mapping and keyboard stay t3-code's. The lit colour is the host's text
  token at 60% (t3-code's `/60`). The reading line stays 8px under the sticky header (the user's choice).
- **Widths are equal at rest; the fisheye is only for the pointer (decided by the user, same as t3-code).** An earlier
  version of this file centred the fisheye on the active prompt at rest; that was wrong, and it made the active tick and
  its neighbours wider than the rest. t3-code scales by distance from its active index, which is the pointer's or the
  keyboard's index and `null` at rest, where every tick takes the 0.333 fallback. Here too: with no pointer or keyboard on
  the strip all ticks are the same width at any scroll position and any active prompt, and the active tick differs from the
  others only by its lit colour. While pointed or focused the scale is centred on the pointed index and eases (150ms,
  both ways) back to equal widths on leave.
- **Hover also lights the pointed tick (decided by the user, matches t3-code's hover feedback).** While the strip is
  pointed or focused the pointed tick takes the lit colour as well, so two ticks look lit (the active one stays lit as the
  current prompt). Back to exactly one lit tick when the pointer leaves or focus goes. Focus starts on the active prompt, so
  one tick is lit until an arrow key moves it.
- **Default cursor on the strip (match the host).** The host's desktop stylesheet reserves the pointer cursor for links
  (`packages/desktop/src/renderer/styles.css`: `.cursor-pointer:not(a):not([role=link])` is forced to the default cursor).
  The strip's `cursor: pointer` is removed; the card keeps `cursor: text`.
- **Placement**: `Slot session.header`, the only timeline surface the host offers a plugin. The scroller's geometry is read from the host's DOM (`[data-slot='session-timeline-visible']`, `[data-timeline-row]`); there is no API for it.
- **Previous from the last prompt works at the scroll end (bug, fixed; decided by the user).** Previous always goes to the
  prompt before the active one; next at the last and previous at the first stay disabled. Cause: the chevron stepped
  correctly (`current() - 1`), but when the previous prompt's row already sits in the final screen the jump's target
  offset lies past the scroll maximum, so the scroller did not move, and at the very end the reading rule says last
  prompt, so the lit tick stayed (seeded 12-prompt chat, short last turns: 9 to 9 on every click). The reading line
  cannot reach a prompt that is above the bottom-pinned viewport's line, so the geometry cannot be changed. Nearest
  correct behaviour: the jump leaves the prompt it chose held (`heldPrompt` in `target.ts`, the `chosen` hold in
  `gui.tsx`) while the scroller is still within 2px of its end; the next chevron step starts from it. The hold ends on the
  user's wheel, touch, pointer or key in the timeline (not the jump's own unpin), when the scroller leaves the end, or when
  the prompt list changes (a new turn is active at the bottom, as before). Land rounds stop at the end instead of
  re-gliding four times. Checked in the private harness (below): previous clicked down from the last prompt to the first
  and next back up, lit tick followed every click.
- **Chevron tooltip sits beside the chevron, not on it (bug, fixed).** The prompt card never overlapped the chevrons: it
  starts 32px right of the strip's left edge and the chevrons end 14px right of it (measured per index 0, 4, 9 at widths down to
  800px; the card is removed the moment the pointer leaves the strip for a chevron, as in t3-code). The cover was the host's
  own "Previous turn / Next turn" tooltip: `ctx.ui.Tooltip` wraps its child in a block `div` (`tooltip-v2-trigger`) that
  anchors the popper, and around the absolutely positioned chevron that div collapsed to 0 height at the strip's corner, so
  the tooltip opened at 495-517px over the chevron (499-519) for previous and inside the strip for next, with
  `pointer-events: auto`. The positioned `span` now wraps the Tooltip, so the trigger takes the chevron's size and the tooltip
  opens 4px above (previous) or below (next): checked per frame, the chevron is the hit target throughout. Chosen over
  hiding the card or `pointer-events: none` because nothing of the card needed to change and it keeps the host's tooltip.
- **Motion**: ticks, reveal and chevrons use `transform`/`opacity` 150ms `cubic-bezier(.4,0,.2,1)` after `data-armed`, copied from t3-code. The host has no sibling, and hover-driven motion is not on the animation reference's allow list. Open question for the user: the curve and the hover frequency.

## Rejected

- **Background history loading so the rail covers the whole conversation** (the previous design, `history.ts`): the
  conversation was fetched a page at a time behind the user, the rail grew visibly after opening, and it added requests
  the host would not have made. t3-code's minimap covers only the window it has loaded. Removed.
- **Tick thinning (`tickStride`) and the gradient-plus-band strip (`strip.ts`)**: built for 5,000 ticks, which the limit
  makes unreachable by anything but the user scrolling up through that many pages. t3-code draws one span per prompt at
  any count and so do we; measured below.
- **Card open delay (400ms), enter/exit animation and glide between prompts, "n of N", "Working...", `[image]` /
  `@agent` labels, PageUp/PageDown, Escape, the hover brightening of the whole strip,
  the history breathe mark, the appear/disappear fade, chevrons shown on strip hover, the 28px column at 6px from the
  edge**: not in t3-code, removed.
- **Observers kept alive across a session switch** (`plugins/timeline-switch`): the host mounts a new timeline per switch, so
  nothing survives to reuse; with the observers keyed on the scroller regardless of `active` and the re-measure skipped for
  unchanged sizes, 12 switch runs averaged 3.9% against 3.4% for the shipped code. Reverted. See Performance.
- **Header button + palette command** (the original `message-jump`): one target at a time, no overview.
- **DOM-scraped floating pill**: fixed positioning over the timeline broke on pane resize and bled over other sessions.
- **`location.hash = "#message-<id>"`**: desktop uses a memory router; the hash never changes the host's `useLocation`.
- **Aiming the host's `message.previous` / `message.next`**: back-to-back host navigations collide in
  `use-session-hash-scroll.ts` and land the wrong prompt.
- **A plugin scroll tween (ease-out, 180-420ms)**: replaced by the browser's smooth scroll, which is what the host uses (see Decisions).

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

Unit tests (`pnpm test`, `node:test` on happy-dom with `--conditions=browser`, 64) cover the window (first 10, growth by
page capped at 20 and gated on user input, revert edge, thread swap), prompts and the final-assistant snippet, labels,
markdown stripping, rail height, index from pointer (every index of 5,000 reachable), the active prompt (every edge: fits, top, bottom, one prompt, long reply, on the line, streaming, reverts), the
probe direction, the glide plan, and the slot (geometry, hit width and persistence by gutter, the
card's timing, position and content, fisheye only while pointed, equal widths at rest at every scroll position, the
pointed tick lit with the active one, a session id change starting the window over, a row jumping across the line in one
frame, no rect or style read and no observer rebuilt while scrolling, the line following a taller header, pass-through,
wheel forwarding, keyboard, chevrons, window limits with 5,000 messages, zero `loadMore` calls, hide conditions). The
slot tests run the observers against fakes that follow the browser's rules (an intersection target is reported only when
its state against the root changes; a resize target is reported once after it is observed). Live verification runs against a second, isolated desktop app
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

Active prompt, same harness, 500-turn realistic session (reasoning parts, 1 to 4 bash/read tool parts of 40 to 300
lines per reply, every 7th reply 8 code blocks, every 25th 60), all 500 turns loaded by scrolling up (490 ticks): three
1,800-frame scrolls (900 frames of 40px one way, 900 back; from the bottom, from the top, from 40% of the history),
compared the lit tick one frame behind the scroll write against an oracle computed in the page from the rows' own text
("question N") and positions (last row whose top is at or above the line, the end and top rules): 0 mismatches in all
5,400 frames, exactly one lit tick in every frame, 69 switches, each on the frame the prompt crossed the line, the very
bottom lights the last prompt; the short chat (4 prompts, fits) lights the last. The scroller must be unpinned (a bubbling
`WheelEvent` with `deltaY: -1`) before programmatic `scrollTop` writes, or the host snaps back to the end.

Tick widths, measured per frame from `getBoundingClientRect().width` (the transform included): at rest 7 scroll
positions from the top to the end, every tick 8px (one distinct width), the lit tick alone differing by colour. Pointer
on tick 5: 5 and the active tick lit, the pointed tick and two neighbours each side stretch (1 -> 24, .667 -> 16, .417 -> 10px
as the 150ms transition runs); moving to tick 8 moves both; leaving returns to 8px everywhere with one lit tick; keyboard
focus: fisheye on the active tick, one lit; ArrowUp: the keyboard tick lit with the active one; blur: equal widths, one lit.

Not verified live: touch and `pointer: coarse`, reduced motion, a gutter under 48px (unit tests only), light theme, the
768px breakpoint, subagent sessions (no desktop route).

## Performance

Method: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md). Isolated desktop app (OpenCode
2.2.5, own root, 1708x1044 window, 120Hz), a seeded realistic 500-turn session (reasoning and tool parts, long replies,
every 25th taller than the viewport; about 22,000 DOM nodes mounted) and four short sessions, `desktop-harness.sh`, CDP
`Performance.getMetrics` and the `Profiler` (100us). Scroll: scroller unpinned, `scrollTop` writes, 500 frames of 150px
up then 500 down, three runs. Plugin time = self time of every profiler sample in the plugin's own script (found by its
markup), so a forced layout inside a plugin call is charged to the plugin although the host would run it later in the
frame. One harness at a time; the bare script total moves by +-5% between runs, so the plugin figure is the one to compare.

| Scenario (3 runs unless noted) | Bare | Before (master) | After | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| scroll, plugin time | 0 of 698/743/765 ms host script | 23.3 / 28.5 / 21.3 ms = 3.1 / 3.7 / 2.7% (median 3.1%) | 14.4 / 6.2 / 4.6 ms = 2.0 / 0.9 / 0.6% (median 0.9%) | within 3% | PASS (the 14.4ms run is the host paging history in while the window grows: one Solid effect, 7.9ms) |
| scroll, layouts | 295 / 265 / 254 | 307 / 279 / 268 | 314 / 283 / 272 | no new | +19 per 1,000 frames in both, from the host's own pages |
| scroll, frames over 16ms / long tasks | 9,10,5 / 5,8,1 | 8,7,7 / 0,2,1 | 7,5,4 / 0,2,1 | no new | PASS |
| scroll, p95 frame | 10.8 to 11.0ms | 11.0 to 11.4ms | 10.8 to 10.9ms | | PASS |
| lit ticks per frame (oracle, 5,400 frames) | 0 | 1 | 1 | exactly one | PASS, 0 mismatches |
| idle, 10s, script time | 2.2 ms | 0.55 ms | 0.52 ms | zero callbacks | PASS: no timer, no observer callback without a host change |
| stream (600 DOM updates at 16ms, plus mounts of rows, pinned to the end) | 0 of 116/114 ms | 0.5 / 0.0 ms | 0.2 / 0.1 ms | within 3% | PASS on this simulation; it does not drive the plugin's data path (no model in the harness) |
| stream, data path (node micro-benchmark: one list rebuild per streamed update, 20 prompts with 4.5KB replies) | | 199 us | 2.9 us | | the snippet (markdown stripping) is read when a card shows it, not per update |
| 10 session switches (3 runs) | 90.0 / 63.5 / 61.0 ms host script | 5.5 / 2.6 / 3.8 ms = 5.7 / 3.3 / 4.7% (median 4.7%) | 3.6 / 2.5 / 6.4 ms = 4.4 / 3.2 / 7.7% (median 4.4%) | within 3% | FAIL, unchanged within noise: see below |
| JS heap after the runs, forced GC | 48.6 MB | 69.6 MB | 51.9 MB | flat | PASS (the before run held 20 MB more) |
| DOM nodes / listeners after the runs | 43,736 / 985 | 62,357 / 2,684 | 45,820 / 1,227 | bounded | listeners and nodes track what the host mounted; no growth by the plugin |

What moved the scroll number (each kept because it did, in this order): the rail's place no longer measured per frame;
the wrapper walk; then the move to observers: the line observer, which replaced the per-frame rect reads, and the bottom
observer, which replaced the one remaining `scrollTop` read (an intermediate build with the scroll listener cost 5 to 9% in
the profile, all of it that read forcing a layout). Before this step: 3.1%; after: 0.9%.

Switch, second pass (`plugins/timeline-switch`; `OpenCode` 2.2.5, same seeded session plus three 30-prompt chats, 10 switches
Home to chat and back, 3 runs per launch, profiler plugin self time over host script time, launches interleaved with a bare
one; the box was shared, so each variant ran 3 to 4 launches):

| Variant | Plugin script per 10 switches | % of host script | Result |
| --- | --- | --- | --- |
| bare (no plugin) | 100 / 97 / 101 and 80 / 76 / 79 ms | | the host alone moves by 25% between launches |
| master | 4.6 / 3.5 / 2.5, 3.3 / 2.6 / 3.9, 4.1 / 3.0 / 2.6 ms | 3.9 3.6 2.6, 2.9 2.7 4.1, 4.3 3.1 3.0 (mean 3.4%, median 3.1%) | FAIL by about 0.4 point, inside the run-to-run spread |
| observers kept across a switch, plus no re-measure when shown at the sizes last measured | 2.8 / 4.4 / 3.6, 3.9 / 4.1 / 3.7, 4.2 / 3.0 / 3.3, 2.6 / 3.4 / 6.4 ms | mean 3.9% | no gain; reverted |

Why the observers cannot be kept: the host does not keep a switched-away timeline. Probed with a mark on each
`[data-scrollable]`: after every switch, by the Home list and by the titlebar tabs alike, the scroller is a new element, and
only the visible session's scroller exists in the document (the previous one and its rail are gone). There is nothing to keep
alive and no key to persist observers under, since an observer is bound to the element it watches. The earlier note that a
cached timeline idles hidden does not hold for 2.2.5 on these routes. The same rules out the other candidates: ticks are
already built per switch with the rail (10 spans, one Solid `Index`), so diffing or deferring them moves nothing; a session with
no changes still has a new document, so there is nothing to skip.

Where the remaining 3 to 4 ms goes (unminified build, per function): the first `ResizeObserver` notification, which reads
the scroller and container geometry (`range`, `fit`: 1.2 to 1.7 ms of the total), then `active`, `prompts`, `loadedIds` and
Solid's effect setup at 0.1 to 0.5 ms each. The first is a layout the host runs in the same frame anyway: the layout and style
milliseconds are the same with and without the plugin (74 and 74 ms layout, 402 and 408 ms style per 10 switches), and only the
layout count differs (136 bare, 169 with the plugin, small passes after the rail's own writes). So most of the figure is
layout work charged to the plugin because it asks first, not work the plugin adds; removing the read would hand the same cost
to the host's next frame. What is ours is about 2 ms per 10 switches (about 2%), under the bar. Judged against the bar as
worded ("within 3 points of main-thread time"), the median 3.1% passes by noise and the mean 3.4% misses by 0.4 point; no
change was found that moves the number by more than the spread between launches, so none is kept.

Previous/next from the end (`plugins/timeline-prev`), private harness (window on AeroSpace workspace Z, own ports): a
seeded 12-prompt chat (10 ticks; short last turns, bottom-pinned) and a longer 10-prompt chat. Before: previous at the end
stayed on tick 9 for every click (scroll 1801/1801). After: 9, 8, 7, 6, ... 0 with previous disabled at 0, then 0 to 9
with next, the lit tick moving by exactly one each click, scroll positions 1801 (held), 1801 (held), 1700, 1329 ... in the
short chat and unchanged behaviour in the long chat.
