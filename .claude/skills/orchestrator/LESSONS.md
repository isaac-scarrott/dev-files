# Lessons

Judgement calls that proved their worth.

## Taking work in

- **Organise a batch before acting.** Group the items by area and file ownership into as few builders as won't collide. Show the grouping as a short table, so the user can see where each item went.
- **Research, propose, then build** when the user asks for a proposal, or when the design has real options (storage, data contracts, APIs). Deliver the proposal with its reasons, what it replaces, and the open decisions. Build only once those decisions are made.
- **Parity means parity.** "Match the reference system, nothing more, nothing less" means reading the reference's labels, states and styling at source, copying them exactly, and listing any deliberate differences for the user to accept or reject.

## Design work

- **One pass, then the user looks.** A design gets one pass and goes to the user. Run a critique loop only when they ask for one; unprompted rounds drift toward clever and away from what was asked.
- **A design stays a design until the user says build.** It reaches a builder, an implementor or a PR on the user's word, never your judgement.
- **States come from the product's own fixtures.** Before drawing or hand-building a state, look for the harness, storybook or fixture that renders it, and capture that.

## Landing stacks

- **Restack ahead of the merge.** Rebase each child onto its parent's new head as soon as that head exists, rather than waiting for the parent to merge. Then the child can queue the moment its parent lands.
- **Prove "known" before you say it.** A failure that also fails on trunk, or on the PR's base, is known. One you haven't checked is "unclassified". Checking out the old head in a spare worktree and running the one failing test is usually a few minutes, and saves the merger from asking.
- **Hooks are checks.** A push that skips hooks (`--no-verify`) skips the formatter and linter too, and CI fails on them after the merge queue has already moved on. Run the formatter on the touched files first, or push with hooks on.
- **A retarget isn't a push.** On repos whose CI triggers only on opened/synchronize, a stacked PR retargeted to trunk runs no checks and sits BLOCKED. Push to it, or run `gh pr update-branch`.

## Working with the user

- **Start what needs no decision.** Stack on open PRs, run research in parallel and fix known-wrong things while merges and answers are pending. Ask only the decisions that change what gets built.
- **Size the effort to the ask.** "Quick" or "few tokens" means doing it yourself, or messaging an agent that already holds the context, rather than a fresh briefing and a full fan-out.
- **Estimate honestly.** Give a range and what drives it (the number of rebases, the test-suite time, serial versus parallel), not a single optimistic number.
- **Apply a new rule from the next unit of work** when retrofitting it would break working layers, and say which layers you left.
- **Offer an easy way to change course.** When a new instruction arrives mid-flight, restate the adjusted plan in a line, including what is paused and what continues.

- **Look at a builder's artefact yourself before showing the user.** A report or page a sub-agent produced is a claim until you have opened it: check every picture and every comparison, not just the summary. Showing an unchecked report cost the user's trust in the tool (11 Oct 2026, page-diagnose).
- **A sub-agent does not inherit the user's permission.** When the user approves a blocked write in the main session, the sub-agent is still blocked. Have the sub-agent prepare the change as a plan file (read-only), and apply it from the main session.
- **Feedback on an output is feedback on the tool.** When the user corrects a report, a frame or a brief, put the correction where the next run will read it (the skill, its code, the repo's design doc) in the same turn, and say where it went.

## Pricing the plan

- **Price every gate before fanning out.** Find how each check runs (CI job, local Docker run, a label that records) and what one pass costs, multiply by the number of PRs, and say the total with the plan. Nine PRs with a 50-minute recording and a 25-minute CI wait each is a day; one PR is two hours.
- **One PR for one coherent change** unless a split buys something named: an independent merge, a separate deploy, a different reviewer. A stack whose children get no CI until their parent lands buys none of these.
- **Never start a builder on a branch that is not pushed.** Work built on a stand-in base is moved twice.
- **Evidence and baselines happen once, after the independent verifier has passed the whole change.** Captured earlier, they are captured again.
- **Before sending ready-for-merge, run the PR's own checks against today's trunk.** A generated list (a baseline, a snapshot, a manifest) made days ago is stale; merging it turns trunk red for everyone.
- **A builder's "nothing else changed" is a claim about what it looked at.** Ask for the check to cover every page or state, and for the comparison to be a test in the PR, not a one-off script.
- **Give every builder its own named scratch folder and have it stop only the processes it started, by pid.** A shared scratch root gets files overwritten; `pkill` by pattern stops other sessions' work.
- **Name the commands that write outside the machine in the brief** (a translation sync, a deploy, a label that triggers a bot) and forbid each unless the user approved it. A builder treats "the repo's mandated step" as permission.
