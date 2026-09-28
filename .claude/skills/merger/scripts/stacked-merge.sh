#!/usr/bin/env bash
# stacked-merge.sh <parent-pr> <child-pr>: once the parent merges, retarget the child to trunk, push to
# it so CI runs, queue it, and follow it through the queue and the deploy.
#
# A retarget alone doesn't start CI where the workflow triggers only on opened/synchronize: the child
# then sits BLOCKED with nothing running. `gh pr update-branch` merges trunk in, which is a push.
# Exits 4 when the child conflicts after the retarget. Hand a source-code conflict back to the
# orchestrator as a change request; generated files are yours to regenerate.
set -u
S=$(cd "$(dirname "$0")" && pwd)
parent=$1; child=$2
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
trunk=${TRUNK:-$(gh repo view "$R" --json defaultBranchRef -q .defaultBranchRef.name)}
while :; do
  st=$(gh pr view "$parent" --repo "$R" --json state --jq .state)
  [ "$st" = MERGED ] && break
  [ "$st" = CLOSED ] && { echo "PARENT CLOSED #$parent"; exit 1; }
  sleep 60
done
echo "PARENT MERGED #$parent"
sleep 20
base=$(gh pr view "$child" --repo "$R" --json baseRefName --jq .baseRefName)
if [ "$base" != "$trunk" ]; then
  gh pr edit "$child" --repo "$R" --base "$trunk" >/dev/null && echo "RETARGETED #$child to $trunk"
fi
sleep 20
[ "$(gh pr view "$child" --repo "$R" --json mergeable --jq .mergeable)" = CONFLICTING ] && { echo "CONFLICTING #$child after retarget"; exit 4; }
gh pr update-branch "$child" --repo "$R" 2>&1
sleep 30
gh pr merge "$child" --repo "$R" 2>&1
SKIP_PRECHECK=1 "$S/watch-queue.sh" "$child" || exit $?
sha=$(gh pr view "$child" --repo "$R" --json mergeCommit --jq .mergeCommit.oid)
"$S/watch-deploy.sh" "$sha" "#$child"
