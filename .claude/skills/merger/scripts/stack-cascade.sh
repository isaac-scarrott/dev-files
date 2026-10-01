#!/usr/bin/env bash
# stack-cascade.sh: bring every layer up to date with the one below (layer 0 with trunk), bottom → top,
# by merge + normal push. Run when trunk moves and right before `gh stack merge`.
#   exit 4  conflict at a layer, left in $STATE/conflict-<pr>: resolve, commit (hooks on), push, rerun.
#           The rerun removes that worktree once its commit is on the remote branch.
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"; ensure_wt
cd "$WT"; git fetch -q origin
prev=$trunk
while read -r P B; do
  K=$STATE/conflict-$P
  if [ -d "$K" ]; then
    if ! git -C "$K" rev-parse -q --verify MERGE_HEAD >/dev/null && git -C "$K" merge-base --is-ancestor HEAD "origin/$B"; then
      rm -rf "$K"; git worktree prune
    else
      echo "CONFLICT PENDING #$P in $K: resolve, commit (hooks on), push HEAD:refs/heads/$B, rerun"; exit 4
    fi
  fi
  git checkout -q --detach "origin/$B" >>"$QUIET" 2>&1
  if git merge-base --is-ancestor "origin/$prev" HEAD; then echo "ok #$P"; prev=$B; continue; fi
  if ! git merge --no-edit -q "origin/$prev" -m "Merge $prev into $B (stack)" >>"$QUIET" 2>&1; then
    echo "CONFLICT #$P ($B) with $prev:"; git diff --name-only --diff-filter=U; keep_wt "$P"; exit 4
  fi
  git push -q origin "HEAD:refs/heads/$B" && git fetch -q origin "$B" && echo "merged #$P"
  prev=$B
done < "$ST"
echo "CASCADE DONE"
