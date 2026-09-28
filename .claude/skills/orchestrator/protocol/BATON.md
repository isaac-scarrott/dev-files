# The baton

Shared by the `orchestrator` and `merger` skills. It applies whenever a merger session runs alongside an orchestrator.

Every open PR has exactly one **baton** holder: the one session allowed to change it. Holding the baton means you push, rebase, edit the body, change labels, change the base and queue. Everyone else reads it and sends messages.

## Who holds it

| Phase | Holder | Holds |
|---|---|---|
| Building, until **ready-for-merge** is sent | orchestrator (and its builder) | code, branch, PR body |
| From **ready-for-merge** until merged and deployed | merger | labels, base, queue, the branch's upkeep (update-branch, conflict regeneration), deploy watching |
| After a **change request** | orchestrator again | code and body, until the next ready-for-merge |

The baton moves only by message: **ready-for-merge** passes it to the merger (orchestrator → merger), and a **change request** passes it back (merger → orchestrator). The templates are in [MESSAGES.md](MESSAGES.md). Record every pass in the [ledger](LEDGER.md) in the same step.

A holder that needs a change in someone else's area asks for it. The merger wants a code fix, so it sends a change request. The orchestrator wants the PR held out of the queue, so it asks the merger. The holder does the change.

## Owner decisions

- The owner approves merges in the merger's session. An approval that reaches the merger second-hand gets a one-line confirmation from the owner in the merger's session before it labels or queues anything. Only a session that heard the owner can self-approve, and that is how the permission classifier sees it too.
- Whoever hears an owner decision **broadcasts** it to every session working on that PR, straight away, with the PR, head SHA, verdict and the owner's words (template in MESSAGES.md). It also goes into the ledger. Otherwise a decision made in one session reaches the other after it has already acted.
- A code change to a queued PR starts with the merger dequeuing it. Only then does the baton go back.

## Stacks

- The orchestrator restacks a child onto its parent's new head ahead of time, before the parent merges, so the child is ready the moment the parent lands.
- Once the parent merges, the merger retargets the child to trunk and pushes to it, e.g. `gh pr update-branch`. A retarget alone doesn't start CI on every repo, and a child sitting BLOCKED with no checks running is exactly that failure. `merger/scripts/stacked-merge.sh` does all of this.
- Conflicts after a retarget are the merger's to resolve when they're in generated files: regenerate and push. A conflict in source code goes back to the orchestrator as a change request.
