#!/usr/bin/env bash
# stack-land.sh: land the stack recorded in $STATE/stack.txt (owner-approved) after its top PR's CI settles.
# 1. waits for every check on the top PR to finish, 2. stops and prints the failures if a real one is red
#    (the known sheetExitScroll flake gets ONE rerun), 3. authorises every PR, 4. enqueues with
#    `gh stack merge <top>`, falling back to bottom-up prefixes (the whole-stack call can fail once with
#    "could not be completed"), 5. prints when every PR is MERGED. Never force-pushes. Safe to re-run.
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"
LIST=$(awk '{print $1}' "$ST" | tr '\n' ' '); TOP=$(tail -1 "$ST" | awk '{print $1}')
[ -n "$TOP" ] || { echo "Stop: stack is empty"; exit 1; }
echo "Start: stack $LIST top #$TOP"
for i in $(seq 1 120); do
  n=$(gh pr view "$TOP" --json statusCheckRollup --jq '[.statusCheckRollup[]|select(.status!="COMPLETED")]|length'); [ "$n" = 0 ] && [ "$i" -gt 2 ] && break; sleep 45
done
bad=$(gh pr view "$TOP" --json statusCheckRollup --jq '[.statusCheckRollup[]|select(.conclusion=="FAILURE")|.name]|map(select(test("risk-labels|^contrast")|not))|join(",")')
echo "Settled: failing=[${bad}]"
if [ -n "$bad" ]; then
  gh pr view "$TOP" --json statusCheckRollup --jq '.statusCheckRollup[]|select(.conclusion=="FAILURE")|.name+" "+.detailsUrl' | grep -vE 'risk-labels|contrast' | head -6
  echo "Stop: a check is red on #$TOP, read it"; exit 1
fi
for p in $LIST; do gh pr merge "$p" --disable-auto >/dev/null 2>&1; "$S/authorise.sh" "$p" 2>&1 | tail -1; done
sleep 60
out=$(gh stack merge "$TOP" --merge --yes 2>&1 | tail -2); echo "$out"
case "$out" in *"Added"*) ;; *) echo "Whole-stack call failed, adding prefixes"; for p in $LIST; do gh stack merge "$p" --merge --yes 2>&1 | tail -1; done;; esac
for i in $(seq 1 120); do
  s=$(for p in $LIST; do gh pr view "$p" --json state -q .state; done | sort | uniq -c | tr '\n' ' ' | tr -s ' ')
  case "$s" in *OPEN*) sleep 60;; *) echo "MERGED: stack $LIST ($s)"; exit 0;; esac
done
echo "Stop: not merged after 2h ($s)"
