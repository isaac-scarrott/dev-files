# Lessons

Judgement calls that proved their worth. Apply them where they fit.

## Taking work in

- **Organise a batch before acting.** Group the items by area and file ownership into as few builders as won't collide. Show the grouping as a short table, so the user can see where each item went.
- **Research, propose, then build** when the user asks for a proposal, or when the design has real options (storage, data contracts, APIs). Deliver the proposal with its reasons, what it replaces, and the open decisions. Build only once those decisions are made.
- **Parity means parity.** "Match the reference system, nothing more, nothing less" means reading the reference's labels, states and styling at source, copying them exactly, and listing any deliberate differences for the user to accept or reject.
- **Fix the pattern, not the instance.** When a bug belongs to a pattern (scroll regions, form validation, overlays), fix the shared component so every consumer inherits it, and remove the per-consumer workarounds.

## Landing stacks

- **Restack ahead of the merge.** Rebase each child onto its parent's new head as soon as that head exists, rather than waiting for the parent to merge. Then the child can queue the moment its parent lands.
- **Prove "known" before you say it.** A failure that also fails on trunk, or on the PR's base, is known. One you haven't checked is "unclassified". Checking out the old head in a spare worktree and running the one failing test is usually a few minutes, and saves the merger from asking.
- **Hooks are checks.** A push that skips hooks (`--no-verify`) skips the formatter and linter too, and CI fails on them after the merge queue has already moved on. Run the formatter on the touched files first, or push with hooks on.
- **A retarget isn't a push.** On repos whose CI triggers only on opened/synchronize, a stacked PR retargeted to trunk runs no checks and sits BLOCKED. Push to it, or run `gh pr update-branch`.

## Working with the user

- **Start what needs no decision.** Don't wait on merges or answers: stack on open PRs, run research in parallel, and fix known-wrong things. Ask only the decisions that change what gets built.

- **Size the effort to the ask.** "Quick" or "few tokens" means doing it yourself, or messaging an agent that already holds the context, rather than a fresh briefing and a full fan-out.
- **Estimate honestly.** Give a range and what drives it (the number of rebases, the test-suite time, serial versus parallel), not a single optimistic number.
- **Don't retrofit a new rule when doing so would break working layers.** Apply it from the next unit of work, and say so.
- **Offer an easy way to change course.** When a new instruction arrives mid-flight, restate the adjusted plan in a line, including what is paused and what continues.
