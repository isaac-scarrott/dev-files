# message-jump: design

A header button that takes the timeline to the nearest prompt of yours above the viewport. Written against OpenCode
Desktop 2.2.5 (`@opencode/plugin` 2.2.5). Line references point at the renderer sources extracted from `app.asar`.

## What it does

- Renders in the `session.header` slot of every timeline, next to the search button, as a `ctx.ui.IconButton`
  (`arrow-up`) inside a `ctx.ui.Tooltip`. Disabled when nothing is above the viewport; hidden when the session has no
  prompt of yours at all.
- Click (or the `message-jump.previous` palette command, `section: session`): the timeline lands with that prompt
  right under the sticky header, exactly where the host's own `message.previous` puts a prompt.
- Repeated clicks walk up one prompt at a time; scrolling back down and clicking again returns to the same prompt.
- Reaches prompts whose rows the virtualizer has unmounted, and prompts on history pages not yet loaded.

## Target: the prompt above the fold

The target is a function of the DOM and the message list, recomputed on every scroll, resize, list change and click.
Nothing is cached between clicks, so a stale target cannot fire.

1. **Candidates**: `server.data.session.message.list(id)` filtered as the host's `visibleUserMessages`
   (`session-domain.ts`): `type === "user"`, and `id < info.revert.messageID` when a revert is pending. Reverted
   prompts and everything the host hides are excluded; a prompt the host never rendered cannot be a target.
2. **The fold** is the viewport top plus the sticky header's `offsetHeight` (`[data-session-title]`, the same inset
   `use-session-hash-scroll.ts` `scrollToElement` uses) plus an 8px tolerance.
3. **Current turn**: every mounted row carries `data-message-id` = its owning prompt (`session-timeline-row.tsx:585`),
   and prompt rows additionally `data-timeline-row="UserMessage"` and `id="message-<id>"`. The first mounted row whose
   bottom is below the fold owns the current turn.
4. **Target**: if that row is the prompt itself and it starts at or below the fold, the target is the previous
   candidate; otherwise (you are inside the turn, its prompt scrolled off or unmounted above) the target is the
   current prompt. No previous candidate and `message.more(id)` → the target lives on an unloaded page.

This is the "nearest previous message I sent relative to where I am", not the newest by time and not the host's
`message.previous` semantics (which skips the current prompt when you are inside its turn).

## Reveal

Two paths, chosen at click time by whether the prompt's anchor element is mounted.

**Mounted anchor** (short distance): `scroller.scrollTo({ top: anchorTop - inset, behavior })`, the host's own
geometry. When the anchor is more than two viewports away, the scroller first jumps to one viewport below the
anchor and glides from there; the host's `scrollToEnd` does the same in the other direction ("Glide only the final
screen", `virtualizer.tsx:602`) because gliding across the whole history streams every row through the virtualizer.

**Unmounted anchor** (far): no plugin API scrolls the virtualizer to an index, and desktop routes through a
`MemoryRouter` (`src/renderer/window/router.tsx`), so writing `location.hash` never reaches the host's hash scroll.
The plugin probes: it pages the scroller towards the prompt one viewport per frame with `behavior: "auto"` until
the virtualizer mounts the prompt's row. The direction comes from the rows in view: every row carries its turn's
prompt id, so rows of the target's turn (or later) without the prompt row mean it is above, and rows of earlier
turns mean it is below. Only rows intersecting the viewport count, because the virtualizer keeps the last turn's
final row mounted at every scroll position (seen live: `data-message-id` of the last turn at +23000px), and it
would otherwise read as "a later turn is below" everywhere. A flip in direction halves the step (floor: a quarter
viewport), so an overshoot corrects within a frame or two. One-viewport steps overlap, so a rendered prompt row
cannot fall between two stops; TanStack's two items of overscan (`virtualizer.tsx:191`) are not enough for larger
steps, as a two-viewport probe skipped prompts live.

The virtualizer can render a stop one frame late, so the row found at one stop may unmount on the next render. The
plugin waits until the anchor is mounted and the scroll offset has held still for three frames (the virtualizer
measures the new rows and shifts the content); if the anchor goes missing instead, it probes again from where it
is, at most three attempts. Then it glides the final screen as above. The probe frames paint, which reads as a
fast scroll rather than a cut; the glide at the end gives the landing its easing.

**Unloaded page**: `message.loadMore(id, { signal })`, then recompute. One page per click; the button stays `busy`
meanwhile. The `AbortController` is aborted when the slot unmounts or the plugin reloads.

## Telling the host the user scrolled

The host pins the timeline to its end while a session streams, and a pinned virtualizer scrolls back to the end on
every size change (`virtualizer.tsx:413`). Only pointer or touch scrolls unpin it (`virtualizer.tsx:909`); a
programmatic `scrollTo` does not. Before scrolling, the plugin dispatches a bubbling `WheelEvent` with `deltaY: -1`
on the scroller. The host's `handleListWheel` (`virtualizer.tsx:794`) then releases its tool anchor, bumps the
user-scroll mark (so `navigateMessage` reads the cursor instead of stale `state.messageID`) and unpins. Nothing else in
the wheel handler acts on a zero-distance wheel.

## Native look and motion

- `ctx.ui.IconButton` (`ghost-muted`, `small`) inside `ctx.ui.Tooltip` with the command's keybind; no bespoke CSS,
  no `Style` contribution. `compact` headers show the same icon-only control.
- Motion is the scroll itself (occasional action → standard motion). `prefers-reduced-motion: reduce` scrolls with
  `behavior: "auto"`, which is what the host's jump-to-latest does with `prefersReducedMotion()`.
- The button does not animate in or out; it is part of the header's action row and is simply disabled.

## Lifetimes

- One slot instance per timeline; cached timelines keep theirs with `active: false`, where the slot does no DOM
  reads. The scroller is found from the slot's own element (`closest("[data-scrollable]")`), never by a global query,
  so a hidden timeline cannot act on the visible one.
- Listeners (`scroll`, `ResizeObserver`) are registered in the slot's Solid owner and removed by `onCleanup`;
  plugin reload disposes them with the plugin root.
- The palette command finds the slot instance of the active timeline through a module-level map keyed by the slot's
  owner; it is a no-op when no timeline is active.

## Rejected

- **DOM-scraped floating pill** (previous implementations): fixed positioning over the timeline broke on pane
  resize, bled over other sessions, needed a `MutationObserver` that looped on its own writes, and visually competed
  with the host's jump-to-latest pill. The header slot has none of these problems.
- **`location.hash = "#message-<id>"`**: desktop uses a memory router; the hash never changes the host's `useLocation`.
- **`ctx.commands.run("message.previous")` alone**: wrong semantics (skips the current prompt), instant only, and
  cannot be aimed at a chosen prompt.
- **Aiming the host's `message.previous` / `message.next` by replicating its cursor** (the first far path): the
  plugin ran `cursor − target` commands synchronously so the host's `navigateMessage` would reveal the prompt.
  Live, two back-to-back host navigations collide in `use-session-hash-scroll.ts`: each `scrollToMessage` calls
  `cancel()` on the previous one's queued `seek` retries and the second `revealMessage` lands with the first's
  `scrollToIndex` still in flight. Inside a turn whose prompt is unmounted (`previous` then `next`) this landed the
  prompt *before* the target 64px under the header, every time. Dropped for the probe, which needs nothing from the
  host's navigation state.
- **Scrolling the virtualizer by estimated offsets**: row indices of unmounted prompts are not knowable from outside
  the projection, so the probe searches by direction instead of computing an offset.
- **`ctx.tabs.open` / `layout.pendingMessage`**: the SDK's `Tabs.open` has no message option in 2.2.5.

## Verification

Unit tests (`pnpm test`, `node:test` on happy-dom with `--conditions=browser`) cover target selection, the probe
direction and its turnaround, the reveal plan, the glide plan and the slot's hydration. Live verification runs
against a second, isolated desktop app driven over CDP (`.claude/skills/opencode-gui-plugins/reference/browser-testing.md`,
`scripts/desktop-harness.sh`); GUI plugins do not load on the web build (`runtime/plugin/root.tsx`: the plugin
bridge is desktop-only), so a browser against `opencode-cli serve` only exercises the host's scrolling, not this
plugin. Prompt rows only unmount when a turn has many parts (the virtualizer's items are parts, not turns), so the
far path needs a seeded session with multi-part answers.
