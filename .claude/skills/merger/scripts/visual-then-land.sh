#!/usr/bin/env bash
# visual-then-land.sh <pr> <approved-set-file>
# For an SDK PR whose picture set the owner already approved: wait for the grid on the current head,
# stop if the set differs from <approved-set-file>, otherwise put the visual label on ALONE, wait for
# the bot, authorise, wait for green and land. Prints short lines for a monitor. Safe to re-run.
set -u
S=$(cd "$(dirname "$0")" && pwd); P=$1; APPROVED=$2; LOG=/tmp/visual-$P.run.log
[ "$(gh pr view "$P" --json state -q .state)" = OPEN ] || { echo "Land $P: not open"; exit 0; }
gh pr edit "$P" --remove-label "Release Authorised" >/dev/null 2>&1
: > "$LOG"; "$S/visual.sh" "$P" > "$LOG" 2>&1
echo "Grid: $(head -1 "$LOG")"
grep -oE '^\| `[^`]+`' "$LOG" | sort > "/tmp/visual-$P.set"
if ! diff -q "$APPROVED" "/tmp/visual-$P.set" >/dev/null; then
  echo "Different pictures than approved, stopping:"; diff "$APPROVED" "/tmp/visual-$P.set" | head -6; exit 0
fi
echo "Same pictures as the ones the owner approved"
gh pr edit "$P" --add-label sdk-visual-changes-approved >/dev/null
"$S/wait-bot.sh" "$P" > "/tmp/bot-$P.run.log" 2>&1
echo "Bot: $(tail -1 "/tmp/bot-$P.run.log")"
"$S/authorise.sh" "$P" 2>&1 | tail -1
"$S/wait-green.sh" "$P" 2>&1 | tail -1 | sed 's/^/GREEN: /'
"$S/land.sh" "$P" 2>&1 | grep -E 'QUEUED|MERGED|DEPLOY|LANDED|ALARM'
