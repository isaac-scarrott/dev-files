#!/usr/bin/env bash
# grid-then-land.sh <pr>: owner approved landing this SDK PR including its picture round.
# Waits for the grid on the current head. NOGRID (gates pass, no picture changed): no visual label, authorise and land.
# TIMEOUT: stop. Grid: take its picture set as the approved set and run visual-then-land.sh.
set -u
S=$(cd "$(dirname "$0")" && pwd); P=$1
"$S/visual.sh" "$P" > "/tmp/grid-$P.txt" 2>&1
first=$(head -1 "/tmp/grid-$P.txt"); echo "Grid: $(echo "$first" | cut -c1-60)"
case "$first" in
  *NOGRID*) "$S/authorise.sh" "$P" 2>&1 | tail -1; sleep 45; "$S/wait-green.sh" "$P" 2>&1 | tail -1 | sed 's/^/GREEN: /'
            NO_LABEL=1 "$S/land.sh" "$P" 2>&1 | grep -E 'QUEUED|MERGED|DEPLOY|LANDED|ALARM'; exit 0;;
  *TIMEOUT*) echo "Stop: no grid for #$P"; exit 1;;
esac
grep -oE '^\| `[^`]+`' "/tmp/grid-$P.txt" | sort > "/tmp/approved-$P.set"
echo "Grid: $(wc -l < "/tmp/approved-$P.set") pictures"
"$S/visual-then-land.sh" "$P" "/tmp/approved-$P.set" 2>&1
