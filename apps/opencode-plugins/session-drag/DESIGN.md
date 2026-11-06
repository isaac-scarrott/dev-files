# session-drag: design

Drag a sidebar session row sideways into the session panel to attach a reference to that session to the prompt.
Written against OpenCode Desktop 2.2.5 (`@opencode/plugin` 2.2.5). File references point at the renderer sources
extracted from `app.asar` (`src/renderer/...`) and at `gui-plugins/src/...`.

## What it does

- Press a sidebar session row (a live tab, or a archive plugin Archived row; Snoozed rows are not drag sources) and move sideways: a chip with
  the session's title follows the pointer and the host's own drop overlay (worded "Drop to attach session") rises over the session
  panel. Release inside the panel: a native "Session" chip (title, speech-bubble icon) joins the composer's context
  row and the prompt takes focus. Release anywhere else, or press Esc: the chip disappears and nothing changes.
- A vertical move is the host's reorder, untouched. A plain click still switches sessions.
- The chip is a `ComposerNote`: it persists in the session's draft, has the host's remove control, and clicking it
  opens the referenced session (`LinkHandler` → `ctx.tabs.open`).
- Palette: `session-drag.reference` "Reference session…" (section `prompt`) picks from `ctx.sessions.list()` minus
  the current session, with each session's directory as description, and attaches the same chip.

## The reference the model reads

The note's `subject` is `session @session:<id> ("<title>")`, so the prompt the model receives contains
`The user referenced session @session:ses_… ("Fix login flow").` The token is the host's own wire form of a session
mention (`util/src/session-mention.ts` parses `@session:ses_<26>`), so anything that already understands native
mentions understands this, and the `orchestrate_*` tools take the id as-is. The title is JSON-quoted because the
model wrote it and it can contain anything. `label`/`title` = title, `subtitle` = "Session", `icon` = `speech-bubble`,
`origin` = `session-drag`, `href` = `session-drag:<server>/<id>`.

## Findings

**(a) What the composer accepts on drop.** `src/renderer/session/attachments.ts` listens at the document. `dragover`
sets `draggingType` from the transfer: `Files` → "image", `text/plain` → "@mention"; either shows `ComposerDropzone`
(`session/dropzone.tsx`, rendered in `session/screen.tsx` over the whole session panel; opacity 200ms
`cubic-bezier(0.215, 0.61, 0.355, 1)`, `motion-reduce` none). `drop` handles only `text/plain` beginning with
`file:` (a file mention) and real files; any other text is ignored. `dragleave` with no `relatedTarget` and Escape
clear it. So a native HTML5 drag with `@session:…` as `text/plain` lights the overlay but drops nothing, and the
composer's public API is the route: `composer.insert` is `draft.addText` (plain text, no chip), `composer.attach`
takes a `ComposerFile | ComposerNote | ComposerQuote` and renders the host's chip. `addMention` and the
`mentionParts` WeakMap behind `<span data-mention>` are not exported.

**(b) Dragging a row out past dnd-kit's reorder.** `session/tab-strip.tsx` wraps each row in `useSortable` with a
`PointerSensor` (activation distance 4), `restrictToVerticalAxis`, no drop animation, and a document `dragstart`
capture that calls `preventDefault` (so HTML5 drags cannot start from rows). The row's `a[data-slot=tab-link]`
(`session/tab-nav.tsx`) is `draggable=false` and navigates on `mousedown` (button 0, unless editing or
`suppressNavigation`); its `onClick` ignores `detail > 0`. Solid delegates `mousedown` at the document. The plugin
listens at the window in the capture phase, ahead of both: a press on a row is recorded; the host's `mousedown` is
stopped and its init kept; the first `pointermove` past 4px decides. Vertical (|dx| ≤ |dy|): the kept `mousedown` is
replayed on the link, then the move passes through, so dnd-kit activates on that same event and the row is already
the active one, as native. Sideways: the move is swallowed (`stopPropagation` + `preventDefault`) and the reference
drag begins; later `pointermove`s are swallowed too, but `pointerup` is never swallowed, so dnd-kit (which never
activated) stays consistent. A press that ends without moving replays the `mousedown` on `pointerup`.

**(c) Archived rows** (Snoozed rows are excluded: they sit in wake order and must stay put; the selector scopes to `[data-sa-kind="archived"]`). `[data-sa-row="<server>\n<id>"]` rows copy the tab markup but are outside dnd-kit and
act on `click`, not `mousedown`, so nothing is held back for them; the server and id are read from the attribute
and the title from `[data-slot=tab-title]`. Verified live: the Archived row drags like a tab, and a plain click on
it still reopens the session.

**Native `@` popover.** Typing `@` then part of a title in the composer offers the session (`@Bill` → "Billing export
job · project"), inserting a native mention. That is the keyboard alternative today; this plugin adds the pointer
route and the explicit id in the prompt.

## Mechanics

- Pointer events only, no HTML5 DnD (the host blocks it from rows). Listeners: `pointerdown`, `mousedown`,
  `pointermove`, `pointerup`, `pointercancel`, `click`, `keydown` at window capture, and window `blur`.
- Rows: `[data-slot="vertical-tabs"] [data-tab-key]` and `[data-sa-row]`. Presses on `[data-slot=tab-close]`,
  `contenteditable`, `[data-editing=true]`, inputs and buttons inside a row are left alone. A row whose tab has no
  session (a `draft:` new-session tab) resolves to nothing and is left alone.
- Begin: ghost appended to `body`, `html[data-session-drag]` set (cursor default, selection off), selection cleared,
  a synthetic `DragEvent("dragover")` with `DataTransfer text/plain = @session:<id>` dispatched on `body` so the
  host's own overlay shows. End: synthetic `dragleave` (no `relatedTarget`) so the host clears it.
- Drop target: the parent of each `[data-slot="session-dropzone-blur"]`, i.e. the session panel the host's overlay
  covers; pointer inside on release → `composer.attach(note)` + `composer.focus()`. The one `click` that follows a
  drag is swallowed so an archive row's own click action cannot fire.
- Escape (capture, stopped) cancels; `pointercancel` and window `blur` cancel.

## Native look and motion

- Ghost: the host's file-row drag image classes verbatim (`gui-plugins/src/file/drag.ts`:
  `flex items-center gap-x-2 px-2 py-1 bg-surface-raised-base rounded-md border border-v2-border-border-base
  text-12-regular text-text-strong`), the catalog icon via `ctx.ui.Icon` (`speech-bubble`, small, muted) rendered
  with `solid-js/web` `render`, and the title (`truncate`, max-width 280px). Positioned with `transform:
  translate3d(x, y − 12)`, the host's `setDragImage(image, 0, 12)` offset. Computed styles measured live against an
  element with the same classes: identical (font 13px/400/19.5px Inter, padding 4px 8px, border 1px
  rgba(0,0,0,.1), radius 6px, background rgb(243,243,243), colour rgb(23,23,23), gap 8px, height 29.5px; icon 14×14
  rgb(128,128,128)).
- Overlay and chip are the host's own: the overlay is triggered, not reproduced; the chip is the host's note tile.
- Motion: none. The ghost appears on the first frame of the drag and is removed in one frame on drop, cancel and Esc.
  Only its `transform` is written (the pointer position).

## Decisions

- **No enter or exit animation on the ghost = the host's (decided by the user).** The host's file-row drag image is an OS
  drag image (`setDragImage(image, 0, 12)`): the system draws it at once and removes it at once, with no enter or exit
  animation. The earlier 120ms `opacity`/`scale .97→1` entrance and the cancel fade were removed. The host's drop overlay
  does fade (200ms, `transition-opacity duration-200`); the plugin only triggers it and does not restyle it.

## Rejected

- **`composer.insert("@session:ses_…")`**: a bare 36-character token in the editor, no chip, no title.
- **Injecting `<span data-mention="session">`** into the editor: the host's serializer reads mention parts from a
  private WeakMap; an injected span is treated as a file mention.
- **A native HTML5 drag** from the row: the host's `dragstart` capture prevents it, and the drop handler ignores
  non-`file:` text anyway.
- **Row context-menu entry**: the `MenuItem` registry only has session-panel and server menus in 2.2.5.
- **Deduplicating a session dropped twice**: `Composer` exposes `attach`/`update`/`detach` but no way to read the
  attached parts, so a second drop attaches a second chip, like a second file attach.

## Verification

Unit tests (`pnpm test`, `node:test` on happy-dom): reference format and parsing, row resolution, and the gesture
state machine (click replay order, vertical hand-off, sideways drag, drop, cancel, Esc, archive rows, inert
controls, blur, uninstall). Live, in the isolated desktop (`desktop-harness.sh`, playwright-core over CDP, two
seeded sessions, side-tabs layout):

| Check | Result |
| --- | --- |
| Press, 2px move | no ghost, no navigation |
| 8px sideways | ghost enter→active next frame (opacity 0→0.94→1), host overlay `data-visible=true` "Drop to attach session", active tab unchanged |
| Release over composer | ghost gone at once, overlay cleared, "Billing export job / Session" chip in context row, prompt focused |
| Vertical drag of last row | dnd-kit overlay row shown, order changed, dragged row became active at the 6px point (as native) |
| Plain click on titled inactive row | no switch during a 400ms hold; switch 7ms after release (native: on press) |
| Plain click on draft row (no session) | switch on press, 9ms (untouched) |
| Release over sidebar | ghost + overlay during, nothing attached after |
| Esc mid-drag | ghost removed at once (earlier design: `leave` fade, measured live before the change), following release attaches nothing |
| Archived row (archive plugin) | ghost, overlay, chip count +1; plain click still reopens the session |
| Palette "Reference session…" | select dialog lists the other session with its directory; Enter attaches the chip |
| Reduced motion | nothing animates, so no branch |

## Known deltas from native

- A plain click on an inactive live tab switches on release instead of on press, because the host's `mousedown`
  navigation is held until the gesture is known. Press-and-hold without moving does not switch.
- Native file drops are accepted anywhere in the document; this drop counts only inside a session panel.
- The host's overlay says "Drop files to add" (or images/PDFs) for any text drag. While our drag is active the plugin
  words it "Drop to attach session" instead, by CSS only: `html[data-session-drag-label]` collapses the host label
  (`[data-slot="session-dropzone-content"] > div:not([data-slot])`, the div after the upload icon) to `font-size: 0;
  line-height: 0` and draws ours in its `::after` as a 24px 15px block, inheriting the host's weight and colour. Solid
  keeps owning the text node, so reactive label updates cannot undo it. The attribute is set on drag start and removed
  200ms after it ends (the overlay's fade-out, so the old wording never flashes back), at once on uninstall. Real file
  drags and other text drags never set it and keep the host wording. Live (harness, overlay lit by a text `dragover`,
  attribute toggled): host label box 641,486 117.7x24 -> ours 619.8,486 160.4x24 (same y and height, centre 700),
  upload icon unmoved, 15px/530/24px, same colour and family; removing the attribute restored the exact original
  boxes. The gesture wiring (set/hold/restore across drop, release outside, Esc, pointercancel, blur, uninstall,
  foreign drags) is covered by unit tests; the full pointer gesture was not re-run live (side-tabs layout not set up).

## Decisions

- **Pointer hooks on sidebar rows** are DOM: the host blocks HTML drag and drop from rows and exposes no extension point for tab rows ([host-architecture.md §8](../../../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary)). The attach itself uses public APIs (`composer.attach`, `LinkHandler`, `Command`).
- **Swallowing the host's mousedown and replaying a synthetic one** keeps a plain click working; it can race a host update, so it is re-verified each release.
- **`html[data-session-drag] * { cursor: default !important; user-select: none !important }`** is a universal selector, kept because it holds only for the drag's duration.
- **Motion deviation, awaiting the user's yes**: the ghost fades and scales (`opacity`, `scale .97 to 1`, 120ms, `cubic-bezier(.23,1,.32,1)`). The host's file drag image is an OS drag image with no enter animation; nothing native to copy.

## Performance

Not measured yet. Method and bars: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md) (seeded 500-prompt session, bare vs plugin, three runs, median). Fill the table below when measured.

Standing cost, read from the source (not measured):
- No observers. Window listeners are removed on cleanup; the label timer is cleared.
- Four capture listeners on `window` (pointerdown, mousedown, pointermove, pointerup) live for the whole window, not only during a drag.

| Scenario | Bare | With plugin | Delta | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle | | | | zero callbacks | not measured |
| streaming reply | | | | within 3% scripting | not measured |
| 10 session switches | | | | within 3% scripting | not measured |

### Realistic thread, 2026-11-02 (`scripts/perf.mjs`)

650 assistant messages with reasoning, tool output, diffs, 26 subagent children, injected rows and attachments; Side tabs; stub model. Median of 3 runs; delta is against the `null` plugin (the host's cost of loading any plugin). Script ms is main-thread scripting in the scenario window.

| Scenario | Floor script ms | With plugin | Delta | New long tasks | New frames over 20 ms | Frame p95 ms (floor) | Result |
|---|---|---|---|---|---|---|---|
| scroll | 310 | 316 | 5 | 0 | 0 | 16.6 (16.5) | PASS |
| type | 150 | 153 | 3 | 0 | -1 | 9.2 (9.8) | PASS |
| switch | 131 | 136 | 5 | 0 | -1 | 9.3 (10.1) | PASS |
| stream | 253 | 252 | -1 | 0 | 0 | 9.2 (9.9) | PASS |
| hover | 176 | 172 | -4 | 0 | -1 | 9.2 (9.9) | PASS |
| idle | 85 | 79 | -7 | 0 | 0 | 9.2 (9.9) | PASS |
| open thread (settled, ms) | 372 | 374 | 2 | | | | PASS |
| reopen thread (settled, ms) | 48 | 47 | -1 | | | | PASS |
