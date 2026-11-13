# Playbook

Procedures for each cadence and change. The kit's `DEPLOYMENT.md` names the actual tools, hosts, workflow ids and queries.

## The watch
A long-running script, run as a background monitor that re-arms itself (e.g. every 30 minutes, with a ttl of up to 7 days). It reports:
- deploy run status
- client bundle changes
- customer-facing host flips
- asset mismatches
- monitor state changes
- orphan payments
- new critical/high dependency alerts

Re-arm it before it expires: start a new one, then stop the old, and make the script kill any older copy itself so two never run at once. Edit it safely: back it up, edit, check the syntax (`bash -n`); changes take effect on the next re-arm. Confirm a change in state with a second reading before reporting it. Gate each loop on a local-network canary (two well-known URLs): while both fail, skip the probes and report one "network down" line and one "back" line, rather than a flood of false outages. When many hosts and APIs fail at once anyway, check the monitoring vendor's own synthetics, which run from its servers, before treating anything as down.

## Deploys
1. On `queued`/`in_progress`, note the PR title. For risky areas (auth, payments, partner APIs, infrastructure), book a 30-minute post-deploy error sweep against the same window a week earlier.
2. On a client bundle change, fetch the customer-facing hosts and check each returns 200 and references the new bundle.
3. On `failure`, find the failing job and its error line. Classify it as real or a known flake (DEPLOYMENT.md), and send the merger the job, the error and your classification. Never rerun.
4. On `cancelled`, say which later run carries it.

## Funnel
Report only when completed checkouts or a key partner's bookings drop more than 25% against **both** comparison weeks (same weekday 7 and 14 days back; last year for seasonality). Before calling a breach:
- check the warehouse's freshness (the newest event timestamp)
- confirm against confirmed orders in the primary database

Small numbers (under ~10) are noise unless the earlier stages (sessions, product views, add to cart) also fall.

## Daily tune (~15 min)
1. List the monitor transitions in the last 24h. For each Warn or Alert, decide real or noise, holding warnings to the alert bar.
2. Noise: find why (threshold, window, a caller mistake counted, flapping) and retune from a baseline of 14+ days, written into the rationale.
3. No Data for over 24h: is the metric gone, or sparse by design? Fix it or document why.
4. Drift: monitors outside the managed manifest, other than those you've been told to leave: adopt them or propose deletion. Flag new clusters of monitors that could be merged.
5. Attack traffic in one line: scanner volume, new probe types, any 2xx on a probe.
6. One line to the log. Tell the owner only if a change is proposed.

## Weekly gap research (~1 hour; delegate to a subagent with a tight brief)
Look for what broke that no monitor caught:
- API errors by operation and type, week on week (new types, growth over 3x)
- function errors and every dead-letter queue
- 5xx by service
- booking and payment failures
- LLM and paid-API volume
- any standing checks listed in STANDING.md
- pruning: monitors with 0 real alerts in 30 days and no plausible failure to guard
- CVE triage of new dependency alerts

For each gap: a new monitor (only if actionable and low-noise), a retune, or a builder brief.

## Applying a monitor change
1. A builder PR edits the monitor manifest: a `create`, or an `update` with an `expect` block naming the current live query, plus a rationale with the baseline.
2. After merge, build a temp manifest holding only the intended entries, and run the sync as a plan.
3. Ask the owner (unless this exact change is already approved), then apply that section only.
4. Read the live monitor back (query, thresholds, state) and watch its first evaluation. If create rejects it, fix it in the temp copy, validate, apply, and brief a follow-up PR so the repo matches what's live.

## Security
- **CVEs:** the watch reports new critical/high dependency alerts. For each one, answer three questions:
  - Is it a production runtime dependency, or dev/tooling only?
  - Is our resolved version in range?
  - Is the vulnerable path reachable? Cite file:line.

  Report to the owner only "act now" (production and reachable) or unclear, with the smallest fix.
- **Attack traffic:** scanners, exploit probes, credential stuffing, rate spikes. The signals that matter are a probe that got a 2xx and auth-failure bursts. Identify the source IP, user agent, pattern and target, and whether anything got a real response.
- Push recurring checks into monitors, proposed via PR, rather than doing them by hand.

## Restarts and gaps
After a watch restart notice:
1. List the deploy runs created during the gap.
2. Check for monitors not OK.
3. Report gaps over ~10 minutes in one line; skip shorter ones.

## Handover before a compact
Append a HANDOVER entry to the log:
- the watch id and expiry
- open threads
- pending owner decisions
- items with other sessions
- schedules
