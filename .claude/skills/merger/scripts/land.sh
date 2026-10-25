#!/usr/bin/env bash
# land.sh <pr> [label...]: the one command from "approved" to "deployed". Run it in the background.
#   1. authorise.sh adds the release labels (default "Release Authorised"; pass none with NO_LABEL=1
#      for a Risk: Low PR the merger approves itself) and reruns the label check.
#   2. Checks every label a failing required check names (e.g. graphql-breaking-approved) is present.
#   3. `gh pr merge --merge` puts it in the queue, or sets auto-merge when checks are still running.
#   4. watch-queue.sh follows it (unstick.sh each loop). watch-deploy.sh follows the deploy.
# Every state change is one line on stdout and in $STATE/land-<pr>.log, and a ledger row update:
#   QUEUED #pr | MERGED #pr <sha> | LANDED #pr run=<id> | ALARM #pr <why>
# ALARM is the only line that needs the merger: a required check went red, the PR left the queue
# unmerged, a label a check demands is missing, or the deploy failed. Nothing here loops `gh pr merge`.
#   LEDGER   path to ledger.py (default ~/.claude/skills/orchestrator/scripts/ledger.py)
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"
P=$1; shift
LOG=$STATE/land-$P.log; LEDGER=${LEDGER:-$HOME/.claude/skills/orchestrator/scripts/ledger.py}
say() { echo "$(date -u +%H:%M) $*" | tee -a "$LOG"; }
ledger() { python3 "$LEDGER" set "$P" "$@" >/dev/null 2>&1 || true; }
alarm() { say "ALARM #$P $*"; ledger holder=merger state=blocked note="land.sh: $*"; exit 1; }

# 1. labels
if [ -z "${NO_LABEL:-}" ]; then "$S/authorise.sh" "$P" "$@" | tee -a "$LOG" || alarm "could not add labels"; fi

# 2. a required check that fails for a missing label says so in its name or its summary
sleep 20
missing=$(gh pr checks "$P" --repo "$R" --required 2>/dev/null | awk -F'\t' '$2=="fail"{print $1}' | grep -iE "label|approved" || true)
[ -n "$missing" ] && alarm "a required label check is still red: $missing — add the label it names, then rerun land.sh"

# 3. queue
head=$(gh pr view "$P" --repo "$R" --json headRefOid --jq .headRefOid)
if ! gh pr merge "$P" --repo "$R" --merge 2>>"$LOG"; then
  # already queued / auto-merge already on is not an error; anything else is
  grep -qiE "already|auto-merge" "$LOG" || alarm "gh pr merge refused: $(tail -1 "$LOG")"
fi
say "QUEUED #$P $head"; ledger holder=merger state=queued head="${head:0:10}" note="land.sh watching"

# 4. follow the queue, then the deploy
"$S/watch-queue.sh" "$P" > "$STATE/land-$P.queue" 2>>"$LOG"; rc=$?
out=$(cat "$STATE/land-$P.queue"); say "$out"
case $rc in
  0) sha=${out##* }; ledger state=merged head="${sha:0:10}" note="deploying";
     dep=$("$S/watch-deploy.sh" "$sha" "#$P" 2>>"$LOG"); say "$dep"
     if echo "$dep" | grep -q "conclusion=success"; then say "LANDED #$P ${dep#*run=}"; ledger state=landed note="${dep#*run=}"
     else alarm "deploy did not succeed: $dep"; fi ;;
  1) alarm "closed without merging" ;;
  2) alarm "left the queue unmerged (merge_conflict or failed_checks) — read the group run, fix, then land.sh again" ;;
  3) alarm "a check is red before the queue: ${out#*: }" ;;
  *) alarm "watch-queue.sh exited $rc" ;;
esac
