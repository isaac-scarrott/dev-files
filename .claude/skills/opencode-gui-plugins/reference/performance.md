# Performance

A plugin is done when it is **free**: indistinguishable from the app without it. Measure, change one thing, measure again (hill climb), and stop when every row below is inside its bar.

The tool is `scripts/perf.mjs`. It drives the isolated harness over CDP, restarts the app per run, and prints one table.

```sh
cd ~/git/dev-files/.claude/skills/opencode-gui-plugins/scripts
mkdir -p /private/tmp/pw && (cd /private/tmp/pw && npm i playwright-core)          # once, public registry
node perf.mjs --runs 3 --out /private/tmp/oc-perf                                  # bare, null, every GUI plugin alone, all together
node perf.mjs --plugins timeline-rail,sidebar-repos --only-all --scenarios open,reopen,stream   # a subset; --only-all = bare, null, all
node perf.mjs --report --out /private/tmp/oc-perf                                  # rebuild report.md from runs/*.json
PERF_PLUGINS_ROOT=/some/snapshot node perf.mjs ...                                 # measure a snapshot (before/after: `git archive master apps/opencode-plugins`)
```

Ports are private (CDP 9577, service 49688, stub model 49777) and checked free first. Other agents run harnesses too: never share a port, never `pkill` by name, kill only what the script started. Runs take 3 minutes each (12 configs x 3 runs is two hours): rank with one run, confirm with three, and snapshot the tree before a long run (rebuilding a `dist/` mid-run changes what is measured).

## Data: realistic, not lorem

A plain thread (text prompts, one text answer each) is the cheapest thing the host renders and hides what makes real threads slow to switch to. The default seed (`seed-session.mjs --realistic`, 650 assistant messages) is shaped from aggregate counts and byte sizes of the heaviest real threads, read from the local database as numbers only (never content, never in a file or report):

| Shape (per heavy thread) | Real range | Seed |
|---|---|---|
| user prompts / assistant messages | 17-150 / 535-813 | 81 / 650 (a prompt every ~8 assistant messages) |
| tool parts per thread, avg and max size | 730-870, 4-8 KB avg, 140-220 KB max | ~1.3 per assistant message, long tail to 220 KB |
| reasoning parts | 450-580, 1-3 KB avg, 8-100 KB max | on 80% of assistant messages, same tail |
| text parts | 14-230 (most assistant messages are tool and reasoning only) | on 15%, markdown with fenced code |
| tools by count | read, shell/bash, edit and apply_patch diffs (25 KB avg), grep, subagent, glob, task, todowrite, webfetch | same mix, `edit` carries `metadata.files[].patch` diffs |
| subagent children | 3-45 per thread, 24 messages avg | 26, linked by the `subagent` tool's `sessionID` |
| attachments | a few images | one every 17th prompt |

Import schema notes (`POST /api/experimental/session/import`): import the parent before its children; a tool part is `{type:"tool", id, name, executed, native, state:{status, input, metadata, content:[{type:"text",text}]}, time:{created, ran, completed}}`; an errored tool needs `state.error.type`; user `files[]` need raw base64 `data` (no `data:` prefix), `mime`, `name` and `source:{type:"inline"}`. Add shapes (a 5,000-message thread, an oversized diff) in `seed-session.mjs`; keep stand-ins synthetic. `--plain` keeps the old seed for quick checks.

## Sidebar scale (`--sidebar [L,A,P]`)

A thread is not the only heavy thing: a user with many live sessions has a long sidebar, and per-row work in a plugin multiplies by it. `--sidebar` adds the `fixtures/sidebar-seed` plugin (opens L sessions as tabs; part of every config, so it is floor, not cost), seeds L live and A archived sessions over P project directories (default 150, 600, 12; 3-12 messages each, a long tail of title lengths), and switches to sidebar scenarios: `coldload` (reload to first row and to settled), `sbopen` (ten row clicks, click to settled), `sbscroll` (wheel the list), `sbexpand` (expand and collapse Archived three times, page it), `sbhover` / `sbhoverx` (pointer sweep, group closed or open). Do not use 300 tabs as a default: the host alone needs about a minute to settle a cold load with 300.

Not covered, and said so in every hand-off: Snoozed rows (the plugin's store is device-local; seeding it needs the plugin's own UI), mixed running/attention statuses (no model, so nothing can run), a thread switch mid-stream, offline/reconnect, deleted or renamed projects, zoom. State order matters: the same sweep costs 0.4 s of style after a reload and 3.6 s after other scenarios, so keep the scenario order fixed and reload before a measurement you want clean.

## Setup shared by every run

Fresh private root, side-tabs layout (sidebar plugins act only there), the long thread **not** opened yet, viewport 1600x1000. Instrumentation is installed before any plugin loads (`addInitScript`): wrapped `MutationObserver`, timers and `requestAnimationFrame` (counts), a long-task observer, a frame-delta sampler, and a "last DOM or long-task activity" clock.

## Configs

- `bare`: no plugin.
- `null`: a plugin whose `setup` does nothing (`scripts/fixtures/null-plugin`). Loading any plugin costs the host about 35 ms of script per 30 s and a little per interaction. That is the host's, not the plugin's: **every verdict is against `null`**, not `bare`.
- each GUI plugin alone, then `all` together (plugins add up, and some share work, so `all` is not the sum).

Seed realistic data ([stress.md](stress.md)): rich threads and a populated sidebar, not text messages.

## Scenarios (identical script each run)

| Scenario | What runs |
|---|---|
| open | click the thread's row on Home: nothing of it is loaded (cold). 8 s window, so work a plugin starts later (history paging) lands in it |
| reopen | draft tab to thread tab, five times, 2.5 s window each (warm) |
| idle | 20-30 s, window focused, nothing touched |
| scroll | real wheel events (up, down, up, down, 1.5 s each, 6 s total). Not `scrollTop` writes: the host and plugins treat wheel as "the user is scrolling" |
| type | 200 characters into the composer |
| switch | 10 flips draft <-> thread with Ctrl+Tab, sidebar open, then 10 closed. Heap, nodes, listeners measured around it after forced GC |
| stream | a tool call then a streamed markdown reply from a local stub OpenAI-compatible provider (`stub/stub-1`), in the thread |
| hover | snake the pointer across the whole window twice |

`open` and `reopen` also record, on the page clock from the click's `pointerdown`: **first row** (a message row visible), **first paint** (frame after it), **settled** (no DOM mutation and no long task for 250 ms).

## Metrics

Per scenario (CDP `Performance.getMetrics`, deltas): script, layout and style ms, layout and style recalc counts, main-thread busy ms (`TaskDuration`: noisy, shown not judged), long tasks (>50 ms), frames over 20 ms, frame-time p95 and max, MutationObserver callbacks and records, timer and rAF fires, heap, nodes, listeners, live intervals. Plus bundle size and switch latency. `--profile` adds a V8 CPU profile per scenario: self time by script and by function (plugin code has an empty script url and its minified names, e.g. `prompts :314`; build with `vite build --minify false` into a copy and point `PERF_PLUGINS_ROOT` at it to read real names). `--eval JS` runs JS in the page before the scenarios: hide a plugin's node, kill a transition, flip a debug flag, then compare.

## Bars (against `null`)

- idle: script + layout + style under 0.5% of the window, no extra observer callbacks or timers
- every other scenario: script within 3% of the floor or the floor's run-to-run spread, whichever is larger; no new long tasks beyond the spread; frames over 20 ms within one frame of the spread; frame p95 unchanged
- open / reopen: first paint and settled within 5% or 20 ms or the spread of the floor
- heap flat after GC across the switch scenario; nodes and listeners flat; intervals back to the floor's after cleanup
- DOM nodes bounded by what is visible, never by conversation length

A bar a plugin cannot meet because the **host** pays the cost of something the plugin legitimately asks for (see "History" below) is reported as a decision, not hidden.

## Lessons (each cost a measurement to learn)

- **Judge against a no-op plugin, three runs, median.** One run has no noise estimate and fails everything; bare vs plugin charges the plugin for the host's plugin runtime.
- **Time-box scroll, drive it with wheel events.** A "scroll to the end" loop never ends when a plugin pages history; `scrollTop` writes skip the input-recency gates real plugins use. A fixed window also needs frame stats: a plugin that makes frames slower does *less* scripting in the window (fewer frames), so script ms alone says it is free. Read p95 and max frame time.
- **Transitions on nodes that are created and retired every frame cost compositor layers, not script.** The tick rail's per-tick `transform`/`opacity` transitions halved the frame rate in fast scroll, with zero plugin JS in the profile (the time was in `(program)`). The `--eval` experiment (`transition: none`, `display: none`) found it in minutes; the fix gates transitions off while scrolling.
- **A forced layout (`void el.offsetWidth`) in a loop that runs while the page scrolls is a whole-page layout each time.** Use `@starting-style` for entry transitions.
- **Reading a long list through Solid store proxies is the cost, not the loop.** Rebuilding something from every message (proxy `get` per message, part and field, plus subscriptions to all of them) cost more than the work on the data. Track a cheap stamp (count, newest message's lengths and state), read the data untracked, and read it raw (`item[$RAW] ?? item`, from `solid-js/store`, which the host provides). Throttle rebuilds of anything O(conversation) that a streamed delta can trigger.
- **Cache pure text transforms by the text** (markdown stripping): two generations (this run's, last run's) keep it bounded. Keep the cache per session, outside the component: the component remounts on every switch.
- **A `MutationObserver` on the document sees every DOM change of the app.** Filter in the callback by cheap structural tests (`target.closest(sidebarSelector)`, "does an added node carry my selector") before doing anything, and never run a whole-document `querySelector` per record; an `[id$=...]` selector over 10k nodes per callback is the pattern behind most plugin overhead here. The timeline mutates on every scroll step and streamed delta.
- **A document-wide lookup per `mousemove` costs more than everything else the handler does.** Cheap tests first.
- **Host `loadMore` re-reconciles the whole loaded list on every page** (`setStore(..., reconcile(messages))`), so paging a thread page by page is quadratic in the thread's size, and heavy rows (tool output, diffs) make each page expensive. `loadMore({ all: true })` publishes once. Start background loading after the thread has settled and let it land in idle time.
- **Debug flags must keep types.** A `globalThis.__flag` test spliced into a `<Show when={...}>` turned the mount element into `true` and crashed the component silently, so a whole experiment measured nothing. Check the plugin's own console output (`[plugin] <name> ...` in `$ROOT/desktop/logs/*/renderer.log`) after any experiment build.
- **A sibling-combinator `:has()` in a stylesheet that every timeline row meets costs frames, not script.** `row:has(+ gap + row)` re-evaluates on every virtualizer insert; the profile shows less script with the plugin than without. Find it by disabling the plugin's style tag with `--eval`, then dropping rules line by line. Prefer forward combinators or an attribute set once from JS.
- **Per-row work in a plugin multiplies by the sidebar.** The three that mattered at 150 rows: a layout read per row after each write (batch reads, then writes), `getComputedStyle` per text measure (once per pass, cache widths), and a new `Intl` formatter per call (`toLocaleString` builds one every time; cache one per locale).
- **`:has(:focus-visible)` / `:has(...)` across a long row list is invalidated by any descendant change.** Prefer an attribute the plugin sets once on the row.
- **Orphaned harnesses.** A run killed by a tool restart leaves the app and its service on your ports and the next run refuses to start. Check `ps` for your `--remote-debugging-port` and `$ROOT/desktop/cli`, kill the app first (it respawns its service), then the service.
- **Never reuse default ports or `pkill` by pattern.** Another agent's harness can hold the same ports; a second app on the same CDP port fails to start and a name-based kill takes theirs down. `perf.mjs` refuses busy ports.
- Playwright `click()` on a sidebar row is the only reliable switch (DOM `el.click()` and synthetic events do not reach the tab's pointer handlers); Ctrl+Tab switches with the sidebar closed. `sidebar-repos` hides the Home row, so go Home with a DOM click on `[data-action='vertical-tabs-home']`.
- `rAF`-sampling frame deltas works only while the window is visible and not occluded.

## History: a decision, not a fix

A plugin that needs the whole conversation (the timeline rail's ticks) makes the host load and re-render all of it. That is paid again on every switch back to the thread (long tasks on re-open) and scales with thread size, whoever asks for the history. The cheap parts (one publish instead of N, start delay, idle pacing) are done in `timeline-rail`; whether a rail may load history eagerly at all is a product decision recorded in its DESIGN.md.

## Hill climb

1. Rank plugins by cost (one run each, realistic data); fix the worst first.
2. Find the cause: `--profile` for script, `--eval` toggles for rendering cost, a diff of function self time against `null` for host work the plugin triggers.
3. Fix one cause, re-run the same scenario three times, keep the change only if the number moves.
4. Record before and after in the plugin's `DESIGN.md` under `## Performance`.
5. Repeat until every plugin is inside the bars, then run all plugins together once more.

The report carries one table per kind: plugin x scenario with delta, bar and PASS or FAIL; switching latency; footprint after the switch scenario.

## Memory and reload growth (`scripts/leak.mjs`)

`node leak.mjs [--plugins a,b] [--reloads 50] [--every 10] [--switches 0]` loads GUI plugins from a throwaway copy of their bundles, opens the realistic thread, touches every copy `--reloads` times (the host hot-reloads each one) and prints, after a forced GC: renderer JS heap, DOM nodes, listeners, documents, plugin style tags, live intervals, service and app RSS, and "loading plugin" log lines. `--switches N` presses Ctrl+Tab N times at the end. Compare against a no-op plugin (`PERF_PLUGINS_ROOT` pointing at a directory holding `fixtures/null-plugin`): anything the null plugin also does is the host's.

Measured 2026-11-02, OpenCode 2.2.5, all 14 GUI plugins (the whole set), 50 reloads:

| | start | after 50 reloads |
|---|---|---|
| renderer JS heap | 28.4 MB | 30.0 MB |
| DOM nodes / listeners / documents | 3071 / 471 / 2 | 3089 / 469 / 2 |
| plugin style tags, live intervals | 23, 2 | 23, 2 |
| service RSS | 744 MB | 961 MB |
| app (Electron) RSS | 538 MB | 728 MB |
| "loading plugin" log lines | 42 | 2170 (about 42 per reload: one per plugin) |

Per plugin, 40 reloads each, the no-op plugin grows the service by +93 MB and the app by +18 MB; every real plugin lands between +62 and +97 MB and +17 and +37 MB, so the differences are noise. Renderer heap, nodes and listeners are flat for each. Reading: GUI plugin dispose is clean; about 2 MB of service memory and 0.5 MB of app memory are kept per reload whatever the plugin is, which is the host's (module re-import and script cache).

Server instances scale with directories, not sessions: seeding sessions in D directories and opening one tab in each gives 7 "loading plugin" lines per directory with the six server plugins loaded (1 per directory with none), and the host alone grows the service by about 410 MB for 12 directories (about 35 MB each); the six server plugins together are within noise of that. A hot reload re-loads every plugin in every directory instance, so reload churn multiplies by the directory count (a worker-per-directory workflow of 40 directories logs about 280 lines per reload).

Switching: 400 Ctrl+Tab switches between a draft and the long thread grow heap by 9 MB, nodes by 2.1k and listeners by about 650 with all plugins and by 8-9 MB, 2.5k and 315 with the no-op plugin; the host keeps recently viewed timelines, so growth plateaus (listeners +389 at 150 switches, +631 at 400). No plugin-owned growth separates from the host's.

Not found, so not fixed: unreleased intervals, observers or subscriptions in any plugin's dispose; unbounded plugin caches (the per-session prompt cache is capped at six, the text-width cache clears at 2000 entries, the injected-row `parsed` map is pruned each pass; `no-project`'s `known` map is bounded by the session count and pruned on delete). Not measured: the harness cannot run a real model, so streaming growth over hours, snapshot git spawns and the service's own database and event buffers are untested here.

## Disk writes (`scripts/writes.mjs`)

`node writes.mjs <bare|all> <seconds> <idle|switch|scroll|type|mix|reload>` snapshots every file size under the harness root, runs the activity, and lists what grew. Harness numbers, OpenCode 2.2.5, bare and all 14 GUI plugins alike unless noted: idle 0 KB/s; tab switches 6 KB/s, almost all in `desktop/drafts.sqlite-wal` (about 11 KB per switch, the host rewriting its window-state values); typing 8 KB/s, same file; scroll under 1 KB/s; a hot-reload storm (every plugin touched about every second) 32 KB/s, in the service's `opencode.log` and `opencode.db-wal`, not in the Electron main process. No plugin file or store grows on its own: `snooze-archive` writes its store only on a user action, and `usage-resume`, `monitor` and `scheduler` append short diagnostic lines on events (19, 12 and 7 KB over 30 reloads).

macOS flagged the main Electron process for about 511 KB/s of file writes over 18 hours (report `OpenCode_2026-11-01-112559`, heaviest stack: a thread-pool thread in `write`). That rate was not reproduced here: no scenario reaches it from the main process, and the real app's logs (427 KB over 20 hours) and database (rewritten values of 12-69 KB, idle at rest) do not account for it. Candidates left, all host-side: the host persisting window or browser-pane state on a busy event stream (the largest persisted value is `plugin.browser.history`, 69 KB, so a per-navigation rewrite of it at a few Hz is the right size), and `drafts.sqlite` WAL cycling (8 MB WAL beside a 9 MB database). To confirm, run `fs_usage -w -f filesys <main pid>` with sudo during a busy hour, or watch `drafts.sqlite-wal` while a browser tool drives a page.

## Animations: measure total CPU, not main-thread task time

`Performance.getMetrics` `TaskDuration` is the renderer's main thread only. A compositor-driven animation can read 1 ms/s there and still cost 200 ms/s in the renderer's raster workers and the GPU process. Read per-process CPU too: `(await browser.newBrowserCDPSession()).send("SystemInfo.getProcessInfo")` gives `cpuTime` per process type; take two samples 8 to 10 s apart (`variants2.mjs` pattern: inject the variants as fixed-position cards and compare). Measured in the harness (120 Hz window): `opacity` and `transform` on a masked layer, about 0.4 ms/s GPU; an animated `clip-path: inset()` window over a masked layer, 75 + 150 ms/s for one 14px icon (raster tasks every frame, with or without `will-change`, mask or background-image). Any one continuous animation costs the page most of 100 ms/s here because every frame is composited; an animation that has finished costs nothing, and one that rests for most of its loop costs in proportion to its active share. Style recalcs of reason `Animation` (about 4 per second) appear after a load, until the composer popover has been opened once, for any running animation (a foreign 4px one too): host state, not the plugin's CSS; compare against a foreign animation before chasing them. Trace them with `devtools.timeline` plus `disabled-by-default-devtools.timeline.invalidationTracking`.

The cheapest way to make a drawn stroke feel alive is a second copy of it, laid over the dim one, whose only animation is `opacity` (a lub-dub flash of the whole trace): one animation per icon on a pseudo-element, nothing travels, nothing re-rasterises. Measured for a chip and 5 timeline rows (+ 5 popover rows open), total renderer + GPU ms/s: that flash 42-63 + 122 shut and 35-43 + 104-126 open (6 and 11 animations), against 60-75 + 190 and 49-51 + 210 for a 7px band moved by `transform: translateX()` behind a mask (also 6 and 11 animations), and 18 and 33 animations for a dot with two tails. Notes: where you can add a child, mask the parent; where you cannot (a host capsule: only pseudo-elements), a light that must show only through a stroke needs a stencil (`background: inherit` plus a mask with `mask-composite: exclude`), never a stencil over an already masked trace, whose edge coverage multiplies (a x a) and thins a 0.9px stroke; keep animating only `transform` and `opacity` (an animated `mask-position`, `clip-path` or `@property` gradient repaints or re-rasterises every frame), and never put `animation-composition: add` on a looping animation (per-frame style recalcs: measured); a CSS transition does not start from an animated value (removing the animation snaps the property to its static style), so to fade an animated element out keep its animation and put a second, finite one on top with `animation-composition: add` (`from { opacity: 0 } to { opacity: -1 }`); a `mask-size` transition is fine for a one-off 300ms settle (it repaints only while it runs); and when capturing paused frames by seeking `animation.currentTime`, a compositor-driven animation sometimes renders the previous seek: seek twice with two `requestAnimationFrame`s between, and verify the frame before trusting it.
