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

## Setup shared by every run

Fresh private root, side-tabs layout (sidebar plugins act only there), the long thread **not** opened yet, viewport 1600x1000. Instrumentation is installed before any plugin loads (`addInitScript`): wrapped `MutationObserver`, timers and `requestAnimationFrame` (counts), a long-task observer, a frame-delta sampler, and a "last DOM or long-task activity" clock.

## Configs

- `bare`: no plugin.
- `null`: a plugin whose `setup` does nothing (`scripts/fixtures/null-plugin`). Loading any plugin costs the host about 35 ms of script per 30 s and a little per interaction. That is the host's, not the plugin's: **every verdict is against `null`**, not `bare`.
- each GUI plugin alone, then `all` together (plugins add up, and some share work, so `all` is not the sum).

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
