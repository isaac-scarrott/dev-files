#!/usr/bin/env bash
# wait-green.sh <top-pr>: waits until every stack PR from the bottom up to and including <top-pr> has
# all required checks passing, running unstick.sh each minute. A PR outside the stack is checked alone.
# Exits 0 when green, 2 when a required check has failed and none is still running, 1 after ~40 min.
# Pair with the merge: `wait-green.sh <pr> && gh stack merge <pr> --merge --yes`.
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"
top=$1
# `gh pr checks --required` lists only the required checks that have reported, so a PR whose CI hasn't
# started reads as green. Every required name seen on any PR is kept in $REQ, and each one must pass.
REQ=$STATE/required-checks.txt; touch "$REQ"
prs=$(awk '{print $1}' "$ST" 2>/dev/null); printf '%s\n' $prs | grep -qx "$top" || prs=$top
for i in $(seq 1 40); do
  "$S/unstick.sh" >/dev/null
  bad=""
  for p in $prs; do
    c=$(gh pr checks "$p" --repo "$R" --required 2>/dev/null)
    printf '%s\n' "$c" | awk -F'\t' 'NF>1{print $1}' | sort -u - "$REQ" | grep . > "$REQ.tmp"; mv "$REQ.tmp" "$REQ"
    s=$(printf '%s\n' "$c" | awk -F'\t' -v req="$REQ" 'BEGIN{while((getline n<req)>0) want[n]=1} NF>1{seen[$1]=$2} END{for(n in want) if(!(n in seen)) printf "%s=missing ", n; else if(seen[n]!="pass" && seen[n]!="skipping") printf "%s=%s ", n, seen[n]}')
    [ -n "$s" ] && bad="$bad #$p[$s]"
    [ "$p" = "$top" ] && break
  done
  [ -z "$bad" ] && { echo "GREEN through #$top"; exit 0; }
  echo "$bad" | grep -q '=fail' && ! echo "$bad" | grep -qE '=(pending|missing)' && { echo "FAILED:$bad" | cut -c1-400; exit 2; }
  echo "$(date +%H:%M) waiting:$bad" | cut -c1-400
  sleep 60
done
echo "TIMEOUT"; exit 1
