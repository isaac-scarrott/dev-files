#!/usr/bin/env bash
# stack-cascade.sh: bring every layer up to date with the one below (layer 0 with trunk), bottom → top,
# by merge + normal push. Run when trunk moves and right before `gh stack merge`.
#   exit 4  conflict at a layer, left in $STATE/wt: resolve, commit (hooks on), push, rerun.
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"; ensure_wt
cd "$WT"; git fetch -q origin
prev=$trunk
while read -r P B; do
  git checkout -q --detach "origin/$B" >>"$QUIET" 2>&1
  if git merge-base --is-ancestor "origin/$prev" HEAD; then echo "ok #$P"; prev=$B; continue; fi
  if ! git merge --no-edit -q "origin/$prev" -m "Merge $prev into $B (stack)" >>"$QUIET" 2>&1; then
    echo "CONFLICT #$P ($B) with $prev:"; git diff --name-only --diff-filter=U; exit 4
  fi
  git push -q origin "HEAD:refs/heads/$B" && git fetch -q origin "$B" && echo "merged #$P"
  prev=$B
done < "$ST"
echo "CASCADE DONE"
