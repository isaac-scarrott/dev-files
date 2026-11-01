# agents-panel

## Mode

The header button and popover exist only while the **Panel** mode is on. The mode is a global plugin store (`mode.enabled`, default `false`), so existing users see nothing new until they choose it.

The choice lives in the host's own select: Settings → Timeline → Background activity (`[data-action="settings-background-activity"]`), as a fifth option after Right.

## Why DOM injection

- `SettingsPage` can only add a page, a section on General/Servers, or rows in the General section. There is no hook for the Timeline section and none for a select's options.
- The host stores `general.backgroundActivity` as a closed enum (`off | left | center | right`) in `settings.v3`, written through the host's own store. A plugin cannot write it, and an unknown value would fail validation. So the mode is never written there.
- A plugin-owned row under the native one is not possible either (rows land in General, not directly under Timeline).

## How it works (`src/setting.ts`)

- A `MutationObserver` (childList, one `requestAnimationFrame` per burst) finds the Kobalte listbox `<root id>-listbox` when the popup opens and appends a clone of the host's `center` option: same `menu-v2-item` markup, so hover, highlight, check and height come from the host's CSS.
- Picking it commits the host's own **Hidden** (synthetic `pointerup` + `click` on that option, which selects and closes the popup), then sets `mode.enabled`.
- Picking any host option, Hidden included, sets `mode.enabled = false` (capture-phase `pointerup`/Enter/Space on host options). The host value is then whatever the user picked, so "restoring" the previous value is the user's own pick.
- While on, the host select still holds `off`. CSS hides its value text and the check on its Hidden option; a sibling value span (cloned from the host's) and our selected option show the mode instead.
- If the host list shows a selected value other than `off` while the mode is on (changed elsewhere), the mode ends.
- Keyboard: Kobalte's collection does not know our option, so ArrowDown past Right and ArrowUp from ours are handled here; Enter/Space pick it.

## Limits

- The popup is not rendered while closed, so the reconcile above runs only when it is open. A host value changed while the settings page is closed leaves the mode on with a visible native row until the dropdown is next opened.
- Opening the dropdown while the mode is on highlights Hidden first (the host's selected item), with the check on ours.
- The native row above the composer was verified by the select's state (Hidden) only; no model can run a subagent in the harness.

## Dock

The dock follows the **right side panel** (the host's side region: review, files, browser, terminal; toggled by the header button next to the session details, `⇧⌘R`, or the "Toggle review" command). With it **closed** the header button shows and hides a persistent floating window. With it **open** nothing changes from before dock mode: the button opens the popover, there is no window and the chat is not shifted.

**Earlier misreading.** Dock mode was first keyed on the *left* tab sidebar (`aside[data-slot=vertical-tabs-sidebar]`, with data-state/rect/ResizeObserver detection and `data-agents-sidebar`/`data-agents-aside-width` diagnostics) because "the sidebar" was taken to mean it. The user meant the right panel, which is why it never matched what they saw. All left-sidebar detection is removed; the left sidebar makes no difference (verified open and closed).

- **Panel state**: the official reactive API, `ctx.layout.side.opened(session)` (SDK `Layout.side`; the host's answer is `!!tabs.region(shellTab(session), "side")`, per session, so it is per window and per tab). No DOM observer. It is true for every tab kind (review, files, browser, terminal, + menu). Opening it narrows the chat card (measured at 2000px: card 284-1700 becomes 284-884, panel 892-1700).
- **Narrow**: below 900px window width the chat has no room beside a 288px window, so the button is popover mode (listener on `resize`, `NARROW_BELOW` in `toggle.tsx`).
- **Diagnostics**: the toggle's wrapper carries `data-agents-mode` (`window`|`popover`) and `data-agents-side` (`open`|`closed`).
- **Window**: an elevated surface (the host's `menu-v2-content`) drawn inside the chat card, 288px, anchored 8px from the card's end edge and 56px below its top (under the header row), clipped by the card's rounded corners. It is `position: absolute` in the card, which is the first child of `[data-slot=session-chat-panel]` and already `relative overflow-hidden`; Portal's wrapper div is `display: contents`, so the card's flex layout, the timeline's scroll and virtualizer, and the other header buttons are untouched. Mounted only while shown or leaving; it opens a frame after mounting so the entrance transitions. The host's Toggle review button sits outside the card at its end corner and stays above the window. When the host's review panel is open it sits beside the card, and the window stays inside the card.
- **Chat centring**: while shown, the card carries `data-agents-pad`; its rules reserve the window width + its 8px inset (296px, from `DOCK_WIDTH + DOCK_INSET`) as end padding on the timeline's scroll viewport and on the composer's full-width wrapper, so messages and composer re-centre in the free width (card start edge to window start edge) while the scrollbar stays on the card edge. The header sits inside that viewport (`.sticky`), so it takes the padding back as a negative end margin (`width: auto; margin-inline-end: -296px`) and does not move (0px delta, also mid-animation). The padding changes **once**, at the click; the movement is the glide described under Dock motion.
- **One card, many toggles** (`claimPad` in `dock.ts`). The host keeps ONE chat card and swaps sessions inside it, so on a tab switch the entering and the leaving session's toggle both resolve that same element, and both exist for a moment. The attribute used to be owned by a single toggle (`applied`): the leaving toggle's `release()` ran after the entering one had written it and stripped it, leaving the window open over a full-width chat (no padding, no re-centring; found at 39 of 100 tab switches with the window open, 3 of 60 mixed fuzz runs, 0 of 100 plain open/close cycles). Now each toggle holds a claim (`px`) on the card and the card carries the attribute while any claim is above 0; a toggle only changes its own claim, so release order no longer matters. The glide uses the card's total padding before and after the claim.
- **Motion only on a user change** (`toggle.tsx`). The glide, the slide and the fade play only when the window's shown state changes while the toggle is on screen (active, card resolved): the header button, or the right panel hiding the window. Load, reload, a session tab or route mounting or being switched to, a stored `visible: true`, the plugin re-mounting and a hidden mount are derived state: the window is there (or gone) already, the pad attribute is written without a glide, nothing animates. The pad effect glides only when the inset changes on the card the toggle already holds (`held`, `heldInset`); the window effect animates when `[dock, shown]` changes with the toggle on screen, or when a fresh window mounts because of such a change (`opening`). Each effect decides from its own previous value, not from a flag another effect set: the order effects re-run in is not fixed (an earlier flag-based version lost the glide to it). Closing the right panel never shows the window again (the stored choice is already hidden), so nothing animates then either.
- **Layout**: the window's height fits its content up to `min(420px, card height - 64px)`; the menu surface scrolls inside it. The list panel sets `max-height: none; overflow: visible` because it otherwise inherited a percentage max-height and collapsed to its heading (rows empty while the count read "N running").
- **Hiding**: the window has no close button. The header Subagents button is the only way to show or hide it, besides the panel rule.
- **Choice**: `dock.visible`, a global plugin store, default hidden. Opening the right panel (button, `⇧⌘R` or command) while the window is visible hides it (animated out, chat re-centres) and stores hidden, without opening the popover; closing the panel does not bring it back, the user toggles it with the button.
- **Motion**: see Dock motion below.
- **Not built**: dragging and resizing. The window does not shrink the chat below the host's own flex limits on a very narrow window.
- **One list**: the heading count, the rows and the empty state all read the same memo (`createSubagents`), so they cannot disagree in a reactive pass. The sessions list, family, status and background tasks sync at different times; each is a reactive read inside that memo, so rows and count appear together as each arrives (tested with data arriving late and retracting). The host exposes no call to sync children, only the reactive stores. The "N running, no rows" seen in the real app was the list panel collapsing to its heading (see Layout), not a data filter.

## Dock motion

The chat re-centring and the window's entrance copy the host's own right panel (Cmd+Shift+R), read from the 2.2.5 renderer (`E3t` in `main-*.js`, the `session-chat-panel` card in `route-*.js`).

**What the host does.** A JS frame loop steps a critically damped spring (bounce 0). Its duration is `0.3s * sqrt(distance / 480)` clamped to 0.15..0.3s (`data-motion="reduce"` or the media query snaps instead). Per frame it writes the card's `style.width`; the card's content is held at its final width (`--panel-hold-width`) and the blocks inside are moved with `style.translate` from where they were, so text does not reflow while the card resizes. The side content fades in over 150ms on `cubic-bezier(.22, 1, .36, 1)`. Every frame is a main-thread layout of the card plus a style write on up to 400 elements.

**What ours did.** `--agents-dock-pad` was a registered, inherited `<length>` transitioned on `:root`: each of the ~35 frames restyled the whole document (about 240ms of style recalc per toggle, 11ms per frame) and re-laid the timeline out 20 times, and the window's own slide ran on a different curve (250ms CSS transition) from a frame later. Compositor frames produced during the toggle: 29-35 against the host's 76-79, 13-14 dropped.

**What it does now** (`src/spring.ts`, `src/dock-motion.ts`, `src/toggle.tsx`):

- The end padding is written once, at the click, as an attribute on the card (`data-agents-pad`; rules name only the viewport, the sticky header and the composer wrapper, so the restyle stays that small. A custom property on the card cost 27ms of restyle in the click task; the attribute costs 7ms).
- The content (the timeline's children under the sticky header, and the composer's column) is moved back to where it was and glides to its new place with a `translate` Web Animation, so the compositor does the per-frame work and nothing is laid out or restyled per frame. The offset is the centre shift (half the padding change, sign by `direction`) plus whatever offset an interrupted glide still had, so reversing mid-way is continuous. The old offsets are read before the padding is written, so no layout is forced.
- The curve is the host's spring, sampled into a `linear()` easing (`springEasing`): same formula, same duration rule (timed as the host's panel is, 0.3s: its panel is at least 400px wide, and the rule is flat above 480px; sizing it by the 328px the chat gives up would be 0.248s and 12 points ahead of the host's panel), run until the host's own rest test (5e-5 of the travel, 2e-4/s) passes. The animation starts one 60Hz step in (`delay: -16.7ms`), as the host's loop takes its first step as a full frame.
- The window slides 16px on the same spring and fades over 150ms on the host's fade curve, both started in the same task as the glide (no `requestAnimationFrame` hop, so they are in step). Leaving, the fade holds `visibility: visible` until it ends, then the window unmounts. Reduced motion (`data-motion` or the media query, as the host tests it) keeps the fade and drops the slide and the glide.
- No observer reacts during the glide: the host's `ResizeObserver`s (timeline-rail's, the timeline's own) see one size change at the click, not 35. sidebar-repos observes the left tab rows, which do not move.

**Not copied:** the host carries the spring's velocity into a reversal; ours restarts the curve from rest at the current offset (only a reversal mid-animation differs). The host's debug slow-motion multiplier is ignored.

**Measured** (harness, 2000x1190 at 120Hz, seeded thread of 320 prompts per session, plugin set of the user's config minus blindfold and claude-proxy, 10 toggles each direction, medians; native = Cmd+Shift+R panel):

| | native open / close | ours before | ours after |
|---|---|---|---|
| layouts per toggle | 171 / 163 | 20 / 21 | 4 / 5 |
| layout ms | 23 / 16 | 3.2 / 3.1 | 0.9 / 0.6 |
| style recalc ms | 91 / 74 | 241 / 250 | 20 / 25 |
| main-thread task ms (1.1s window) | 297 / 256 | 299 / 304 | 77 / 78 |
| rAF intervals over 17.5ms | 1 / 0 | 0 / 1 | 0 / 0 (worst run 1 / 0) |
| compositor frames drawn / dropped (1.1s) | 76 / 4, 79 / 8 | 35 / 13, 29 / 14 | 71 / 2, 71 / 2 |
| slowest gap between compositor frames, first 450ms, 6 runs | 17.5-22ms / 11.7-16.5ms | not sampled | 10.2-12.3ms / 14.4-17.5ms |
| click task | 32ms | 16ms | 16ms (9ms warm) |

The compositor-frame rows come from a separate traced pass (tracing itself slows both sides equally). After the glide ends the compositor sits idle for the last ~100ms of the spring (nothing moves a pixel), so intervals are counted only over the first 450ms. A frame over 16.7ms in the table is the click task itself (style write plus mounting the window); it is on a par with the host's, whose first frame is the 30ms measure-and-translate setup.

The curve was sampled per frame on the message column (progress against time since the click, native / ours): open 17ms 15/5, 50ms 36/27, 100ms 65/62, 133ms 79/76, 200ms 93/92, 300ms 99/99; close 17ms 11/10, 50ms 31/36, 100ms 64/66, 200ms 93/93. Within 3 points from 100ms on; on open the first frames trail by up to 10 points (one frame of start latency: the click task is heavier than the host's). Centring after the change: message column and composer centres 0px from the free-space centre, header edges 0px delta at rest and in every sampled frame, composer back at its exact start after a close.

Reproduce: `test/motion-profile.mjs <native|ours> <runs> <out.json> [notrace]` (metrics, traced layout/style/frame counts per toggle) and `test/motion-curve.mjs <native|ours> <open|close> <out.json>` (per-frame centres). Both need `playwright-core` and a harness window.

## Horizontal scroll

**Bug.** With the window shown, the timeline scrolled sideways by exactly 296px (the pad), by trackpad too. Hidden, closed again, right panel open and popover mode were all fine.

**Cause.** The pad rule widened the sticky header (and the `.session-header-fade`, which also carries `sticky`) with `width: calc(100% + 296px)`. The percentage resolves against the viewport's content box, so that box starts at the content edge and ends 296px past it, over the padding. A scroll container that has content overflowing its content box also counts its end padding after it, so `scrollWidth` became `clientWidth + 296`. Only the offending element and its rule were involved; the translate glide leaves nothing behind (`fill: backwards`, no fill at rest) and the window is absolutely positioned inside the card's `overflow-hidden`, so neither reaches the scroller.

**Fix.** `width: auto; margin-inline-end: -296px` on the same elements: the border box still reaches the viewport edge (header does not move), but it does not extend past the padding box, so nothing overflows. Rule: never widen a child of the padded viewport past `100%`; use a negative margin.

**Measured** (harness, user's plugin set minus blindfold/claude-proxy; thread of 12 turns with a 7000px code line, 8-column table, 400-char unbroken string and a long URL; the same on a plain 40-turn thread; `scrollWidth - clientWidth` of `[data-slot=session-timeline-scroll] > .scroll-view__viewport`, and the maximum seen on every frame for 700ms after the click):

| window | window hidden | shown, at rest | shown, during open | hidden again, at rest / during close | right panel open / + popover |
|---|---|---|---|---|---|
| 1400 before | 0 | **296** | **296** | 0 / 0 | 0 / 0 |
| 1153 before | 0 | **296** | **296** | 0 / 0 | 0 / 0 |
| 900 before | 0 | **296** | **296** | 0 / 0 | 0 / 0 |
| 760 (popover only) before | 0 | n/a | n/a | n/a | 0 / 0 |
| 1400, 1153, 900 after | 0 | 0 | 0 | 0 / 0 | 0 / 0 |
| 760 after | 0 | n/a | n/a | n/a | 0 / 0 |

`documentElement` never overflowed. After the fix at 1400: header, fade and viewport are all 8-1392 hidden and shown, header icons at the same x, message column 8-1096 against the window at 1096-1384.

## Decisions

Reason for each DOM hook, against the "no extension point" list in [host-architecture.md §8](../../../.claude/skills/opencode-gui-plugins/reference/host-architecture.md#8-public-and-internal-boundary). The header button, the store and the styles use public APIs (`Slot session.header`, `Store.global`, `Style`).

- **Option in the host's "Background activity" select** (`src/setting.ts`): the Settings page has no hook for the options of a host select, so the option is injected when the dropdown opens. See "Why DOM injection".
- **Chat card padding and glide** (`src/dock.ts`, `src/panel.tsx`): the chat card's width and position have no extension point (the side panel width per tab is an open upstream request), so the dock is made room for by moving the host's own elements.
- **Opening a child session in the current tab** (`src/open-child.ts`): no API navigates the current tab to a session, so a link click is dispatched; `sessionHref` copies the host's href form. Re-check each OpenCode release.
- **Count badge on the header button, reversing c4f2be7 at the user's request** (`src/toggle.tsx`, `src/panel.tsx`): `c4f2be7` removed the running-subagent count (a hand-made 14px pill); the user asked for it back in OpenCode's style. The host has no count badge on an icon button. Its pieces: `Badge` (`ui/src/data-display/badge`, `data-component="tag"`, accent variant: `--v2-background-bg-accent` on `--v2-text-text-contrast`, 16px high, 4px padding, 2px radius, 11px/530, tabular-nums) and the sidebar toggle's unread dot (`app/src/shell/sidebar-toggle.tsx`: out of flow at the icon button's top end corner, 1.5px ring in `--v2-background-bg-base`, no animation, `Show`). `ctx.ui` has no Badge, but the host's tag CSS is global in the window, so the badge renders the tag's markup and only positions it like the unread dot; no colour or size is declared. It sits 4px up and 6px out rather than the dot's 2px: a 16px tag at 2px covers the 16px icon. It is out of flow, so showing or hiding it moves no header icon (header rects identical at 0, 1, 3, 10 and 99+; Δ0.00). Count is `runningSubagents(session, () => 0).length` while the tab is active (the list's rows and heading read the same function), clamped at `99+` (the host has no clamp to copy; two glyphs keep it narrow). Appearing and disappearing are instant, as the host's `Show` dots are, and on load or session switch it is simply there. The label and tooltip read `Subagents · N` while any run; the badge itself is `aria-hidden`. Pressed (dock shown or popover open) and both colour schemes verified in the harness; the harness has no model, so live counting is covered by the unit tests, and the screenshots inject the badge's exact markup.
- **Motion** matches the host's right panel (spring, content held and translated); the dock's 16px slide has no host sibling and stays by decision.

## Performance

Method: [performance.md](../../../.claude/skills/opencode-gui-plugins/reference/performance.md). Private harness (OpenCode 2.2.5, 2000x1190), the user's GUI plugin set from `.config/opencode/opencode.json` minus blindfold, claude-proxy and usage-resume (server side, secrets), the plugin options of orchestrator-tools dropped. A stub OpenAI-compatible provider holds three subagent sessions running (so the dock shows three spinner rows) and streams a reply into a 240-message thread. Mode on, dock shown. Scenarios: idle 30 s; scroll 40 fast wheel ticks down and 40 up; switch 10 tab switches; stream 15 s of a streaming reply. Metrics from CDP `Performance.getMetrics` (per second of the window), `MutationObserver` callbacks counted by wrapping the constructor (all plugins and the host), `longtask` entries. Three runs each, median. Bare is the same set without agents-panel; master is `master` at 8497253.

| Scenario, metric | bare | master | branch | master (fresh run) | branch (fresh run) |
| --- | --- | --- | --- | --- | --- |
| idle script ms/s | 0.28 | 0.30 | 0.36 | 0.38 | 0.41 |
| idle style ms/s | 1.37 | 2.32 | 2.82 | 4.21 | 3.08 |
| idle task ms/s | 6.3 | 8.1 | 9.5 | 12.2 | 10.5 |
| idle MutationObserver callbacks/s | 0 | 0 | 0 | 0.17 | 0 |
| scroll script ms/s | 136.6 | 137.2 | 137.2 | 138.3 | 138.0 |
| scroll task ms/s | 382.8 | 408.2 | 413.4 | 417.1 | 412.7 |
| switch script ms/s | 15.8 | 22.4 | 22.9 | 23.1 | 23.6 |
| switch task ms/s | 155.8 | 178.7 | 182.8 | 180.7 | 188.9 |
| switch long tasks (10 switches) | 0 | 3 | 1 | 2 | 1 |
| stream script ms/s | 16.4 | 16.9 | 17.0 | 16.7 | 16.9 |
| stream task ms/s | 170 | 199.8 | 202.7 | 201.6 | 196.8 |

Branch and master are equal within run-to-run spread on every row (idle style and task swing 2x between runs of the same build); the branch's idle MutationObserver callbacks are 0 on every run. The plugin set's cost over bare (switch +7 ms/s script, stream +30 ms/s task) is the same on master and does not change here: the bars (within 3% of bare scripting, no new long task) are **not** met by the set, nor by this plugin alone, and this pass did not try to meet them (the per-plugin split needs one run per plugin). Heap after GC, 100 tab switches: branch 32.9 -> 39.7 MB, master 33.6 -> 39.1 MB (flat after the first 20 switches on both).

What this change removes, measured in the real window and, for the Settings installer, in happy-dom:

| Standing cost | master | branch |
| --- | --- | --- |
| Settings `MutationObserver` (real window, outside Settings) | connected for the whole window life | disconnected; connected only while the route is `/settings` (connected 1 -> 0 on leaving, verified) |
| Observer callbacks for 1000 app-root mutations (happy-dom, mode off) | 100 | 1 |
| Document-level listeners the plugin adds | 5 | 0 (58 vs 63 counted for the whole window; the listeners sit on the Settings listbox) |
| Module-level spinner observers at import | 2, never disconnected | none; per spinner, disconnected with it |
| Hand-made `<style>` in `<head>` | one, never removed | none (`ctx.add(Style)`) |
| Header reorder rule | `order: -1` on the host's context button in every session header, mode on or off | only beside our toggle: with the mode off the header's computed `order` is 0, as on bare |

## Changes from the owner pass

- **Spinner from native-ui.** `spinner.tsx`, `spin-phase.ts`, `spinner-radar.ts` were byte copies; they are deleted and `ProgressSpinner` is imported from `../../native-ui/src`. To make that safe, native-ui got a backward-compatible change: `spinnerCss` (the keyframes, also in `nativeUiCss`) replaces the spinner's own `<style>` injection, and `syncSpinPhase` creates its observers per spinner inside the owner and disconnects them on cleanup. A consumer of `ProgressSpinner` must now register `spinnerCss` (or `nativeUiCss`) with `ctx.add(Style, ...)`; only this plugin and the demo use the spinner today.
- **Settings option scoped to the route.** The first design assumed Settings was a body portal. The real DOM (captured in `test/fixtures/settings-background-activity.html`) shows the page is a route, `/settings`, rendered inside `#root`, and only the select's popup is a portal under `<body>`. So the installer takes `active()` (`ctx.router.path().startsWith("/settings")`) and observes `<body>` (childList, subtree) only while it is true; on any other route the observer is disconnected and nothing runs. The keyboard and pointer listeners sit on the listbox, which the host removes with the popup. The option is still offered when the mode is off, since that is the only way to turn it on.
- **Header rule scoped** so the host header is not re-ordered when the mode is off (`order` computed 0 against bare, was -1).
- **Dropped the load-time `cleanupOnce`.** It closed child-session tabs once per load as a migration for tabs "an older version of this plugin opened per subagent" (added in 78bbd26, 2026-10-31, one day before this change), and could close tabs the user opened on purpose. The command "Close subagent tabs" stays. The `ctx.storage.memory` once-flag went with it.
- **`openInCurrentTab`** (AP-9) is kept: no API navigates the current tab; recorded in Decisions above. Re-check each release.
- Effects in `toggle.tsx`, `gui.tsx` and `panel.tsx` are untouched on purpose; the keyed rewrite is a later pass.

## Live verification (private harness, 2.2.5)

- Settings > Timeline > Background activity, mode off, on, and after Cmd+R: "Panel" is the fifth option, Down/Up from Left reach it and Up from it returns to Right, Enter and a pointer click both select it (host value commits Hidden, trigger shows Panel, check moves), picking a host option while on turns the mode off, Escape closes; the listbox sequences are line-for-line identical on master and branch.
- Spinners: three running rows, identical opacity vectors on all three at 12 samples (in phase), 12 distinct frames, 24 infinite animations at start time 0, duration 1800 ms; reduced motion stops them; light and dark screenshots; same on master.
- Header: mode off, children and rects equal bare; mode on, the context button moves ahead of the toggle (`order -1`) with the dock open or closed, same x as master.
- Dock: reload with the window open, centre 852 on every frame and opacity 1 (no animation); toggle hide and show glide as on master; 0 of 100 tab switches ended with the window open and no pad; count badge renders `3` and the tooltip reads "Subagents · 3".
- `parity.mjs --spec parity.spec.mjs`: 327 PASS, 0 FAIL on the branch. The one failure on both master and branch was `hover.animations` on the dock row: with running subagents the row's spinner loops, which the native tab-menu item has not; it is now an `allow` in the spec with that reason.
- Not live: popover mode (right panel open) was not re-driven; the pad claim and glide code is untouched.
