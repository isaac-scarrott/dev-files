---
name: implement-light
description: Implement a Linear ticket or freetext task end-to-end using Claude's built-in sub-agents — one self-testing sub-agent per vertical slice, main-thread review between slices, one PR. Use when the user wants to autonomously implement a ticket or task in the current session with built-in sub-agents, or invokes /implement-light.
---

# implement-light

Implement one ticket at a time with built-in sub-agents. The main thread orchestrates; sub-agents
do the building, so the heavy build transcripts stay out of your context (review findings still
land in it).

This is the native replacement for the older `claude -p` orchestrators (`implement-ticket.sh`,
`implement-ticket-folder.sh`) — same build→review→ship shape, run from inside a Claude session
with zero setup. Run it once per ticket.

## Philosophy

- **Orchestrate, don't build.** Hand each slice to a fresh sub-agent and stay out of the diff.
- **The feedback loop is the speed limit.** A slice is not done until its behavior is
  *demonstrated*, not asserted — self-test evidence is the gate, every time.
- **Framework, not recipe.** Give a sub-agent the slice and the constraints, not the steps.
- **Real findings only.** Correctness, security, convention, spec. This one filter stops infinite
  loops *and* scope creep. Drop subjective polish.

## Hard constraints

- **Sub-agents currently can't spawn sub-agents** — so `simplify`, `jedi-council`, and
  `thermo-nuclear-code-quality-review` all run from the main thread.
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
   conventions and domain vocabulary, and pass them to each build sub-agent.
2. **Grill** (optional): if the slices carry genuine ambiguity *and* `grill-me` is installed, run
   one grill up front; else skip. Never grill per-slice — but the main thread may still pause to
   resolve ambiguity a sub-agent hits, then re-spawn.
3. **Branch**: one feature branch for the ticket, branched off the current branch. One PR at the
   end; every slice's sub-agent commits to this branch.
4. **Per slice, in order:**
   - **Build** — spawn a fresh sub-agent. It implements in the shared checkout and **must
     self-test before returning**, choosing the right method for the change — the test must
     exercise the slice's runtime behavior end-to-end, not merely compile. It returns **evidence**:
     the *raw pasted tool output* (not a summary) and why it proves the slice works. If the
     evidence is missing, summarized, or unconvincing, re-run the command yourself or re-spawn —
     do not proceed. (Acceptable evidence looks like the pasted request + raw response, or test
     output, showing the new behavior — plus one line on why it proves the slice. Not "tests pass.")
   - **Simplify** — run the `simplify` skill (main thread) on the slice's diff.
   - **Review** — run `jedi-council` (main thread) on the slice's diff.
   - **Refine** — keep only real findings; if any, **spawn a fresh sub-agent** with the diff and
     the findings to fix and re-test (same evidence bar), then re-review. Stop at zero real
     findings or after **3 rounds** — then surface the remainder to the user and continue.
   - **Commit** the slice to the ticket branch.
5. **Final gate** (main thread, full diff): `thermo-nuclear-code-quality-review` if installed, else
   `code-review` + `jedi-council`. Real findings → fresh sub-agent fix + re-test → re-run. Same
   filter and 3-round cap.
6. **Open one PR** for the ticket once the gate is clean (or capped, with remainder noted).
