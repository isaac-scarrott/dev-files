#!/usr/bin/env bash
# wait-checks.sh <pr>: blocks until no check on the PR is pending, then prints each failing check.
# Run it in the background; it exits once CI has settled. Checks named in IGNORE_CHECKS (space-separated)
# are left out of the failures, e.g. label gates the merger satisfies.
set -u
pr=$1
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
ignore=" ${IGNORE_CHECKS:-} "
while [ "$(gh pr checks "$pr" --repo "$R" 2>/dev/null | awk -F'\t' '$2=="pending"' | wc -l | tr -d ' ')" != "0" ]; do
  sleep 60
done
gh pr checks "$pr" --repo "$R" 2>/dev/null | awk -F'\t' -v ignore="$ignore" '$2=="fail" && index(ignore, " " $1 " ")==0 {print "FAIL " $1 "\t" $4}'
echo "settled #$pr"
