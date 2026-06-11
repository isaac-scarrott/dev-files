---
name: create-worktree
description: Create a new git worktree for the current repo under .worktree/, branched off the repo's default branch, copying over gitignored .env files so the new tree is runnable immediately. Use when the user wants a new worktree, asks to start a ticket or branch in a fresh worktree, or invokes /create-worktree. Accepts a Linear ticket ID (e.g. HOL-340), a branch name, or a freetext description.
---

# Create worktree

Creates a git worktree for the current repo at `.worktree/<name>` and copies the
gitignored `.env` files into it. Works in any repo. Keep it simple — these are the only steps.

## 1. Work out the branch name

- **Linear ticket ID** (e.g. `HOL-340`, `ENG-12`): fetch it with `mcp__plugin_personal_linear-server__get_issue`,
  then build `<identifier-lowercased>-<kebab-title>` from the identifier + title (lowercase, dashes,
  drop punctuation, ~6 words max). Example: HOL-340 "Fix product card images" → `hol-340-fix-product-card-images`.
- **Branch name or description**: kebab-case it. Keep any ticket prefix (e.g. `hol-340`, `eng-12`) as-is.

The worktree folder name is the branch name. Confirm the derived name with the user only if it was guessed from freetext.

## 2. Create the worktree

Run from the repo root. Base off the repo's default branch (whatever `origin/HEAD` points at):

```bash
ROOT=$(git rev-parse --show-toplevel)
BASE=$(git -C "$ROOT" symbolic-ref --quiet refs/remotes/origin/HEAD | sed 's@^refs/remotes/@@')
git -C "$ROOT" fetch origin --quiet
git -C "$ROOT" worktree add "$ROOT/.worktree/<branch>" -b <branch> "$BASE"
```

- If `origin/HEAD` is unset, set it once with `git remote set-head origin -a`, or pass an explicit base.
- If the branch already exists, drop `-b` and `$BASE`: `git worktree add "$ROOT/.worktree/<branch>" <branch>`.
- If the user names a different base, use it instead of `$BASE`.

## 3. Keep `.worktree/` out of git status

If `.worktree/` isn't already ignored, add it to the local exclude (uncommitted, doesn't touch the tracked `.gitignore`):

```bash
git -C "$ROOT" check-ignore -q .worktree/ \
  || grep -qxF '.worktree/' "$ROOT/.git/info/exclude" \
  || echo '.worktree/' >> "$ROOT/.git/info/exclude"
```

## 4. Copy the .env files

```bash
~/.claude/skills/create-worktree/scripts/copy-env-files.sh "$ROOT" "$ROOT/.worktree/<branch>"
```

This copies every gitignored `.env` / `.env.*` (excluding `node_modules`, `cdk.out`, `dist`,
`build`, `.next`, `coverage`), preserving relative paths. If there are none, it says so and moves on.

## 5. Report and offer to switch

Tell the user the worktree path and the branch. Then offer to switch into it:

- If the question tool is available, ask whether to set the working directory to the
  new worktree — two options, "Yes (Recommended)" first and "No". Otherwise ask in plain text.
- If yes, run `cd "$ROOT/.worktree/<branch>"` as a standalone command so the working directory
  persists for later calls.

Do not start work in the worktree unless asked.
