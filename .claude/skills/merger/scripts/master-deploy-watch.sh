#!/bin/bash
# prints when a recent master run changes status/conclusion (bash 3 safe)
D=$(mktemp -d)
while true; do
  gh run list --branch master -L 6 --json databaseId,name,status,conclusion,headSha --jq '.[]|"\(.databaseId)|\(.name) \(.databaseId) \(.headSha[0:8]) \(.status) \(.conclusion)"' 2>/dev/null | while IFS='|' read -r id line; do
    [ "$line" != "$(cat $D/$id 2>/dev/null)" ] && { echo "$line"; echo "$line" > $D/$id; }
  done
  sleep 90
done
