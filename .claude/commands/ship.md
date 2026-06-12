---
description: Commit everything and push in one step, running hooks by default
---

Commit the current changes and push them. One step, no ceremony.

Current branch:
!`git branch --show-current`

Changes:
!`git status --short`

Diff vs HEAD:
!`git diff HEAD --stat`

Rules:
1. Stage everything relevant (avoid secrets, env files, lockfiles unless relevant)
2. Check for ticket number in branch name (e.g., "TX-123" from "feature/TX-123-something" or "TX-123-fix-bug")
3. If ticket found: "[TX-123] type: description"
4. If no ticket found: "type: description" (no brackets, this is fine)
5. Type is one of: fix/feat/refactor/docs/test/chore
6. Keep the entire commit message under 72 characters so GitHub doesn't truncate it
7. Focus on the "why" not the "what"
8. Use lowercase for the description after the colon
9. Commit, then push to the remote branch. Let git hooks run normally.
10. Only use --no-verify if the arguments below explicitly ask to skip hooks ("no verify", "nv", "skip hooks"). If a hook fails and skipping wasn't requested, fix what the hook flagged and retry — do not fall back to --no-verify on your own.

$ARGUMENTS
