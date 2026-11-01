# cache-warning: design

A grey tray above the composer that warns when the next message will miss the provider's prompt cache. Written against
OpenCode Desktop 2.2.5 (`@opencode/plugin` 2.2.5); host sources are the `v2.2.5` tag (`packages/app/src/session/composer/`,
`packages/ui/src/components/dock-surface.*`).

## Decisions

**Where it lives: the composer lane, by DOM injection.** The extension points were checked first (host-architecture §9).
There is no slot above the composer (`Slot` has `session.header`, `window.bottom`, `session.panel.end`, `session.location.menu`).
`ComposerPill` is the supported home for a status near the composer, and was rejected on three counts: it renders a
focusable `<button data-composer-pill>`, which would add a tab stop to a passive notice; it is a 32px raised capsule, not
a tray; and a pill has no attribute hook, so the tray look would be keyed on its `aria-label`, which is localised. The
host's own trays (`SessionGoLimitTray`, `SessionQueuePanel`) sit in the `above` slot of `SessionComposerRegion` and are
not extensible. So the tray is a child of `[data-component="session-composer-lane"]`, the out-of-flow row the app's pills
float in (`absolute inset-x-0 bottom-full pb-2.5`, `pointer-events: none`): it shares the row with the app's pills through
flex, never resizes the composer, follows the user's Background activity placement, and does not exist in a subagent's
session. Selectors relied on, each a liability to re-check on an app update: `[data-component="session-composer-lane"]`,
`[data-slot="session-chat-panel"]` (a lane's ancestor whose parent is watched), `data-dock-surface="tray"`.

**Look: the host's DockTray contract, upside down.** `data-dock-surface="tray"` gives the surface (`--background-base`,
border `--v2-border-border-base`, radius 12px, `overflow: clip`, `z-index: 0`). The host hangs its tray *under* a shell
(`data-dock-attach="top"`, top corners squared, `margin-top: -0.875rem`); this one stands *on* the composer, so the bottom
corners are squared and the last 14px (`0.875rem`) tuck under the composer, which paints above it (z-70 against 0). The
border is 0.5px, like the host's location footer and its queue and go-limit trays. Colours and type are tokens
(`--v2-text-text-base`/`-muted`, `--line-height-compact`), 13px/440 with the lead in 530, as in the go-limit tray; no hex.
Hugs its text, 14px in from the lane's aligned edge, wraps instead of truncating (a cut-off token count is the one thing
the tray must not hide). No icon, idle time or actions, as approved (mockup variant A).

**Prediction, never a certainty.** Last measured step = the latest assistant message with `tokens` (the step the
context ring reads). The cache runs out `cacheTtlMinutes` (default 5, Anthropic's default; refreshed on every hit) after
that step's `time.completed`, falling back to `streamed`, then `created`. Size = input + output + reasoning + cache read
+ write, written with the ring's formatter (`Intl` compact, whole, lower case: "181k"). Shown only when the context is at
least `minTokens` (20,000), when the step reported cache use (a provider with no cache numbers gives no basis for a claim),
and only before you send: a user message or any later assistant step silences it. Expiry outranks a model change (switching
back would not help). Model/variant come from `ctx.screen.current().composer.model()` against the last step's model.
Not covered: **agent** changes (the composer API exposes the model and variant, not the agent), account switches in a
proxy, early eviction.

**Compaction.** A completed compaction after the last measured step shows "Cache reset · compacted · next message writes a
new cache". No token count: the compaction message carries the usage of the summarising request, not the size of the new
context. Gated on the pre-compaction size, so compacting a small chat stays quiet.

**One timer, no polling.** While a cache is warm, one `setTimeout` is armed for the exact expiry (re-armed if it fires
early, chunked under 2^31 ms) and only asks for a new forecast. No interval, no listener, no timer when nothing is waiting
on the clock. It follows the forecast through `createKeyed`, so a new reply, a send or a session switch cancels and re-arms it.

**Motion: the host's, measured.** The host's docks (`Grow`, `ComposerMorph` in `spring-height.tsx`) open and close on a
JS spring, `Spring.fromDuration(0.4 s, bounce 0)`: critically damped, omega = 2π/0.4, closed form `1 - (1 + ωt)e^(-ωt)`.
Measured on the host's queue panel in the harness (a hanging stub provider, "Move to queue", 120 Hz): height 0 to 45px in
about 0.5 s, opacity equal to (height/full)² on every frame when opening; when closing, opaque until 40% of the box is
left, then `height/full / 0.4`. This plugin replays the same curves as CSS `linear()` easings generated from the closed
form (`spring.ts`, 24 points, settle 0.42 s at the host's half-pixel rest): the tray travels from behind the composer
(`translateY(100% - 14px)`) with the spring, fades in as its square, and on close retracts and fades only over the last 40%.
A tray present when a session mounts, or after a switch, is at rest at once (the host's `born < 250 ms` rule); only a
change you watch animates. Reduced motion (`prefers-reduced-motion`, `:root[data-motion="reduce"]`): 150 ms opacity, no
movement. The state changes on a class of its own attribute (`data-state`), set a frame after the closed state has been
painted in the lane.

Host (queue panel) against the tray, same machine, 120 Hz, opacity by ms since the first frame. Opening: host 0.105 at
63, 0.336 at 113, 0.504 at 146, 0.702 at 196, 0.863 at 262, 0.941 at 329; tray 0.081 at 66, 0.337 at 124, 0.464 at 150,
0.702 at 208, 0.832 at 258, 0.926 at 325. The tray reaches each value about 12 ms after the host, the host's frame loop
taking its first step a frame early; the shapes agree. Closing (ms since the retract began): host 0.869 at 132, 0.493 at
182, 0.271 at 232, 0.115 at 298, 0.059 at 348; tray 0.87 at 139, 0.49 at 189, 0.27 at 239, 0.14 at 289, 0.07 at 339.

**Session switch.** The app replaces the whole chat panel on every switch, a few frames after the route changes. The tray
is therefore placed again whenever it leaves the document: it checks `isConnected` each frame for 45 frames after a
placement (no document search while connected) and watches the child lists of the lane's parent and the panel's parent.
Placement waits at most 120 frames for a lane that is not there yet. Found by test: a first version that looked once
left the tray in the old panel after a switch.

**Not done.** No notification or sound. No calibration from observed `cache.read == 0`. No action ("compact now", "switch
model"): the approved design has none.

## Findings

| Check | Result | Evidence |
| --- | --- | --- |
| Idle gap past the TTL | tray "Cache expired · next message re-reads ~181k tokens" | harness, session seeded 12 min idle, 180k cache |
| Warm | nothing; one timer; flips to the tray at expiry with the enter motion | session seeded 270 s idle: tray appeared 31 s after opening, translateY 28px to 0 over ~0.42 s |
| Model changed in the composer picker | "Cache reset · model changed · next message re-reads ~181k tokens" | picked Model B in a session answered by Model A |
| After a compaction | "Cache reset · compacted · next message writes a new cache" | session with a completed compaction after its last step |
| Small context (8k) | nothing | harness |
| Prompt already sent | nothing, and a visible tray retracts | typed and sent from an idle session: 470 ms retract |
| Session switch, Cmd+R, hot rebuild | one tray, one `<style>`, `window` marker survived the rebuild | harness: `[data-cache-warning]` and `style[data-plugin]` counts |
| No layout shift | composer box identical (340, 792, 720×88) with and without the tray | `getBoundingClientRect` per session |
| Keyboard | the tray holds no focusable element (`div role="status"`) | markup |
| Parity with the host DockTray | 9 PASS, 0 FAIL, 3 N/A (width, height, background 248 vs the footer's 250) | `parity.spec.mjs`; the twin stands beside the host's footer tray, the two cannot share a screen |

Stress (`stress.md`): 380 px and 300 px wide windows wrap onto two lines and keep the number (verified); the 1m formatter
(unit test); light and dark (verified). Not verified live: the Background activity setting at Right/Center (the CSS only
adds a 14px margin on both sides, so the lane's justification decides), the tray beside a running subagent or todo pill,
a subagent session (absent by source: the lane renders only for non-child sessions), a 5,000-message session (the forecast
reads the tail of the message list only).

## Performance

Measured as `performance.md` asks, against the bare app in the same harness and sessions (CDP `Performance.getMetrics`,
ms; two runs each).

| Scenario | Bare script | With plugin script | Notes |
| --- | --- | --- | --- |
| idle, 30 s, tray showing | 1.1, 1.7 | 1.5, 1.8, 1.9, 2.2, 3.4 | 0 to 2 style recalcs, 0 layouts; no interval, one warm-session timer at most |
| switch x10, tray on every other | 54.3, 55.1 | 61.2, 69.2 (106.3 to 131.7 before the fix) | +0.6 to +1.4 ms per switch with a tray; two sessions without a tray equal bare (54.5) |
| type 200 characters | 70.2, 64.5 | 64.5, 68.7, 69.7, 70.5 | no difference |

Not inside the 3% bar on scripting time in the switch run (+11% and +27% of 55 ms: 7 to 14 ms across ten switches). On
the run's total main-thread time the plugin read 875 and 917 ms against 748 and 845 bare, so the difference (4% to 23%)
sits inside the bare runs' own 13% spread without being shown to be under the bar. Long tasks and frames over 16 ms were
not traced. The remaining cost is rendering the tray and its forecast on each switch; it was not split further.

The first readings (106 to 132 ms) came from searching the document for the lane on every one of the 45 settle frames
(`querySelectorAll` showed in the profile); checking `isConnected` instead removed it. Heap growth was not charted. The cleanup removes the tray's node, its observer and its Solid root (at once when
`ctx.signal` aborted or the session changed; after the retract otherwise).
