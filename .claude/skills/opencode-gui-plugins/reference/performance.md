# Performance

A plugin is done when it is **free**: indistinguishable from the app without it. Measure, change one thing, measure again (hill climb), and stop when every row below is inside its bar.

## Baseline

Run the harness (`scripts/desktop-harness.sh`) on a seeded long session (`scripts/seed-session.mjs`, 500+ prompts) with a private `OC_HARNESS_ROOT`. Take the **bare** reading with no plugins registered, then one reading per plugin alone, then all together. A plugin's cost is its reading minus bare, on the same session and script, three runs, median.

Seed realistic data ([stress.md](stress.md)): rich threads and a populated sidebar, not text messages.

## Scenarios (identical script each run)

| Scenario | What runs |
|---|---|
| idle | 30s with the window focused, nothing touched |
| scroll | fast scroll through the timeline, top to bottom and back |
| type | 200 characters into the composer |
| switch | 10 session switches, sidebar open, then closed |
| stream | a running tool and a streaming reply (stub where the harness has no model) |
| hover | sweep the pointer across every plugin surface |

## Metrics (CDP `Performance.getMetrics`, `Tracing`, `HeapProfiler`)

- scripting + layout + style ms per second (main thread busy)
- long tasks (>50ms) and frames over 16ms, attributed to the plugin by stack
- MutationObserver callbacks per second and records per callback
- forced reflows (layout read after write) per interaction
- DOM nodes and event listeners the plugin adds
- JS heap after the switch scenario, with a forced GC (growth = leak)
- bundle size and load time of `gui-experimental.cjs`

## Bars

- idle: <0.5% main-thread time, zero timers or observer callbacks without a host change
- every other scenario: within 3% of bare scripting time, no new long task, no new frame over 16ms
- heap flat after GC across repeated switches; listeners and observers return to zero on cleanup
- DOM nodes bounded by what is visible, never by conversation length

## Hill climb

1. Rank plugins by cost; fix the worst first.
2. Find the cause in the trace (observer on a broad subtree, per-mutation layout reads, polling, per-row work, effects re-running on unrelated signals).
3. Fix one cause, re-run the same scenario, keep the change only if the number moves.
4. Record before and after in the plugin's `DESIGN.md` under `## Performance`.
5. Repeat until every plugin is inside the bars, then run all plugins together once more.

The report carries one table: plugin, scenario, bare, with plugin, delta, bar, PASS or FAIL.
