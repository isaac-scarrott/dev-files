#!/usr/bin/env bash
# wait-green.sh <top-pr>: waits until every stack PR from the bottom up to and including <top-pr> has
# all required checks passing, running unstick.sh each minute. Exits 0 when green, 1 after ~40 min.
# Pair with the merge: `wait-green.sh <pr> && gh stack merge <pr> --merge --yes`.
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"
top=$1
for i in $(seq 1 40); do
  "$S/unstick.sh" >/dev/null
  bad=""
  for p in $(awk '{print $1}' "$ST"); do
    s=$(gh pr checks "$p" --repo "$R" --required 2>/dev/null | awk -F'\t' '$2!="pass" && $2!="skipping"{printf "%s=%s ", $1, $2}')
    [ -n "$s" ] && bad="$bad #$p[$s]"
    [ "$p" = "$top" ] && break
  done
  [ -z "$bad" ] && { echo "GREEN through #$top"; exit 0; }
  echo "$(date +%H:%M) waiting:$bad" | cut -c1-400
  sleep 60
done
echo "TIMEOUT"; exit 1
