---
description: Commit and deploy to production
---

Commit the staged changes and then trigger a production deployment.

Current repository:
!`git remote get-url origin 2>/dev/null || echo "no remote"`

Current branch:
!`git branch --show-current`

Staged changes:
!`git diff --cached --stat`

Detailed staged diff:
!`git diff --cached`

Unstaged/untracked (only if nothing staged above):
!`git diff --stat && git ls-files --others --exclude-standard`

CRITICAL RULE:
If the repository URL contains "holibob" anywhere in it, STOP IMMEDIATELY and refuse. Say "Production deploys are not allowed for holibob repositories. Use the standard release process instead." Do not commit or deploy.

Otherwise, proceed with:

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

## Step 2: Deploy
1. List available workflows: `gh workflow list`
2. Find the production deploy workflow (likely named "deploy", "production", "release", or similar)
3. Trigger it using: `gh workflow run <workflow-name> --ref <current-branch>`
4. Confirm the workflow was triggered: `gh run list --workflow=<workflow-name> --limit=1`

$ARGUMENTS
