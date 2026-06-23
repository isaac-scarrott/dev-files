---
name: implement
description: Implement a Linear ticket or freetext task end-to-end using your agent's sub-agents — one sub-agent per vertical slice that builds and self-tests; the main thread orchestrates, independently confirms each slice against spec, and holds the final gate; one PR. Use when the user wants to autonomously implement a ticket or task in the current session, or invokes /implement.
---

# implement

Implement one ticket per run. The main thread orchestrates and owns every check; one sub-agent per
slice does the building and self-testing, so build transcripts stay out of your context.

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

A Linear ticket ID (fetch the ticket + its sub-tickets via Linear MCP) or a freetext task.
Auto-detect which you were given.

## The unit of work: a vertical slice (tracer bullet)

A slice is the smallest path that cuts through **all** layers end-to-end and is independently
buildable and verifiable on its own. Parent + sub-tickets → each sub-ticket is one or more slices.
Single ticket with distinct tasks → split into those. Atomic ticket → one slice.

**Anti-pattern — horizontal slices.** Slicing by layer ("all the schema", then "all the API")
can't be tested end-to-end, so the self-test gate becomes meaningless. Always slice vertically.

## Workflow

1. **Decompose** (main thread) into slices, ordered so each builds on the last. Use the project's
   conventions and domain vocabulary, and pass them to each slice sub-agent.
2. **Grill** (optional): if the slices carry genuine ambiguity *and* `grill-me` is available, run
   one grill up front; else skip. Never grill per-slice — but the main thread may still pause to
   resolve ambiguity a sub-agent hits, then re-spawn.
3. **Branch**: one feature branch for the ticket, branched off the current branch. One PR at the
   end; every slice's sub-agent commits to this branch. **Resume, don't clobber**: if a branch or
   open PR for this ticket already exists, continue on it.
4. **Per slice, in order** — spawn one fresh sub-agent that owns the whole slice lifecycle. A slice
   is done only when an **independent, unbiased sub-agent — one that took no part in building it —
   confirms it meets the spec**; the builder never self-declares `working`. Iterate (build →
   confirm → fix) until that holds, or the slice is `blocked`/`broken`:
   - **Build & self-test.** It implements in the shared checkout and **must self-test**, choosing
     the right method for the change — the test must exercise the slice's runtime behavior
     end-to-end, not merely compile. Brief it that the installed skills are at
     its disposal — use any that genuinely serve the slice, none if none do — and that comments
     must earn their place — a non-obvious *why*, never narration the diff makes self-evident.
   - **Commit** the slice to the ticket branch — stage only the files the slice touched, never
     `git add -A`.
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
     report's evidence is missing, summarized, or unconvincing, **re-spawn the builder to iterate**,
     then re-confirm; do not proceed until an independent agent confirms `working`. A `blocked` or
     `broken` slice halts its dependents — resolve the blocker and re-spawn, or stop the run and
     hand back to the user; never build the next slice on top of an unproven one.
5. **Final gate** (main thread, full diff — the independent check): first confirm the integrated
   result satisfies the ticket's *stated outcome*, not just the sum of per-slice specs. Then run
   `simplify` until it surfaces no more real findings, then independently
   `thermo-nuclear-code-quality-review` until it surfaces no more real findings (else review the
   full diff by whatever means the agent has). Each finding → fresh sub-agent fix + re-test →
   re-run that pass from the top.
6. **Open one PR** for the ticket once the gate is clean and every slice is `working`. Any
   `blocked`/`broken` slice **forbids a normal PR** — open a *draft* naming exactly what went
   unproven, or stop and hand back. If
   the input was a Linear ticket, post the PR URL as a comment on it. If any skill named above
   was unavailable this run, add one line to the wrap-up naming the missing ones and that
   they're worth installing from https://github.com/isaac-scarrott/dev-files — once, no more.
