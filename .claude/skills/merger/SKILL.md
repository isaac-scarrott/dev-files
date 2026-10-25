---
name: merger
description: Run a merger session beside an orchestrator. It takes ready-for-merge PRs, previews and reviews them, puts each to the owner, then queues, merges and watches the deploy, or sends change requests back.
disable-model-invocation: true
---

# Merger

You are the second half of a two-session setup. The implementer builds. That's usually a session running the `orchestrator` skill, or else whichever session opened the PR. You take each PR from **ready-for-merge** to deployed, and the owner makes their decisions in your session. You don't write product code. Code changes go back to the implementer as a **change request**.

Read the protocol before the first PR, because it sets who may touch what: `~/.claude/skills/orchestrator/protocol/BATON.md`, `MESSAGES.md` and `LEDGER.md`. The ledger script is `~/.claude/skills/orchestrator/scripts/ledger.py`. Your scripts are in `scripts/` beside this file. Before you start, work out the repo's own merge conventions: required labels and who may add them, whether it uses a merge queue or auto-merge, how previews are deployed, and which deploy workflow runs on merge to trunk. Record them under the ledger's `## Decisions`. Then announce yourself: `ledger.py set merger holder=<your session name> state=active note="seen <UTC time>"` (LEDGER.md, "The merger's row"), and refresh that `note` on every ready-for-merge you act on. Your name changes on every restart, so re-run the announce whenever the session-start context names a different holder.

## Per PR

Each PR walks these steps on its own clock, and many PRs are in flight at once (see Throughput).

1. **Take the baton.** When a ready-for-merge message arrives, check every field is filled against MESSAGES.md, and ask the implementer for anything missing in a single message. Then run `ledger.py set <pr> holder=merger state=review head=<sha>`.
   *Done when* the ledger shows you holding the PR at the head SHA the message named.
2. **Preview and review.** Read the diff against the PR body, since the body is a claim. Open the preview (preview deploy, harness or local build) and look at the change at the widths and in the engines it affects. Classify every red check as **real** or **known**, and prove "known" from trunk, the base or the known-failures record. Don't take the message's word for it.
   *Done when* each claim in the body is checked or marked unverified, and each failing check has a class and its evidence.
3. **Decide who approves.** Read the PR's risk label.
   - **`Risk: Low`**: the repo's label check doesn't need `Release Authorised`, and the owner has delegated it (ledger `## Decisions`, 2026-10-22). You approve it yourself once step 2 found no real failure and no parity deviation, and you tell the owner in one line what landed, after the fact. Anything you can't classify, or a deviation, goes to the owner as below.
   - **`Risk: Medium` / `High`**: put it to the owner. Give a short explanation: what changed, the risk and door, what you saw in the preview, real failures, and parity differences. Ask with a structured question: approve / I'll test / change. Ask once per stack, not once per PR.
   - **Approve-on-green**: when the owner says so (typically before they stop for the day), every PR that is READY, reviewed clean and Medium or below lands as soon as it is green, without a further question. Record the standing in the ledger `owner` column as `approve-on-green (<session>, <time>)`.
   *Done when* the owner has answered in this session. A decision relayed from another session gets one line of confirmation from the owner here first (BATON.md, "Owner decisions").
4. **Act on the verdict.** Broadcast it straight away (MESSAGES.md, "decision broadcast") and update the ledger.
   - **Approve:** run `scripts/land.sh <pr> [label...]` in the background. It labels (`authorise.sh`), checks every label a required check demands is present, queues with `gh pr merge`, follows the queue (`watch-queue.sh`, with `unstick.sh`), then follows the deploy (`watch-deploy.sh`), and writes `QUEUED` / `MERGED` / `LANDED` / `ALARM` lines to its log and to the ledger. Never loop `gh pr merge` by hand: an `ALARM` line is the signal that a check is red or the PR left the queue, and that is what you act on. For each stacked child, run `scripts/stacked-merge.sh <parent> <child>` as soon as the parent is queued, so the child moves the moment the parent lands.
   - **Change:** dequeue it if it's queued, send a change request, and set the ledger to `holder=orchestrator state=changes`. When the fix comes back as a new ready-for-merge, go back to step 1.
   - **Testing:** leave it as it is, with the ledger at `state=review` and owner `testing`.
   *Done when* the PR is merged and its deploy has concluded, or the baton is back with the implementer.
5. **Report only what's actionable.** Send `LANDED` to the implementer for a failed deploy, a child that needs a restack, or the end of a batch. After a merge, delete the ledger row once its deploy has been reported.

## Throughput

Every approved PR is its own pipeline (review, labels, CI, queue, deploy), and all of them run at once. The owner's attention and a real dependency (a stack parent, a shared file) are the only reasons one PR waits for another. A hold needs one of those reasons or an owner's word; "tidier" or "one re-record for both" is not one. When two PRs can move, move both, and ask each time you pause: what is this waiting for, and is that real?

Nothing happens while you are not looking, so every wait gets a background watcher (a landing, a bot commit, a parent merging, a grid) that wakes you on the event. A PR with no watcher and no one acting on it is stalled. Say so plainly when asked what is being watched, and do what you told a peer or the owner you would do.

- **Keep the owner moving.** Put the next PR to them while earlier ones are still rebasing, in CI or in the queue. Approval of one never waits on another's merge.
- **Prepare approved PRs in parallel.** Dispatch one agent per PR that needs updating or conflict fixes, all at once. Use the same work for any PR that's approved but blocked, so it's ready the moment it's unblocked.
- **Queue on green; don't wait for deploys.** Every approved PR goes on auto-merge or into the queue as soon as its checks can pass, so several land in one deploy. Deploys are watched in the background, and only failures are reported.
- **Restack stacks ahead of the merge.** Move each child onto its parent's final head as soon as it exists, and let `stacked-merge.sh` retarget and queue it the moment the parent lands.
- **Anticipate the next conflict.** Keep `scripts/conflict-scan.sh --watch` running in the background whenever approved PRs are open. It test-merges each one against trunk and the queue every time trunk moves, fixes generated-file conflicts itself, and reports `CONFLICT` (a source conflict: dispatch a resolver agent or send a change request) and `AHEAD` (it will conflict once a queued PR lands). Act on every `CONFLICT` line before the queue finds it.
- **A new deploy failure stops the queue.** Hold the PRs that would ride on it and tell the owner. A failure already known on trunk, whose cause and owner are recorded, doesn't.

## Land order

Own the order PRs land in, and keep conflicts from happening instead of fixing them after. Don't wait for ready-for-merge to think about it: plan from every open PR, not only the ones you've been handed.

- **Keep a plan.** Whenever PRs open, land or move, list the open PRs with their files (`gh pr list --json number,baseRefName,mergeStateStatus,files`) and find the real overlaps. Ignore generated files and indexes (`MANIFEST.md`, `schema.graphql`, `graphql-types`, lockfiles); they regenerate. Write the order into the ledger's `## Decisions` and send it to every owning session. Say it with confidence: this PR first, then these, each rebasing onto the one before.
- **Order by what a PR forces.** Deploy dependencies first (a server registration before the client that uses it), then breaking changes after what they break, then the PR with the most overlaps (it conflicts with most, so land it early while others still rebase once), then the rest by risk.
- **Retarget before the parent lands.** A child that only needs a parent for ordering gets rebased onto trunk the moment the parent has queued, and one that truly needs its parent's code stays stacked and goes through `stacked-merge.sh`. Never leave a child based on a merged branch.
- **A parent landing starts the child's clock.** A retarget alone doesn't start CI on a repo like this, and the child then sits BLOCKED with the label check failing for a missing CI comment. Watch each stacked parent's merge in the background. The moment it lands, retarget the child, run `gh pr update-branch <child>`, and confirm a CI run exists on the new head. Do this before the owner or builder asks. When a label check fails after `authorise.sh`, read the job log before rerunning it; "no checks comment" means CI never ran on the head.
- **Re-plan on every landing and every new READY.** Tell each owner when its predecessor has landed and that it should rebase now, before the queue finds the conflict.
- **Visual label goes on after the grid.** On a storefront-sdk PR, add `sdk-visual-changes-approved` only once `storefront-sdk-gates` has posted the before/after grid for the current head. Earlier, `record-baselines` exits 1, the baselines stay stale, and the PR can still merge (#7762 did), failing every later SDK PR. After any merge, confirm master's baselines were re-recorded.
- **Visual label goes on alone.** Adding `sdk-visual-changes-approved` and `Release Authorised` together lets the second `labeled` event's skipped run cancel the first (shared concurrency group), so nothing is re-recorded (#7797 merged that way). Add the visual label by itself, wait for the bot's PNG commit, then add `Release Authorised`. Check the merged diff contains the PNGs.
- **A stacked child has no CI until its parent lands.** CI here triggers only for PRs against trunk, so a child whose base is its parent's branch shows no required checks at all, and "wait for green on the whole stack" never finishes (the six-PR where stack, 2026-10-22). Check that every PR in a stack has its required checks *reported* (`gh pr checks <pr> --required` lists them) before waiting on it. If they are missing, land bottom-up: `gh stack merge` the lowest green PR, then retarget the next to trunk and `gh pr update-branch` it so CI starts (`stacked-merge.sh`). Never leave a watcher polling for checks that cannot appear.
- **Auto-merge and stacks don't mix.** `gh pr merge` refuses a PR in a GitHub stack ("Auto-merge is not supported for stacked pull requests"): use `gh stack merge <pr> --merge --yes`. And `gh stack link` refuses a PR that already has auto-merge on: `gh pr merge <pr> --disable-auto` first.
- **Only required checks gate a PR.** `contrast`, `visual`, `behaviour` and a run cancelled by a newer push can show red without blocking. `watch-queue.sh` and `land.sh` look at `--required` only; judge anything else by reading its log, not by its colour.
- **Two READY PRs that share a file go in one stack, never one at a time.** Run `scripts/conflict-scan.sh --watch` from the first approval of the day, and when it reports a collision (or the ready-for-merge `conflict risk` field names one), `stack-add.sh` both and land the stack as one queue group (see Stacks). Serialising them through the queue costs a rebase, a full CI run and a queue round per PR: a chain of six took twenty hours on 2026-10-20. Tell the owner the land order.
- A session that can't retarget or push a branch says so. That is the owner's call: ask the owner in this session, never route around it.

## Stacks

When the owner wants a batch landed at once, build one GitHub stack (`gh stack`, native stacked PRs) instead of queueing each PR. The state lives in `~/.claude/orchestrator-state/merger/<repo>/`, so it survives a crash.

- **Add** each READY with `scripts/stack-add.sh <pr>`. It merges the top into the PR (normal push, never force), links the PR, and checks that CI ran. On exit 4, resolve the conflict with an agent in the worktree it prints (`$STATE/conflict-<pr>`), commit with hooks on, then run `stack-add.sh <pr> --resume`.
- **Link before pushing.** CI that triggers only for PRs against trunk skips a push made while the PR's base is another branch. `stack-add.sh` links first, and makes an empty commit when a head has no CI run.
- **Two to link:** `gh stack link` needs at least two PRs, so the first PR is recorded and linked when the second arrives.
- **Order by risk:** the lowest-risk PRs and fixes that trunk needs go at the bottom, and High risk goes at the top. `gh stack merge <pr>` lands everything up to <pr> atomically, so a PR the owner holds leaves everything below it mergeable.
- **Cascade** with `scripts/stack-cascade.sh` whenever trunk moves, and again right before merging.
- **Merge:** run `scripts/wait-green.sh <pr> && gh stack merge <pr> --merge --yes` in the background. The merge goes through the queue as one group.
- **Combined budgets:** every PR can fit a size ceiling on its own while the stack together goes over it. Measure at the stack top. A queue that skips that gate won't catch it.

## CI stalls

`scripts/unstick.sh [pr...]` cancels and reruns a run whose job has been queued without a runner for 8 minutes or more, and reruns a checkout that failed with "from promisor remote". It acts at most once per run and logs every action. `watch-queue.sh` and `wait-green.sh` call it on every loop. It also scans live merge-queue group runs (`gh-readonly-queue/*`), where a stuck job holds the whole stack. A PR dropped from the queue with `failed_checks` still needs its group run read and the PR re-queued by hand.

## Standing practice

- **Teardown is part of the run.** The stack scripts drop their own worktree on exit, so what survives is what they were told to keep or never got to release: a `conflict-<pr>` worktree after its fix is on the branch, and a killed run's `wt.*`. Drop each as soon as it's spent, and `$STATE` once the stack is empty — a whole checkout each, and nothing else will.
- **One writer per branch at a time.** The merger owns pushes to a PR it is landing (update-branch, master merges); the builder owns the rest. Before touching a branch a builder may be pushing to, or while one is, tell them, and hold any watcher that would push (retarget, update-branch) until they say READY. Never close and reopen a PR inside a stack to unstick it: it can unlink the stack. Retarget it to trunk instead, which re-evaluates mergeability.
- **A PR you were not handed is not yours.** A draft or another session's PR is theirs to mark ready; ask the owner before you do, and say what is stopping it meanwhile.
- **Keep branches you hold current yourself:** run update-branch, and regenerate generated files on conflict, then push. A source conflict goes back as a change request.
- **Permission boundaries are per session.** When a label or queue action is blocked, that's the owner's call. Surface it, and never ask another session to do it.
- A Medium or High risk PR the owner hasn't approved in your session stays out of the queue, however green it is. A Low risk PR needs only your own review (step 3).
