#!/usr/bin/env bash
# watch-prs.sh <state-dir>: a background watcher that exits (waking you) when a watched PR goes
# CONFLICTING or gets a failing check you haven't acknowledged yet.
#   <state-dir>/watched-prs.txt   space-separated PR numbers; merged or closed PRs are dropped automatically
#   <state-dir>/watch-seen.txt    acknowledgements, one per line: "<pr> <sha10> <check|CONFLICTING>"
# Checks named in IGNORE_CHECKS (space-separated, underscores for spaces) are never reported.
set -u
D=$1
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
ignore=" ${IGNORE_CHECKS:-} "
touch "$D/watch-seen.txt" "$D/watched-prs.txt"
while true; do
  out=""; keep=""
  for p in $(cat "$D/watched-prs.txt"); do
    info=$(gh pr view "$p" --repo "$R" --json state,mergeable,headRefOid --jq '[.state,.mergeable,.headRefOid[0:10]]|@tsv' 2>/dev/null) || { keep="$keep $p"; continue; }
    IFS=$'\t' read -r st mg sha <<< "$info"
    if [ "$st" != "OPEN" ]; then out="$out\n$p $st (dropped)"; continue; fi
    keep="$keep $p"
    if [ "$mg" = "CONFLICTING" ] && ! grep -qx "$p $sha CONFLICTING" "$D/watch-seen.txt"; then out="$out\n$p CONFLICTING $sha"; fi
    for c in $(gh pr checks "$p" --repo "$R" 2>/dev/null | awk -F'\t' '$2=="fail"{gsub(/ /,"_",$1); print $1}'); do
      case "$ignore" in *" $c "*) continue ;; esac
      grep -qx "$p $sha $c" "$D/watch-seen.txt" || out="$out\n$p FAIL $sha $c"
    done
  done
  echo "${keep# }" > "$D/watched-prs.txt"
  if [ -n "$out" ]; then printf '%b\n' "$out"; exit 0; fi
  sleep 180
done
