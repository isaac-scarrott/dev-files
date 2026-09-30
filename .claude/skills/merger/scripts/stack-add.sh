#!/usr/bin/env bash
# stack-add.sh <pr>: put <pr> on top of the stack. Merges the current top into its branch (normal push,
# never force), links it with `gh stack link`, and makes sure CI ran on the new head.
#   exit 4  merge conflict; the merge is left in $STATE/wt. Resolve, `git commit --no-edit` there
#           (hooks on), then run `stack-add.sh <pr> --resume`.
# Order matters: link before push, so the push lands with the stack base (trunk) and CI triggers.
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"; ensure_wt
P=$1; resume=${2:-}
B=$(gh pr view "$P" --repo "$R" --json headRefName --jq .headRefName)
TOP=$(tail -1 "$ST" | awk '{print $2}'); TOP=${TOP:-$trunk}
list=$(awk '{print $1}' "$ST" | tr '\n' ' ')
if [ "$(wc -l <"$ST")" -ge 1 ]; then gh stack link $list $P >/dev/null || { echo "LINK FAILED #$P"; exit 6; }; fi
cd "$WT"
if [ "$resume" != --resume ]; then
  git merge --abort 2>/dev/null; git fetch -q origin "$trunk" "$B" "$TOP"
  git checkout -q --detach "origin/$B" >>"$QUIET" 2>&1
  if ! git merge --no-edit -q "origin/$TOP" -m "Merge $TOP into $B (stack)" >>"$QUIET" 2>&1; then
    echo "CONFLICT #$P ($B) with $TOP:"; git diff --name-only --diff-filter=U; exit 4
  fi
fi
[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$B")" ] && { git push -q origin "HEAD:refs/heads/$B" || { echo "PUSH REJECTED #$P"; exit 5; }; }
echo "$P $B" >> "$ST"
[ "$(wc -l <"$ST")" -eq 2 ] && ensure_ci "$(head -1 "$ST" | awk '{print $1}')"
[ "$(wc -l <"$ST")" -ge 2 ] && ensure_ci "$P"
echo "STACKED #$P ($B); stack: $(awk '{print $1}' "$ST" | tr '\n' ' ')"
