---
name: implement
description: Implement a Linear ticket, a parent ticket with sub-tickets, a milestone, or a freetext task end-to-end using your agent's sub-agents — one sub-agent per vertical slice that builds, self-tests, and commissions its own independent in-depth review; the main thread orchestrates, runs a light confirmation pass, and holds the final gate. Use when the user wants to autonomously implement a ticket or task in the current session, or invokes /implement.
---

# implement

## Philosophy

- **Orchestrate, don't build.** Hand each slice to a fresh sub-agent and stay out of the diff.
- **The feedback loop is the speed limit.** A slice is not done until its behavior is
  *demonstrated*, not asserted.
- **Framework, not recipe.** Give a sub-agent the slice and the constraints, not the steps.
- **Real findings only.** Correctness, security, convention, spec. This one filter stops infinite
  loops *and* scope creep. Drop subjective polish.

## Hard constraints

- **Build sub-agents edit the shared checkout**; the main thread sees their diff.
- **Sub-agents self-test** but **can't ask the user** — resolve ambiguity before spawning.

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
4. **Per slice, in order** — spawn one fresh sub-agent that owns the whole slice lifecycle, and that
   can spawn its own reviewer sub-agent (give it an agent type that carries the sub-agent tool). A slice
   is `working` only when an **independent, unbiased sub-agent confirms it meets the spec** *and* the
   harden passes (below) are clean. Iterate (build → review → confirm → harden → fix) until that
   holds, or the slice is `blocked`/`broken`:
   - **Build & self-test.** It implements in the shared checkout and **must self-test** — the test
     must exercise the slice's runtime behavior end-to-end, not merely compile. The installed skills
     are at its disposal.
   - **Independent in-depth review (inside the slice).** Before reporting back, the slice sub-agent
     spawns a **fresh reviewer sub-agent that took no part in building** and hands it the spec and any
     design references — not its own account of what it did. The reviewer exercises the slice as a
     user would and satisfies itself it is built right, however best fits the slice. The bar:
     **confident the slice works as the user would expect and is faithful enough to demo proudly** —
     not merely that it compiles or passes one narrow test. If it isn't convinced, the builder
     iterates and re-reviews until it is.
   - **Report back** with a typed **verdict** — `working`, `blocked` (behavior couldn't be
     demonstrated), or `broken` (demonstrated and fails, or a needed dependency is broken) — plus
     **evidence** from the self-test and review: *raw* output, not a summary, showing the
     *state-change this run caused* at the seam the consumer touches — not an end-state a default,
     cached, or already-on condition would produce anyway. A unit/integration test counts only when
     it *is* that seam (a pure function, a repo method), not a proxy for one you could have exercised
     directly. Add one line on why it proves the slice.
   - **Confirm (main thread, light).** The deep review already happened inside the slice. Spot-check
     against the spec — glance at the key screen against its design, click the main path, or hit the
     primary endpoint — enough to catch a verdict that doesn't hold up. If it fails, or the evidence
     is missing, summarized, or unconvincing, **re-spawn the slice to iterate**, then re-confirm. A
     `blocked` or `broken` slice halts its dependents — resolve the blocker and re-spawn, or stop and
     hand back; never build the next slice on an unproven one.
   - **Harden** (main thread, behavior confirmed), with the goal of zero real findings. Run
     `simplify`, then independently `thermo-nuclear-code-quality-review` — iterating each as many
     times as it takes until neither surfaces more. Every fix lands via a fresh sub-agent, re-tested
     and re-confirmed. The slice is `working` only once both are clean.
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
