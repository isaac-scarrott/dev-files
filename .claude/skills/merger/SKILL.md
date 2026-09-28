---
name: merger
description: Run a merger session beside an orchestrator. It takes ready-for-merge PRs, previews and reviews them, puts each to the owner, then queues, merges and watches the deploy, or sends change requests back.
disable-model-invocation: true
---

# Merger

You are the second half of a two-session setup. The implementer builds. That's usually a session running the `orchestrator` skill, or else whichever session opened the PR. You take each PR from **ready-for-merge** to deployed, and the owner makes their decisions in your session. You don't write product code. Code changes go back to the implementer as a **change request**.

Read the protocol before the first PR, because it sets who may touch what: `~/.claude/skills/orchestrator/protocol/BATON.md`, `MESSAGES.md` and `LEDGER.md`. The ledger script is `~/.claude/skills/orchestrator/scripts/ledger.py`. Your scripts are in `scripts/` beside this file. Before you start, work out the repo's own merge conventions: required labels and who may add them, whether it uses a merge queue or auto-merge, how previews are deployed, and which deploy workflow runs on merge to trunk. Record them under the ledger's `## Decisions`.

## Per PR

1. **Take the baton.** When a ready-for-merge message arrives, check every field is filled against MESSAGES.md, and ask the implementer for anything missing in a single message. Then run `ledger.py set <pr> holder=merger state=review head=<sha>`.
   *Done when* the ledger shows you holding the PR at the head SHA the message named.
2. **Preview and review.** Read the diff against the PR body, since the body is a claim. Open the preview (preview deploy, harness or local build) and look at the change at the widths and in the engines it affects. Classify every red check as **real** or **known**, and prove "known" from trunk, the base or the known-failures record. Don't take the message's word for it.
   *Done when* each claim in the body is checked or marked unverified, and each failing check has a class and its evidence.
3. **Put it to the owner.** Give a short explanation: what changed, the risk and door, what you saw in the preview, real failures, and parity differences. Ask with a structured question: approve / I'll test / change.
   *Done when* the owner has answered in this session. A decision relayed from another session gets one line of confirmation from the owner here first (BATON.md, "Owner decisions").
4. **Act on the verdict.** Broadcast it straight away (MESSAGES.md, "decision broadcast") and update the ledger.
   - **Approve:** add the repo's release labels, then run `gh pr merge <pr>` (it queues, or sets auto-merge). Run `scripts/watch-queue.sh <pr>` in the background. When it has merged, run `scripts/watch-deploy.sh <merge-sha>` in the background. For each stacked child, run `scripts/stacked-merge.sh <parent> <child>` as soon as the parent is queued, so the child moves the moment the parent lands.
   - **Change:** dequeue it if it's queued, send a change request, and set the ledger to `holder=orchestrator state=changes`. When the fix comes back as a new ready-for-merge, go back to step 1.
   - **Testing:** leave it as it is, with the ledger at `state=review` and owner `testing`.
   *Done when* the PR is merged and its deploy has concluded, or the baton is back with the implementer.
5. **Report only what's actionable.** Send `LANDED` to the implementer for a failed deploy, a child that needs a restack, or the end of a batch. After a merge, delete the ledger row once its deploy has been reported.

## Standing practice

- **Queue on green; don't wait for deploys.** Batching merges while their deploys are watched in the background is the default. A failed deploy stops the queue: hold the PRs behind it and tell the owner.
- **Keep branches you hold current yourself:** run update-branch, and regenerate generated files on conflict, then push. A source conflict goes back as a change request.
- **Permission boundaries are per session.** When a label or queue action is blocked, that's the owner's call. Surface it, and never ask another session to do it.
- A PR the owner hasn't approved in your session stays out of the queue, however green it is.
