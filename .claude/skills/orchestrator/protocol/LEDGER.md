# The ledger

A table of the current state of every piece of work in flight, shared by all sessions on one repo. It shows who holds the baton, what the head is, and where each PR stands. It holds state, not history: rows are overwritten in place, and a merged PR's row is deleted once its deploy has been reported.

## Location

`$(git rev-parse --git-common-dir)/orchestration/ledger.md`

It lives in the repo's common `.git` directory, so every worktree and every session sees the same file, and it's never committed. `scripts/ledger.py` reads and writes it. Use the script rather than editing by hand, so two sessions can't interleave half-written rows.

The `orchestration-view` mod draws this file as a pane, so what you record here is what the owner sees without asking.

## Format

```text
| pr | holder | head | base | state | owner | note | what | since |
|---|---|---|---|---|---|---|---|---|
| 6861 | merger | 740d210e6a | master | queued | approved (merger, 11:01) | after #6847 | Lift tracking banner | 2026-10-11T11:55 |
| payments-retry | orchestrator |  |  | planned |  | needs a data contract first | Retry failed payments | 2026-10-11T10:00 |
```

- **pr**: the PR number, or a slug for work that has no PR yet (a planned item, a parked idea).
- **holder**: `orchestrator`, `merger`, or another session's name, such as a builder that owns a branch.
- **state**: one of
  - `planned` — agreed, not started.
  - `building`, `draft`, `changes` — a builder is on it.
  - `input` — stopped until the owner answers; put the question in `note`.
  - `review` — with the merger. It counts as the owner's until the `owner` column opens with a verdict
    (`approved`, `standing`, `ship`), so a routing note such as "owner merges" leaves it under NEEDS YOU.
  - `ready`, `queued`, `merged`, `deploying` — on its way in.
  - `held`, `blocked` — parked: open, deliberately not moving. Why, in `note`.
  - `landed`, `closed` — over. The pane lists these for four hours after `since`, then counts them at its foot.
    A row whose deploy has been reported is dropped, so a ledger full of landed rows is a teardown that didn't happen.
- **owner**: the owner's latest verdict, with the session it was given in.
- **what**: the change in a few words, for whoever reads the row without the PR open.
- **since**: when the row last changed state. `ledger.py` stamps it, so nobody has to.

## The merger's row

The merger announces itself in a row keyed `merger`: `holder` is its session name (the name peers address it by), `state` is `active`, and `note` carries `seen <UTC time>`. It writes the row when it starts, rewrites `holder` after every restart (peer names are re-derived each run; the SessionStart hook `scripts/session-start.sh` prints the new one and the command), and refreshes `note` on every ready-for-merge it acts on. Orchestrators find the merger here, not through `ListAgents`. A `seen` older than an hour while ready-for-merge messages go unanswered means the merger may be gone: tell the owner rather than guess a replacement.

## Decisions

Standing rules the owner sets, such as "be proactive" or "never queue at night", go under a `## Decisions` heading at the foot of the same file. Each is one line with a date. Keep them to rules that still apply, and remove any the owner withdraws.
