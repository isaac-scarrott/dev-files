# Sourced by the stack scripts. State lives outside any session scratchpad so a crash doesn't lose it:
#   $STATE/stack.txt      "<pr> <branch>" per line, bottom → top
#   $STATE/wt.*           each run's own detached worktree (never checks out a branch), removed on exit,
#                         so concurrent scripts never merge or check out under each other
#   $STATE/conflict-<pr>  a run's worktree kept, mid-merge, for a conflict someone has to resolve
#   $STATE/unstick.{log,done}
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
trunk=${TRUNK:-$(gh repo view "$R" --json defaultBranchRef -q .defaultBranchRef.name)}
STATE=${MERGER_STATE:-$HOME/.claude/orchestrator-state/merger/${R//\//-}}
ST=$STATE/stack.txt; WT=""; mkdir -p "$STATE"; touch "$ST"
CI_WORKFLOW=${CI_WORKFLOW:-ci.yml}
QUIET=$STATE/hooks.log   # checkout/merge hooks (installs, codegen) write here, not to the caller
ensure_wt() {
  [ -n "$WT" ] && return 0
  COMMON=$(git rev-parse --path-format=absolute --git-common-dir)
  WT=$(mktemp -d "$STATE/wt.XXXXXX"); trap 'drop_wt $?' EXIT
  git worktree add -q --detach "$WT" "origin/$trunk" >>"$QUIET" 2>&1
}
# use_wt <dir>: adopt a kept conflict worktree; it's removed on exit only if the run succeeds
use_wt() { WT=$1; COMMON=$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir); trap 'drop_wt $?' EXIT; }
drop_wt() {
  [ -d "$WT" ] || return 0
  case "$WT" in */conflict-*) [ "$1" -ne 0 ] && return 0 ;; esac
  cd "$STATE" && rm -rf "$WT" && git --git-dir="$COMMON" worktree prune
}
# keep_wt <pr>: keep this run's worktree, merge in progress, as $STATE/conflict-<pr>, and print where
keep_wt() {
  cd "$STATE" && git --git-dir="$COMMON" worktree move "$WT" "$STATE/conflict-$1" && WT=$STATE/conflict-$1 && echo "KEPT $WT"
}
# ensure_ci <pr>: a head pushed while the PR's base wasn't trunk never triggered CI. Once the PR is in
# the stack, an empty commit makes CI run against the stack base.
ensure_ci() {
  local p=$1 b h
  b=$(gh pr view "$p" --repo "$R" --json headRefName,headRefOid --jq '"\(.headRefName) \(.headRefOid)"'); h=${b#* }; b=${b% *}
  sleep 15
  [ -n "$(gh run list --repo "$R" --commit "$h" --workflow "$CI_WORKFLOW" --limit 1 --json databaseId --jq '.[].databaseId')" ] && return 0
  ensure_wt; (cd "$WT" && git fetch -q origin "$b" && git checkout -q --detach "origin/$b" >>"$QUIET" 2>&1 \
    && git commit -q --allow-empty --no-verify -m "ci: run CI now that this PR sits in the stack" \
    && git push -q origin "HEAD:refs/heads/$b") && echo "CI TRIGGERED #$p (empty commit)"
}
