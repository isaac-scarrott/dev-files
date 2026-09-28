#!/usr/bin/env bash
# watch-deploy.sh <merge-sha> [label]: waits for the first completed, non-cancelled run of the deploy
# workflow whose head contains <merge-sha> (a newer run can supersede the one the merge started), then
# prints its conclusion and every job that didn't succeed.
#   DEPLOY_WORKFLOW   workflow file name (default deploy.yaml)
#   DEPLOY_KEY_JOBS   regex of job names to always print, e.g. 'storefront|graphql|Migration'
set -u
sha=$1; label=${2:-$1}
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
workflow=${DEPLOY_WORKFLOW:-deploy.yaml}
key=${DEPLOY_KEY_JOBS:-}
contains() { # does <head> contain <sha>?
  local status
  status=$(gh api "repos/$R/compare/$sha...$1" --jq .status 2>/dev/null) || return 1
  [ "$status" = ahead ] || [ "$status" = identical ]
}
while true; do
  run=""; runstatus=""; conclusion=""
  while IFS=, read -r id head status concl; do
    [ "$concl" = cancelled ] && continue
    contains "$head" || continue
    run=$id; runstatus=$status; conclusion=$concl   # newest first, so the last match is the oldest run containing it
  done < <(gh run list -R "$R" --workflow "$workflow" -L 15 --json databaseId,headSha,status,conclusion \
             --jq '.[]|"\(.databaseId),\(.headSha),\(.status),\(.conclusion)"')
  if [ -n "$run" ] && [ "$runstatus" = completed ]; then
    echo "DEPLOY $label run=$run conclusion=$conclusion https://github.com/$R/actions/runs/$run"
    gh run view "$run" -R "$R" --json jobs --jq '.jobs[]|select(.conclusion!="success" and .conclusion!="skipped")|"  \(.name): \(.conclusion)"'
    [ -n "$key" ] && gh run view "$run" -R "$R" --json jobs --jq ".jobs[]|select(.name|test(\"$key\";\"i\"))|\"  \(.name): \(.conclusion)\"" | sort -u
    exit 0
  fi
  sleep 150
done
