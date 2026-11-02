# native-ui: design

A library of components copied from OpenCode Desktop 2.2.5's own markup, for GUI plugins to import by relative path. It is not a plugin and is not registered. What it exports is in [README.md](README.md).

## Decisions

Reason for each copy, against the public components `ctx.ui` offers and the "no extension point" list in [host-architecture.md §8](../../../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary).

- **Copy the host's markup, class names and data attributes** instead of drawing new look-alikes: the app's own CSS then styles them, so a theme or host update changes them together. `parity.spec.mjs` compares each component with the real element in the running app. The cost is that the copy tracks 2.2.5 and may break on an update.
- **Menu** (`src/menu.tsx`): `ctx.ui.Menu` exists but is a trigger-bound dropdown that cannot open at a point, so a point-anchored context menu (session rows) cannot use it. The host's `Menu.Content`, `Item` and `Separator` markup and the attributes Kobalte sets are copied. Roving focus, which Kobalte provides in the host, is reimplemented (`nextItem`, `highlight`). `data-expanded` is set after a frame so the host's menu CSS plays its enter.
- **Spinner** (`src/spinner.tsx`, `spinner-radar.ts`, `spin-phase.ts`): `ctx.ui` offers only `Loader`, which the host reserves for non-AI loading, so the Soft Radar dot grid and keyframes are copied. Spin phases are pinned while visible so several spinners stay in step; reduced motion shows a still frame.
- **Session tab rows, close and row-action buttons, popover, summary card, project avatar, clock icon**: tab rows have no extension point, and `ctx.ui` has no equivalent. Tab row actions and close have `transition: none`, like the host's `[data-slot=tab-close] > button`.
- **Header icon button** wraps `ctx.ui.IconButton` (public) and adds the pressed look, `aria-haspopup`, `aria-expanded` and `aria-controls` the host's header buttons carry.
- **`createHost(ctx.ui)`** keeps the setup owner, so components rendered later from an observer, timer or DOM event still find the plugin's Solid context.
- **Sharing by relative path**, not a package: a consumer bundles the source into its own build (`snooze-archive` does, via its `tsconfig` include). `agents-panel` imports the spinner; `snooze-archive/src/menu.ts` re-implements part of the menu, a known duplicate, not a decision.
- **Injected-message row** (`src/injected-message-row.tsx`, `injected-rows.tsx`, `injected-text.ts`, `anchor.ts`, `AgentIcon`; user decisions 2026-11-01): one component for a message the app injected into a session (a peer's, a monitor's, a scheduled run's). The host has no message-renderer registry, so `mountInjectedRows` decorates mounted `UserMessage` timeline rows (hides the host bubble, appends the row in the same frame via a `MutationObserver` on the timeline scroll regions only, nothing runs while no open session holds a message of that kind); each plugin passes the messages it owns. The header copies the host subagent row's markup values and its trailing slot (width, margin, opacity, translateX over 150ms `ease`; 18px wider on hover, 36px with the triangle), the triangle rotates like the host's collapsible arrow, and the header is held under the pointer through a toggle (`holdTop`: the host re-pins the timeline on any resize, which would carry the header away). Evidence and numbers: [orchestrator-tools DESIGN](../orchestrator-tools/DESIGN.md) (peer row).
- **Injected-row spacing = a user turn's** (2026-11-02, user feedback on the live app: the row sat almost against the "Used 1 Thought" line below it). The row stands in a `UserMessage` timeline row, so it takes the host user bubble's footprint, measured in the harness against plain bubbles, the host subagent row and consecutive messages (wide 1300px and 640px, light and dark): 16px from the previous assistant part (the host's TurnGap, unchanged), 28px to the next assistant part (the bubble's 8px margin plus its 20px actions footer, which the host reserves under the last bubble of a run), 4px between consecutive user messages (the host's TurnGap row) with no footer on any but the last of the run, and a left edge at the message column (x 302, the host subagent row's x). Before, the row reserved nothing: 0px to the next part, so "Used ..." sat 4px from the pill. The 28px is `padding-bottom` on the row (a margin collapses out of the host's content box and the virtualised timeline would not measure it); it is dropped for a row whose next two timeline keys are a `turn-gap:` and a `user-message:` (`[data-timeline-key^=...]:has(+ ... + ...)`, one level of `:has`, since the host's own footer rule is decided by the same next-message test). The host subagent row's own rhythm inside an assistant turn (8px above and below, 16px to a text part) is not the target: that row is an assistant part, the injected row is a user turn. The open row keeps the 4px header-to-card gap and then the same trailing 28px. Header height stays 36px (13px/20px type) against the host bubble's 37px: the 1px is the host's 17px line; the gap to the next part is the same 28px.
  - Grey header kept when open: the preview stays in layout with `visibility: hidden`, so the header's box does not change (Δ0.00 in x, width and y per frame, measured) and the second click lands where the first did. The body is a card below the header, outside the click target, mounted only while open (no Markdown or text cost for closed rows).
  - Display text is the real content: `unescapeMarkup` undoes one level of the servers' wrapper escaping (`&amp;gt;` shows `&gt;`, what the command printed), no wrapper tags, no trailer.
  - No `cursor: pointer` (the app reserves it for links); `lint.mjs` forbids it outside `a` and `[role=link]`.
  - The action is a 24px ghost icon button from `ctx.ui.IconButton`; `ctx.ui` has no stop-square icon, so Stop and Cancel use the catalog `close`.
  - Not built: a height animation (the host's collapsibles are instant too).

## Known gaps

- Module state: a module `WeakSet` in the header icon button. It is not owned by a plugin owner, so a Reload leaves the set behind.
- 20 tests for the exports (the injected row has its own, `anchor.ts` moved here with its tests); the parity spec covers the rest live.
- `demo/` is a separate GUI plugin used to exercise the components; it has a document-wide observer and is not part of the library.

## Performance

Measured through the injected-message row in [orchestrator-tools DESIGN](../orchestrator-tools/DESIGN.md#performance) (three plugins on one shared observer per window); the other components are not measured. The library registers nothing itself. Standing cost of what it exports: none at import: each spinner makes its own `ResizeObserver` and `IntersectionObserver` in its owner and disconnects them on cleanup; the keyframes are `spinnerCss`, registered by the consumer. Method and bars: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md).

| Scenario | Bare | With plugin | Delta | Bar | Result |
| --- | --- | --- | --- | --- | --- |
| idle | | | | zero callbacks | not measured |
| 10 session switches | | | | within 3% scripting | not measured |
