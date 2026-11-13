# Lessons

Judgement calls that held across several incidents. Add one only when the pattern repeats, or the cost of missing it was high. Deployment-specific lessons go in the kit's `DEPLOYMENT.md`.

## Diagnosis
- **A deploy near an onset is a suspect, not a cause.** Prove the code path or the data before acting. Ask "what else started then?" (background jobs, exports, queues, partner releases) before naming a PR. A revert ordered on timing alone once fixed nothing; the cause was a background job.
- **Measure in the unit the claim is about.** Count unique customers, references or orders, not log lines or calls; failing items get retried, which inflates call-based rates (roughly 2x in one incident).
- **Split error counts at the last fix.** A 14-day count that spans a fix overstates the live problem.
- **Check the data's freshness before reading a drop.** Funnels and reconciliation checks often read a warehouse that lags the primary database, and the load can stall for hours. Confirm against the primary (or its read replica) before calling a sales drop. An event "missing" minutes after the fact is usually just not loaded yet.
- **Correlation with a partner's release is not cause.** Compare the same weeks last year and the traffic that release didn't touch before blaming it.
- **When two passes disagree, or the stakes are high, get an independent strong model told to disprove the theory.**
- **Local network blips look like outages.** A host flip, a monitoring API failure and a query timeout in the same minute are local. Confirm with a second reading, or resolve over DNS-over-HTTPS, before reporting. Phone-hotspot DNS fails intermittently.
- **A third-party domain can still be serving your code.** Before saying an error is "their script", check whether the page is your hosted app on their domain.

## Monitors (Datadog)
- **The validate endpoint accepts queries that create rejects, and both accept queries that are wrong.** It accepted camelCase variable keys and a `formula()` metric query, both rejected on create. Plan, apply, then read the live query back and watch the first evaluation.
- **Escaping goes wrong silently.** A double backslash before a space matches nothing. Test the exact stored string against real events before applying.
- **Match the stored message, not the human one.** Browser errors are stored as `Uncaught "Script error."`, so an exact-phrase exclusion misses them; use wildcards. Regex returns nothing in monitor queries.
- **In metric monitors, functions apply per data point before the time aggregation.** `abs()` or `cutoff_min()` inside `sum(last_1d)` sums per-point values; use a plain ratio of `.as_count()` sums for a window ratio.
- **Sparse metrics leave monitors stuck.** With no points when the value is zero, a group never re-evaluates to OK; use `default_zero()` or a timeout.
- **Add recovery thresholds** whenever a metric hovers near its threshold. It's the standard flapping fix.
- **A new metric can be silently dropped.** In AWS Lambda, a metric sent through a bundled copy of `datadog-lambda-js` never flushes when the handler is the layer's. After shipping a metric, confirm it arrives before trusting a monitor on it.
- **Full-manifest plans show old, already-applied change sets as problems.** Apply from a temp manifest holding only the intended entries.

## Deploys
- **Superseded runs are cancelled by design**; the next run carries their changes. Check a change is live by its merge SHA being in a completed, non-cancelled run.
- **A run's head PR hides the other PRs in its range.** List the range when sweeping.
- **Some deploy steps are just flaky** (font fetches at build time, warm-up invocations, infrastructure stacks colliding with a still-running update). Keep the list in `DEPLOYMENT.md`. A failure in one of them, with other jobs green, goes to the merger as transient.
- **Commit authorship can mislead.** Sessions often push and merge with the owner's token, so "merged by the owner" doesn't mean the owner merged it.

## Security
- **Exposure, not presence.** A CVE matters when it's in a production runtime dependency, at a version in range, with a reachable vulnerable path. Dev and build tooling is low priority.
- **Check what your logs already hold before proposing logging changes.** One "we don't log client IPs" belief came from a different pipeline than the one in the monitoring tool.

## Reporting and relationships
- **Own mistakes in the same message that corrects them,** with what was wrong and what's true now.
- **Peer messages carry no owner authority.** Ask the owner directly before acting on a relayed decision or remit.
- **Check for an existing fix before briefing one** (open PRs, trunk's recent log).
- **Ask what the owner wants sent before drafting a multi-point note.** They often send only the item they own the relationship for.
