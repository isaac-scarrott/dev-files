#!/usr/bin/env bash
# watch-queue.sh <pr>: follows a PR through the merge queue (or auto-merge) and exits with
#   0 merged ("MERGED #pr <sha>")   1 closed unmerged   2 left the queue unmerged
#   3 checks failing before it ever entered the queue (skip that pre-check with SKIP_PRECHECK=1)
# Runs unstick.sh on the PR each loop (stuck runners, checkout glitches); NO_UNSTICK=1 turns it off.
# Checks named in IGNORE_CHECKS (space-separated) don't count as failing.
set -u
pr=$1; seen=0
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
owner=${R%%/*}; name=${R##*/}
ignore=" ${IGNORE_CHECKS:-} "
query() {
  gh api graphql -f query="query{repository(owner:\"$owner\",name:\"$name\"){pullRequest(number:$pr){state mergeCommit{oid} mergeQueueEntry{state}}}}" \
    --jq '.data.repository.pullRequest|"\(.state) \(.mergeQueueEntry.state // "none") \(.mergeCommit.oid // "-")"' 2>/dev/null
}
while true; do
  read -r st qs sha <<< "$(query)"
  [ -z "${st:-}" ] && { sleep 30; continue; }
  [ "$st" = MERGED ] && { echo "MERGED #$pr $sha"; exit 0; }
  [ "$st" = CLOSED ] && { echo "CLOSED #$pr unmerged"; exit 1; }
  [ "$qs" != none ] && seen=1
  if [ -z "${SKIP_PRECHECK:-}" ] && [ "$qs" = none ] && [ $seen = 0 ]; then
    failing=$(gh pr checks "$pr" --repo "$R" 2>/dev/null | awk -F'\t' -v ignore="$ignore" '$2=="fail" && index(ignore, " " $1 " ")==0 {printf "%s; ", $1}')
    [ -n "$failing" ] && { echo "CHECKS FAILING #$pr before queue: $failing"; exit 3; }
  fi
  if [ "$qs" = none ] && [ $seen = 1 ]; then
    sleep 20
    read -r st qs sha <<< "$(query)"
    [ "$st" = MERGED ] && { echo "MERGED #$pr $sha"; exit 0; }
    [ "$qs" = none ] && { echo "DEQUEUED #$pr (state $st, not merged)"; exit 2; }
  fi
  [ -n "${NO_UNSTICK:-}" ] || "$(dirname "$0")/unstick.sh" "$pr" >&2
  sleep 30
done
