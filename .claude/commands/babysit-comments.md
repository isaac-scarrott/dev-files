---
description: Babysit the current PR's comments in the background (ignoring CodeRabbit) and address them
---

Monitor the current branch's PR for new comments and address each one. Ignore CodeRabbit entirely: skip any comment whose author login contains "coderabbit" (case-insensitive, e.g. coderabbitai[bot]). Comments from anyone else — human or bot — are in scope. The watching happens in the background — between wake-ups the session stays free.

PR for current branch:
!`gh pr view --json number,url,state 2>/dev/null || echo "No PR found for current branch"`

Process:
1. If there is no open PR, say so and stop.
2. Record the current time as the last-seen watermark, and note your own GitHub login (`gh api user --jq .login`) so you can skip your own replies.
3. Start a background poll loop (Bash with run_in_background) along these lines, then end your turn with a one-line status:
   ```sh
   while :; do
     state=$(gh pr view <N> --json state --jq .state)
     [ "$state" != "OPEN" ] && echo "PR is $state" && exit 0
     filter='[.[] | select(.created_at > "<WATERMARK>")
                  | select(.user.login | test("coderabbit"; "i") | not)
                  | select(.user.login != "<ME>")
                  | {id, user: .user.login, body, path: (.path // null), created_at}]'
     review=$(gh api "repos/<OWNER>/<REPO>/pulls/<N>/comments" --jq "$filter")
     issue=$(gh api "repos/<OWNER>/<REPO>/issues/<N>/comments" --jq "$filter")
     if [ "$review" != "[]" ] || [ "$issue" != "[]" ]; then
       echo "REVIEW:$review"; echo "ISSUE:$issue"; exit 0
     fi
     sleep 90
   done
   ```
4. When the watcher exits with new comments, handle each one:
   - Asks for a code change → make the change, commit and push (hooks on, message per /ship conventions), then reply on that comment confirming, referencing the commit.
   - Asks a question or makes a point → reply with a substantive answer. Review comments: `gh api repos/<OWNER>/<REPO>/pulls/<N>/comments/<id>/replies -f body=...`; issue comments: `gh pr comment`.
   - Unclear or a judgement call you shouldn't make alone → surface it to the user instead of guessing.
5. Advance the watermark to the newest handled comment's created_at and restart the watcher.
6. Stop when the PR is merged or closed, or when the user says stop. Never force-push, never skip hooks, never resolve disputes by reverting someone else's commits.

$ARGUMENTS
