#!/usr/bin/env bash
# stack-queue.sh: authorise every PR in stack.txt, wait for the label check, enqueue with `gh stack merge <top>`
# (prefixes bottom-up if the whole call fails), wait until all are MERGED. Run it with bash (zsh does not split lists).
set -u
S=$(cd "$(dirname "$0")" && pwd); . "$S/_stack-env.sh"
LIST=$(awk '{print $1}' "$ST" | tr '\n' ' '); TOP=$(tail -1 "$ST" | awk '{print $1}')
echo "Start: stack $LIST top #$TOP"
for p in $LIST; do gh pr merge "$p" --disable-auto >/dev/null 2>&1; "$S/authorise.sh" "$p" 2>&1 | tail -1; done
for i in $(seq 1 40); do
  n=0; for p in $LIST; do
    c=$(gh pr view "$p" --json statusCheckRollup --jq '[.statusCheckRollup[]|select(.name=="pr-require-risk-labels")|.conclusion]|last')
    [ "$c" = SUCCESS ] || n=$((n+1))
  done
  [ "$n" = 0 ] && break; sleep 20
done
echo "labelcheck not-yet-green=$n"
out=$(gh stack merge "$TOP" --merge --yes 2>&1 | tail -2); echo "$out"
case "$out" in *Added*|*queue*) ;; *) echo "Whole-stack failed, adding prefixes"; for p in $LIST; do gh stack merge "$p" --merge --yes 2>&1 | tail -1; done;; esac
for i in $(seq 1 120); do
  s=$(for p in $LIST; do gh pr view "$p" --json state -q .state; done | sort | uniq -c | tr '\n' ' ' | tr -s ' ')
  case "$s" in *OPEN*) sleep 60;; *) echo "MERGED: stack $LIST ($s)"; exit 0;; esac
done
echo "Stop: not merged ($s)"
