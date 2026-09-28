# The ledger

A table of the current state of every open PR, shared by all sessions on one repo. It shows who holds the baton, what the head is, and where each PR stands. It holds state, not history: rows are overwritten in place, and a merged PR's row is deleted once its deploy has been reported.

## Location

`$(git rev-parse --git-common-dir)/orchestration/ledger.md`

It lives in the repo's common `.git` directory, so every worktree and every session sees the same file, and it's never committed. `scripts/ledger.sh` reads and writes it. Use the script rather than editing by hand, so two sessions can't interleave half-written rows.

## Format

```text
| pr | holder | head | base | state | owner | note |
|---|---|---|---|---|---|---|
| 6861 | merger | 740d210e6a | master | queued | approved (merger, 11:01) | after #6847 |
```

- **holder**: `orchestrator`, `merger`, or another session's name, such as a builder that owns a branch.
- **state**: `building`, `ready`, `review`, `queued`, `merged`, `deploying`, `held`, or `changes`.
- **owner**: the owner's latest verdict, with the session it was given in.

## Decisions

Standing rules the owner sets, such as "be proactive" or "never queue at night", go under a `## Decisions` heading at the foot of the same file. Each is one line with a date. Keep them to rules that still apply, and remove any the owner withdraws.
