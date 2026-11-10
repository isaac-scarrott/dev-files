#!/usr/bin/env bash
# usage: preapproved-visual-land.sh <pr>   Isaac pre-approved the PR's pictures; stops if any picture is NEW (no baseline).
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
PR=$1; S=~/.claude/skills/merger/scripts
for i in $(seq 1 120); do
  O=$($S/visual.sh $PR 2>&1)
  echo "$O" | grep -qE "^#$PR (GRID|NOGRID)" && break
  sleep 60
done
if echo "$O" | grep -q "^#$PR NOGRID"; then NO_LABEL=0 $S/grid-then-land.sh $PR 2>&1; exit; fi
T=$(gh pr view $PR --json comments --jq '[.comments[]|select(.body|contains("storefront-sdk-visual-grid"))]|last|.body' | grep -E '^\| `')
echo "$T" | cut -c1-90
if echo "$T" | grep -q '| new |'; then echo "Stop: NEW pictures in #$PR, ask Isaac"; exit 1; fi
echo "$T" | sed -E 's/^(\| `[^`]+`).*/\1/' | sort > /tmp/approved-$PR.set
$S/visual-then-land.sh $PR /tmp/approved-$PR.set 2>&1
