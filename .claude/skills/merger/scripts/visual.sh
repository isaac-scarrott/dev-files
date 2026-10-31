#!/usr/bin/env bash
# visual.sh <pr>: waits for the Storefront SDK before/after grid comment for the PR's CURRENT head
# (`<!-- storefront-sdk-visual-grid head=<sha> ... -->`) and prints its state rows. Prints
# "#N NOGRID" if the PR's gates finish without one, "#N TIMEOUT" after ~60 min. Truncate your log first.
set -u
P=$1; R=${R:-holibob/holibob}
for i in $(seq 1 120); do
  head=$(gh pr view "$P" --repo "$R" --json headRefOid -q .headRefOid)
  body=$(gh pr view "$P" --repo "$R" --json comments --jq '[.comments[]|select(.body|contains("storefront-sdk-visual-grid"))]|last|.body // ""')
  if printf '%s' "$body" | grep -q "head=$head"; then
    echo "#$P GRID head=${head:0:10}:"; printf '%s\n' "$body" | grep -E '^\| `'; exit 0
  fi
  b=$(gh pr view "$P" --repo "$R" --json headRefName -q .headRefName)
  s=$(gh run list --repo "$R" --branch "$b" -L 30 --json name,status,conclusion,headSha --jq "[.[]|select(.name==\"Storefront SDK gates\")|select(.headSha==\"$head\")][0]|\"\(.status) \(.conclusion)\"")
  case "$s" in "completed success") echo "#$P NOGRID gates pass"; exit 0;; esac
  sleep 30
done
echo "#$P TIMEOUT"
