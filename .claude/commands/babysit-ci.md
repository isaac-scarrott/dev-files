---
description: Babysit the current PR's CI in the background until green, fixing failures
---

Watch the current branch's PR until CI/CD passes, fixing failures as they appear. The watching happens in the background — between wake-ups the session stays free.

PR for current branch:
!`gh pr view --json number,url,state,headRefName 2>/dev/null || echo "No PR found for current branch"`

Process:
1. If there is no open PR, say so and stop.
2. Start `gh pr checks --watch --fail-fast` as a background task (run_in_background), then end your turn with a one-line status. You'll be re-invoked when it exits.
3. When the watcher exits:
   - All checks passed → report green with the PR URL. Done.
   - A check failed → find the failing run (`gh pr checks` / `gh run list --branch <branch>`), pull only the failing logs with `gh run view <run-id> --log-failed`, diagnose, fix locally, commit and push (hooks on, message per /ship conventions), then restart the watcher.
4. Limits: at most 5 fix-and-push cycles. If CI still fails after that, or the same check fails twice with the same error, stop and summarize what's failing, what you tried, and your best theory.
5. If checks sit queued/pending with no progress for ~30 minutes, report that instead of waiting indefinitely.
6. Never force-push, never skip hooks, never merge the PR — fixing CI is the whole job.

$ARGUMENTS
