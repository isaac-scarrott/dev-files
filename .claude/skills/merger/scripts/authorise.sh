#!/usr/bin/env bash
# authorise.sh <pr> [label...]: adds the owner-approved release labels (default "Release Authorised"),
# then reruns any failed run of the label-requirement check, which otherwise stays red on the run from
# before the label existed and leaves the PR BLOCKED with everything else green.
#   RISK_CHECK   name of that check (default pr-require-risk-labels)
set -u
S=$(cd "$(dirname "$0")" && pwd)
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
P=$1; shift
if [ $# -gt 0 ]; then labels=("$@"); else labels=("Release Authorised"); fi
args=(); for l in "${labels[@]}"; do args+=(--add-label "$l"); done
gh pr edit "$P" --repo "$R" "${args[@]}" >/dev/null || exit 1
u=$(gh pr checks "$P" --repo "$R" 2>/dev/null | awk -F'\t' -v c="${RISK_CHECK:-pr-require-risk-labels}" '$1==c && $2=="fail"{print $4}' | head -1)
[ -n "$u" ] && { r=$(echo "$u" | sed -E 's#.*/runs/([0-9]+)/.*#\1#'); gh run rerun "$r" --repo "$R" --failed >/dev/null 2>&1 && echo "RERAN label check #$P"; }
echo "AUTHORISED #$P: ${labels[*]}"
