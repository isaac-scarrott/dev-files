#!/usr/bin/env bash
# Reclaim this repo's worktrees whose branch's PR has merged or closed.
# usage: reclaim-worktrees.sh [--dry-run]   (run from anywhere inside the repo)
#
# session-start.sh fires this in the background at most once every 6 hours, so a killed session's
# worktrees still get reclaimed. Kept: the main checkout, open PRs, branches with no PR, detached
# HEADs, anything touched in the last 6 hours, and anything a process is inside.
# Uncommitted edits are saved first to ~/.claude/worktree-salvage/<name>.patch (+ -untracked.tgz);
# leftover screenshot captures (.shots/, tmp-shots/, .scratch/, *.png) are not salvaged.
# Branches are never deleted. Log: <git-common-dir>/orchestration/reclaim.log
set -u
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
main=$(dirname "$common")
log="$common/orchestration/reclaim.log"; mkdir -p "$(dirname "$log")"
salvage="$HOME/.claude/worktree-salvage"; mkdir -p "$salvage"
junk='(^|/)(\.shots|tmp-shots|\.scratch)(/|$)|\.png$'
say() { echo "$(date -u +%FT%TZ) $*" | tee -a "$log"; }

prs=$(gh pr list --state all --limit 2000 --json headRefName,state \
  --jq '.[] | "\(.headRefName)\t\(.state)"' 2>/dev/null) || { say "gh failed; nothing reclaimed"; exit 1; }
busy=$(lsof -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')

state_of() { # OPEN wins over any older merged/closed PR on the same branch
  awk -F'\t' -v b="$1" '$1==b{s=$2; if (s=="OPEN") {print s; f=1; exit} last=s} END{if(!f && last) print last}' <<<"$prs"
}

git worktree list --porcelain | awk '/^worktree /{w=substr($0,10)} /^branch /{b=substr($0,8); sub("refs/heads/","",b); print w"\t"b}' |
while IFS=$'\t' read -r w b; do
  [ "$w" = "$main" ] && continue
  s=$(state_of "$b"); case "$s" in MERGED|CLOSED) ;; *) continue ;; esac
  [ -d "$w" ] || continue
  [ -n "$(find "$w" -maxdepth 0 -mmin -360)" ] && continue
  grep -qxF -- "$w" <<<"$busy" && continue
  grep -qF -- "$w/" <<<"$busy" && continue
  if [ $dry = 1 ]; then say "WOULD REMOVE $w ($b, $s)"; continue; fi
  real=$(git -C "$w" status --porcelain | grep -vE "^\?\? .*($junk)" | grep -v '^ D')
  if [ -n "$real" ]; then
    tag="$(basename "$w")-$(date +%Y%m%d%H%M%S)"
    git -C "$w" diff HEAD --binary | { printf '# worktree %s\n# branch %s\n' "$w" "$b"; cat; } > "$salvage/$tag.patch"
    untracked=$(grep '^??' <<<"$real" | cut -c4-)
    [ -n "$untracked" ] && (cd "$w" && tr '\n' '\0' <<<"$untracked" | xargs -0 tar -czf "$salvage/$tag-untracked.tgz" --exclude node_modules)
    say "SALVAGED $w -> $salvage/$tag.*"
  fi
  if git -C "$main" worktree remove --force "$w" 2>>"$log"; then say "REMOVED $w ($b, $s)"; else say "FAILED $w"; fi
done
git -C "$main" worktree prune
