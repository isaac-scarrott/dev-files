#!/usr/bin/env bash
# land-list.sh <pr> [<pr>...]: land owner-approved PRs one at a time, in the order given.
# For each: skip if not open or draft; stop the whole list on a conflict (DIRTY after a local test
# merge shows real conflicts) or a failed land, so a human can look. Prints short lines for a monitor.
# Safe to re-run: merged PRs are skipped. Never force-pushes, never closes anything.
set -u
S=$(cd "$(dirname "$0")" && pwd); R=${R:-holibob/holibob}
for P in "$@"; do
  st=$(gh pr view "$P" --repo "$R" --json state,isDraft -q '.state+" "+(.isDraft|tostring)')
  case "$st" in "MERGED "*) echo "Skip #$P: already merged"; continue;; "OPEN false") ;; *) echo "Stop at #$P: $st"; exit 1;; esac
  echo "Start #$P"
  "$S/authorise.sh" "$P" 2>&1 | tail -1
  w=$("$S/wait-green.sh" "$P" 2>&1 | tail -1); echo "GREEN? #$P: $w"
  case "$w" in GREEN*) ;; *) echo "Stop at #$P: not green ($w)"; exit 1;; esac
  out=$("$S/land.sh" "$P" 2>&1 | grep -E 'QUEUED|MERGED|DEPLOY|LANDED|ALARM')
  echo "$out" | sed "s/^/#$P /"
  case "$out" in *"LANDED "*) echo "Landed #$P";; *) echo "Stop at #$P: did not land"; exit 1;; esac
done
echo "List done"
