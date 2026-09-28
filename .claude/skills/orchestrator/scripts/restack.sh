#!/usr/bin/env bash
# restack.sh <onto> <old-base> <branch> [<old-base> <branch> ...]
#
# Rebases a stack in order: the first branch goes onto <onto>, and each later branch onto the new head of
# the one before it. Each <old-base> is the commit that branch currently sits on (the parent's
# pre-rebase tip). Run it in a spare worktree, never one a builder is using. It pushes nothing: review
# the result, then push each branch with --force-with-lease.
#
# Generated files: set RESTACK_GENERATED to an extended regex of conflicted paths that the script may
# take either side of, and RESTACK_REGEN to the command that regenerates them (run from the repo root),
# e.g. RESTACK_GENERATED='^apps/storefront-sdk/src/(locales/[^/]+\.json|i18n/messageKeys\.ts)$'
#      RESTACK_REGEN='(cd apps/storefront-sdk && pnpm -s i18n:assets)'
# Any other conflict stops the script with the rebase left in place for a human to resolve.
set -euo pipefail
onto=$1; shift
generated=${RESTACK_GENERATED:-'^$'}
regen=${RESTACK_REGEN:-true}

settle() {
  while [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; do
    conflicted=$(git diff --name-only --diff-filter=U)
    other=$(printf '%s\n' "$conflicted" | grep -vE "$generated" | grep -v '^$' || true)
    if [ -n "$other" ]; then
      echo "STOP: resolve by hand, then 'git rebase --continue' and re-run for the rest:"
      printf '  %s\n' $other
      exit 1
    fi
    if [ -n "$conflicted" ]; then
      printf '%s\n' "$conflicted" | xargs git checkout --theirs --
      eval "$regen" >/dev/null
      printf '%s\n' "$conflicted" | xargs git add --
      git add -u
    fi
    GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || true
  done
}

git fetch -q origin
target=$onto
while [ $# -ge 2 ]; do
  old=$1; branch=$2; shift 2
  git checkout -q "$branch"
  git rebase --onto "$target" "$old" "$branch" >/dev/null 2>&1 || settle
  eval "$regen" >/dev/null
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "STOP: $branch changed on regeneration; a commit's generated files were stale. Inspect it before pushing."
    exit 1
  fi
  echo "restacked $branch = $(git rev-parse --short=10 HEAD) on $(git rev-parse --short=10 "$target")"
  target=$(git rev-parse HEAD)
done
