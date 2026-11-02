#!/bin/bash
# pr-state-watch.sh <pr...>: print a line when a PR's state, head, merge state, labels or check counts change (bash 3 safe)
D=$(mktemp -d)
while true; do
  for n in "$@"; do
    s=$(gh pr view $n --json state,mergeStateStatus,headRefOid,labels,statusCheckRollup --jq '[.state,.mergeStateStatus,.headRefOid[0:10],([.labels[].name]|join(",")),([.statusCheckRollup[]|select(.status!="COMPLETED")]|length),([.statusCheckRollup[]|select(.conclusion=="FAILURE")]|length)]|join(" | ")' 2>/dev/null) || continue
    [ -z "$s" ] && continue
    [ "$s" != "$(cat $D/$n 2>/dev/null)" ] && { echo "#$n $s"; echo "$s" > $D/$n; }
  done
  sleep 60
done
