---
description: Commit changes and create a pull request
---

Commit the staged changes, push, and create a pull request.

Current branch:
!`git branch --show-current`

Current repository:
!`git remote get-url origin 2>/dev/null || echo "no remote"`

Staged changes:
!`git diff --cached --stat`

Detailed staged diff:
!`git diff --cached`

Unstaged/untracked (only if nothing staged above):
!`git diff --stat && git ls-files --others --exclude-standard`

Existing PR for current branch (if any):
!`gh pr view --json number,title,url,state 2>/dev/null || echo "No PR found for current branch"`

Available labels in repo:
!`gh label list --limit 100 2>/dev/null || echo "Could not fetch labels"`

## Step 1: Commit
1. If nothing is staged, use your judgement to stage appropriate files (avoid secrets, env files, lockfiles unless relevant)
2. Check for ticket number in branch name (e.g., "TX-123" from "feature/TX-123-something" or "TX-123-fix-bug")
3. If ticket found: "[TX-123] type: description"
4. If no ticket found: "type: description" (no brackets, this is fine)
5. Type is one of: fix/feat/refactor/docs/test/chore
6. Keep the entire commit message under 72 characters so GitHub doesn't truncate it
7. Focus on the "why" not the "what"
8. Use lowercase for the description after the colon
9. After committing, push to the remote branch

## Step 2: Create PR
1. If a PR already exists, inform the user and skip PR creation
2. Create a PR using `gh pr create`
3. Title format: "[TX-123] Some descriptive title" (use ticket from branch if available)
4. Add a description summarizing the changes
5. Assign to me: `--assignee @me`
6. Add an appropriate risk label (low, medium, high) based on the scope of changes

$ARGUMENTS
