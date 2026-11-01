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
Full width: exactly the composer's (the lane is the composer's box, `inset-x-0`), left and right edges flush with it at
every window width (checked 1400, 700, 380 and 300 px). This supersedes the first decision, "hug the text, 14px in".
Text is left aligned, starting where the composer's textarea text starts (16px in, less the 0.5px border), not centred.
The tray is `flex: 0 0 100%` and, while it is in the lane, the lane wraps in reverse (`:has(> [data-cache-warning])`), so
the tray is alone on the bottom line and the app's own pills wrap onto the line above it instead of being squeezed (checked
with a stand-in pill; not with a real Background activity or todo pill). It wraps onto two lines instead of truncating (a
cut-off token count is the one thing the tray must not hide). No icon, idle time or actions, as approved (mockup variant A).

**Prediction, never a certainty.** Last measured step = the latest assistant message with `tokens` (the step the
context ring reads). The cache runs out `cacheTtlMinutes` (default 5, Anthropic's default; refreshed on every hit) after
that step's `time.created` (the request start, which is what touches the cache), falling back to `streamed`, then
`completed`. This replaces the first anchor, `time.completed`: a backtest of 1738 real message pairs (below) put recall
at 70.6% with that anchor and 85.3% with `created`, precision unchanged within a point, and it removes the "may warn a
few seconds late" the first decision accepted. The TTL stays exactly 5 minutes, no margin. A step without usage that has
ended (a failed one) made no cache call we can count, so the latest step *with* usage supplies both size and anchor; one
still running silences the tray (a request is in flight and has just touched the cache). Size = input + output + reasoning + cache read
+ write, written with the ring's formatter (`Intl` compact, whole, lower case: "181k"). Shown only when the context is at
least `minTokens` (20,000), when the step reported cache use (a provider with no cache numbers gives no basis for a claim),
and only before you send: a user message or any later assistant step silences it. Expiry outranks a model change (switching
back would not help). The composer reports the model's default variant as undefined, a stored message writes it
"default" (or empty): both are one choice, and a `provider/` prefix on a model id is ignored when comparing (found live: a
false "model changed" on Claude Agent / Sonnet). Model/variant come from `ctx.screen.current().composer.model()` against the last step's model.
Not covered: **agent** changes (the composer API exposes the model and variant, not the agent), account switches in a
proxy, early eviction.

**Cache window learned from the transcript, not fixed.** OpenCode's message API only has `tokens.cache.read/write`; the tier is in Claude Code's transcript (`usage.cache_creation.ephemeral_{1h,5m}_input_tokens`), the same source t3code's idle compaction reads. A server half (`server.ts`, RPC `cache-warning.learn`, the sanctioned GUI to server channel, host-architecture §RPC) gets the native session id (`native.sessionID` on the message content parts; the GUI passes it, the server's own `session.context` is the fallback), finds `~/.claude/projects/<cwd, / and . as ->/<id>.jsonl` (else a search of every project folder), reads at most the last 256 KB from the end (64 KB first), and returns `{ttl, at}` of the newest line that wrote cache, 1h if the 1h counter is above 0 else 5m. Requests served wholly from cache write nothing and are skipped, which carries the last known tier forward. Results are kept per path while mtime and size are unchanged. Hard limits: the id must match `[A-Za-z0-9_-]{1,128}`, the real path must stay under the real projects root (a symlink out is refused), every failure answers "unknown", and only the tier and a timestamp are returned. The GUI (`learn.ts`) asks once per new measured step, keyed by session and step id, and uses an answer only while its step is still the latest: a newer write showing another tier replaces the old one and the old one never outlives it. A tier logged over 65 minutes before the step's request is ignored. Unknown means `cacheTtlMinutes`. The anchor is still the request start, and the tray text is unchanged. Verified on the real transcript of this repo's session (5m) and with fixture tests; not verified inside a running desktop app (needs the service restart).

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

**Exit: the end is the transition's event, not a timer.** The first version removed the tray on a timer set when the exit
began. The app can hold the main thread for a few hundred ms right after a send (it renders the new turn); the timer then
fires with the stall, before the closing state was ever painted, and the tray vanished with no motion. Reproduced in the
harness by blocking the main thread 450 ms when `data-state` became `closing` (tray gone 20 ms after the stall, no
intermediate frame). Now `leave.ts` ends it on `transitionend` of the opacity track (or `transitioncancel`); the timers
are backstops only, one armed after the first painted frame, one hard cap. A session switch and a plugin reload still end
it at once (the host has replaced the panel).

**Session switch.** The app replaces the whole chat panel on every switch, a few frames after the route changes. The tray
is therefore placed again whenever it leaves the document: it checks `isConnected` each frame for 45 frames after a
placement (no document search while connected) and watches the child lists of the lane's parent and the panel's parent.
Placement waits at most 120 frames for a lane that is not there yet. Found by test: a first version that looked once
left the tray in the old panel after a switch.

**Not done.** No notification or sound. No calibration from observed `cache.read == 0`. No action ("compact now", "switch
model"): the approved design has none.

## Backtest

1738 real consecutive assistant steps from the author's ten busiest sessions (Claude Agent provider); positive = the step
really missed the cache (`cache.read == 0` with at least 20k written), predicted = an "expired" notice at the moment of
the send. Same data, the two anchors, with the current predictor (walk-back past token-less steps included):

| Anchor | TP | FP | FN | Precision | Recall |
| --- | --- | --- | --- | --- | --- |
| `time.completed` (first decision) | 25 | 13 | 9 | 65.8% | 73.5% |
| `time.created` (now) | 30 | 16 | 4 | 65.2% | 88.2% |

Before the walk-back change the same anchors read 24/12/10 (66.7%, 70.6%) and 29/15/5 (65.9%, 85.3%). Small n (34
positives); the single token-less-step case in the data (an 80 minute gap, a full 244k rewrite) is now caught.

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
| Full width | tray left/right edges equal the composer's at 1400, 700, 380 and 300 px; text 16px in, as the composer's | harness `getBoundingClientRect` |
| No layout shift | composer box identical (340, 792, 720×88) with and without the tray | `getBoundingClientRect` per session |
| Keyboard | the tray holds no focusable element (`div role="status"`) | markup |
| Parity with the host DockTray | 9 PASS, 0 FAIL, 3 N/A (width, height, background 248 vs the footer's 250) | `parity.spec.mjs`; the twin stands beside the host's footer tray, the two cannot share a screen |

Stress (`stress.md`): 380 px and 300 px wide windows wrap onto two lines and keep the number (verified); the 1m formatter
(unit test); light and dark (verified). Not verified live: the Background activity setting at Right/Center (the tray is full
width, so it should not matter), the tray beside a running subagent or todo pill,
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
