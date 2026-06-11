---
name: implement
description: Implement a Linear ticket or freetext task end-to-end using your agent's sub-agents — one self-managing sub-agent per vertical slice that builds, self-tests, and runs its own nested review loop; the main thread orchestrates and holds an independent final gate; one PR. Use when the user wants to autonomously implement a ticket or task in the current session, or invokes /implement.
---

# implement

Implement one ticket at a time. The main thread orchestrates; one sub-agent per slice does the
building *and* its own reviewing, so build transcripts and per-slice findings stay out of your
context.

This is the native replacement for the older headless CLI orchestrators (`implement-ticket.sh`,
`implement-ticket-folder.sh`) — same build→review→ship shape, run from inside an interactive
agent session with zero setup. Run it once per ticket.

## Philosophy

- **Orchestrate, don't build.** Hand each slice to a fresh sub-agent and stay out of the diff.
- **The feedback loop is the speed limit.** A slice is not done until its behavior is
  *demonstrated*, not asserted — self-test evidence is the gate, every time.
- **Framework, not recipe.** Give a sub-agent the slice and the constraints, not the steps.
- **Real findings only.** Correctness, security, convention, spec. This one filter stops infinite
  loops *and* scope creep. Drop subjective polish.

## Hard constraints

- **Slice sub-agents review their own work by spawning nested sub-agents.** Where sub-agents
  can't spawn sub-agents, fall back: the main thread reviews each slice's diff between slices,
  by whatever means it has.
- **The final gate never delegates.** A slice agent summarizes its own findings on the way back
  to you; the independent full-diff review at the end is the check against anything it dropped.
- **Build sub-agents edit the shared checkout** (no worktree isolation); the main thread sees
  their diff.
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
2. **Grill** (optional): if the slices carry genuine ambiguity *and* `grill-me` is installed, run
   one grill up front; else skip. Never grill per-slice — but the main thread may still pause to
   resolve ambiguity a sub-agent hits, then re-spawn.
3. **Branch**: one feature branch for the ticket, branched off the current branch. One PR at the
   end; every slice's sub-agent commits to this branch. **Resume, don't clobber**: if a branch or
   open PR for this ticket already exists, continue on it.
4. **Per slice, in order** — spawn one fresh sub-agent that owns the whole slice lifecycle:
   - **Build & self-test.** It implements in the shared checkout and **must self-test before
     reviewing**, choosing the right method for the change — the test must exercise the slice's
     runtime behavior end-to-end, not merely compile. Brief it that comments must earn their
     place — a non-obvious *why*, never narration the diff makes self-evident.
   - **Review its own diff.** Run `jedi-council` on the slice's diff if available (findings
     only — no HTML report); else review the diff by whatever means it has. It self-iterates,
     judging pragmatically what the slice needs — simplicity and meeting the spec, nothing more,
     nothing less. Keep only real findings, fix and re-test, converging at zero real findings or
     after **3 rounds** — surfacing any remainder in its report.
   - **Commit** the slice to the ticket branch — stage only the files the slice touched, never
     `git add -A`.
   - **Report back** with **evidence**: the *raw pasted tool output* (not a summary) and why it
     proves the slice works, plus a short review log — angles chosen, findings, fixed vs.
     surfaced. (Acceptable evidence looks like the pasted request + raw response, or test output,
     showing the new behavior — plus one line on why it proves the slice. Not "tests pass.")
   - **Verify the report** (main thread). If the evidence is missing, summarized, or
     unconvincing, **re-spawn and demand raw output** — don't re-run the command yourself (that
     drags the build into your context); do not proceed.
5. **Final gate** (main thread, full diff — the independent check): run `simplify`, then
   `thermo-nuclear-code-quality-review` if installed, else review the full diff by whatever
   means the agent has. Real findings → fresh sub-agent fix + re-test → re-run. Same filter and
   3-round cap — then surface the remainder to the user and continue.
6. **Open one PR** for the ticket once the gate is clean (or capped, with remainder noted). If
   the input was a Linear ticket, post the PR URL as a comment on it.
