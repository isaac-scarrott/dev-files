#!/usr/bin/env bash
# unstick.sh [pr...]: (default: every PR in the stack, plus every live merge-queue group run) fixes CI stalls that aren't the code's fault,
# once per run, logging to $STATE/unstick.log:
#   - a job still `queued` ≥8 min after it was created (the runner never launched): cancel, rerun failed
#   - a job that failed on "could not fetch … from promisor remote" (checkout glitch): rerun failed
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"
LOG=$STATE/unstick.log; DONE=$STATE/unstick.done; touch "$DONE"
prs=${*:-$(awk '{print $1}' "$ST")}
# merge-queue groups run on gh-readonly-queue/* branches, not on any PR head; scan the live ones too
queue_runs=$(gh run list --repo "$R" --event merge_group --limit 40 --json databaseId,status,createdAt --jq '.[]|select(.status!="completed" and ((now - (.createdAt|fromdateiso8601)) < 21600))|.databaseId')
for p in $prs QUEUE; do
  if [ "$p" = QUEUE ]; then live=$queue_runs; else
    h=$(gh pr view "$p" --repo "$R" --json headRefOid --jq .headRefOid 2>/dev/null) || continue
    live=$(gh run list --repo "$R" --commit "$h" --limit 20 --json databaseId,status --jq '.[]|select(.status!="completed")|.databaseId'); fi
  for r in $live; do
    grep -qx "$r" "$DONE" && continue
    stuck=$(gh run view "$r" --repo "$R" --json jobs --jq '[.jobs[]|select(.status=="queued" and ((now - (.startedAt|fromdateiso8601)) > 480))|.name]|join(",")' 2>/dev/null)
    [ -z "$stuck" ] && continue
    echo "$(date +%H:%M) #$p run $r queued without a runner: $stuck → cancel + rerun" | tee -a "$LOG"
    gh run cancel "$r" --repo "$R" >/dev/null 2>&1
    for i in $(seq 1 30); do [ "$(gh run view "$r" --repo "$R" --json status --jq .status)" = completed ] && break; sleep 5; done
    gh run rerun "$r" --repo "$R" --failed >/dev/null 2>&1 && echo "$r" >> "$DONE"
  done
  [ "$p" = QUEUE ] && continue
  for r in $(gh run list --repo "$R" --commit "$h" --limit 20 --json databaseId,conclusion --jq '.[]|select(.conclusion=="failure")|.databaseId'); do
    grep -qx "$r" "$DONE" && continue
    for j in $(gh run view "$r" --repo "$R" --json jobs --jq '.jobs[]|select(.conclusion=="failure")|.databaseId'); do
      if gh api "repos/$R/check-runs/$j/annotations" --jq '.[].message' 2>/dev/null | grep -q "from promisor remote"; then
        echo "$(date +%H:%M) #$p run $r checkout glitch → rerun failed" | tee -a "$LOG"
        gh run rerun "$r" --repo "$R" --failed >/dev/null 2>&1 && echo "$r" >> "$DONE"; break
      fi
    done
  done
done
