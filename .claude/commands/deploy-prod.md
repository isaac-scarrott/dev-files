---
description: Trigger production deployment
---

Trigger a production deployment.

Current repository:
!`git remote get-url origin 2>/dev/null || echo "no remote"`

Current branch:
!`git branch --show-current`

CRITICAL RULE:
If the repository URL contains "holibob" anywhere in it, STOP IMMEDIATELY and refuse to deploy. Say "Production deploys are not allowed for holibob repositories. Use the standard release process instead."

Otherwise:
1. List available workflows: `gh workflow list`
2. Find the production deploy workflow (likely named "deploy", "production", "release", or similar)
3. Trigger it using: `gh workflow run <workflow-name> --ref <current-branch>`
4. Confirm the workflow was triggered: `gh run list --workflow=<workflow-name> --limit=1`

$ARGUMENTS
