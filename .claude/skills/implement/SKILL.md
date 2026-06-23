---
name: implement
description: Implement a Linear ticket, a parent ticket with sub-tickets, a milestone, or a freetext task end-to-end using your agent's sub-agents — one sub-agent per vertical slice that builds and self-tests; the main thread orchestrates, independently confirms each slice against spec, and holds the final gate. Use when the user wants to autonomously implement a ticket or task in the current session, or invokes /implement.
---

# implement

The main thread orchestrates and owns every check; one sub-agent per slice does the building and
self-testing, so build transcripts stay out of your context.

## Philosophy

- **Orchestrate, don't build.** Hand each slice to a fresh sub-agent and stay out of the diff.
- **The feedback loop is the speed limit.** A slice is not done until its behavior is
  *demonstrated*, not asserted — self-test evidence is the gate, every time.
- **Framework, not recipe.** Give a sub-agent the slice and the constraints, not the steps.
- **Real findings only.** Correctness, security, convention, spec. This one filter stops infinite
  loops *and* scope creep. Drop subjective polish.

## Hard constraints

- **Review lives with the main thread.** It checks each slice's diff as it needs to; the final
  gate is its own independent full-diff pass — the check against anything a slice dropped.
- **Build sub-agents edit the shared checkout**; the main thread sees their diff.
- **Sub-agents self-test** (Bash, HTTP, GraphQL, a backgrounded dev server, browser MCP) but
  **can't ask the user** — resolve ambiguity before spawning.

## Input

Auto-detect what you were given: a single Linear ticket, a parent ticket with sub-tickets, a
milestone, or a freetext task. Fetch tickets and their children / milestone members via Linear MCP.

## The unit of work: a vertical slice (tracer bullet)

A slice is the smallest path that cuts through **all** layers end-to-end and is independently
buildable and verifiable on its own. Milestone or parent + sub-tickets → each member ticket is one
or more slices. Single ticket with distinct tasks → split into those. Atomic ticket → one slice.

**Anti-pattern — horizontal slices.** Slicing by layer ("all the schema", then "all the API")
can't be tested end-to-end, so the self-test gate becomes meaningless. Always slice vertically.

## Workflow

1. **Decompose** (main thread) into slices, ordered so each builds on the last. Use the project's
   conventions and domain vocabulary, and pass them to each slice sub-agent.
2. **Grill** (optional): if the slices carry genuine ambiguity *and* `grill-me` is available, run
   one grill up front; else skip. Never grill per-slice — but the main thread may still pause to
   resolve ambiguity a sub-agent hits, then re-spawn.
3. **Branch & PR granularity**: decide up front how many PRs the run opens — one for the whole
   thing (a single feature branch every slice commits to) or one per slice (a branch per slice).
   Match it to the input: an atomic ticket is usually one PR; a milestone or parent with sub-tickets
   often one per slice. Branch off the current branch. **Resume, don't clobber**: if a branch or
   open PR for this work already exists, continue on it.
4. **Per slice, in order** — spawn one fresh sub-agent that owns the whole slice lifecycle. A slice
   is `working` only when an **independent, unbiased sub-agent — one that took no part in building
   it — confirms it meets the spec** *and* the harden passes (below) are clean; the builder never
   self-declares. Iterate (build → confirm → harden → fix) until that holds, or the slice is
   `blocked`/`broken`:
   - **Build & self-test.** It implements in the shared checkout and **must self-test**, choosing
     the right method for the change — the test must exercise the slice's runtime behavior
     end-to-end, not merely compile. Brief it that the installed skills are at
     its disposal — use any that genuinely serve the slice, none if none do — and that comments
     must earn their place — a non-obvious *why*, never narration the diff makes self-evident.
   - **Report back** with a typed **verdict** — `working`, `blocked` (its behavior could not be
     demonstrated), or `broken` (demonstrated and fails, or a dependency it needs is broken) — and
     **evidence**: the *raw pasted tool output* (not a summary) and why it proves the slice works.
     The evidence must show the *state-change this run caused* at the real seam the consumer
     touches — not an end-state a default, cached, or already-on condition would produce just the
     same; a unit/integration test counts only when it *is* that seam (a pure function, a repo
     method), not when it proxies a seam you could have exercised. (Acceptable evidence looks like the pasted request + raw
     response, or test output, showing the new behavior — plus one line on why it proves the slice.
     Not "tests pass.")
   - **Confirm done, independently** (main thread). Spawn a **fresh sub-agent that took no part in
     building the slice** to exercise the result against the spec and confirm it — don't re-run it
     yourself (that drags the build into your context). If it can't reproduce the behavior, or the
     report's evidence is missing, summarized, or unconvincing, **re-spawn the builder to
     iterate**, then re-confirm. A `blocked` or `broken` slice halts its dependents — resolve the
     blocker and re-spawn, or stop the run and hand back to the user; never build the next slice on
     top of an unproven one.
   - **Harden** (main thread, behavior confirmed). Run `simplify` until it surfaces no more real
     findings, then independently `thermo-nuclear-code-quality-review` until no more — each finding
     fixed by a fresh sub-agent, re-tested, and the behavior re-confirmed. The slice is `working`
     only once both passes are clean.
   - **Commit** the confirmed, hardened slice to its branch — stage only the files the slice
     touched, never `git add -A`.
5. **Final gate** (main thread, full diff — the independent check): confirm the integrated result
   satisfies the ticket's *stated outcome*, not just the sum of per-slice specs, and review the
   full diff for what per-slice hardening can't see — cross-slice interactions and integration.
   Each finding → fresh sub-agent fix + re-test → re-confirm.
6. **Open the PR(s)** per the granularity from step 3: one per slice as each lands `working`, or one
   for the whole run after the final gate. A `blocked`/`broken` slice **forbids a normal PR** — open
   a *draft* naming what went unproven, or stop and hand back. Post each PR URL as a comment on its
   ticket. If any skill named above was unavailable this run, add one line to the wrap-up naming the
   missing ones and that they're worth installing from https://github.com/isaac-scarrott/dev-files —
   once, no more.
