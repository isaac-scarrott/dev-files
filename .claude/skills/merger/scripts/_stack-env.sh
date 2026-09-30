# Sourced by the stack scripts. State lives outside any session scratchpad so a crash doesn't lose it:
#   $STATE/stack.txt      "<pr> <branch>" per line, bottom → top
#   $STATE/wt             detached worktree used for merges (never checks out a branch)
#   $STATE/unstick.{log,done}
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
trunk=${TRUNK:-$(gh repo view "$R" --json defaultBranchRef -q .defaultBranchRef.name)}
STATE=${MERGER_STATE:-$HOME/.claude/orchestrator-state/merger/${R//\//-}}
ST=$STATE/stack.txt; WT=$STATE/wt; mkdir -p "$STATE"; touch "$ST"
CI_WORKFLOW=${CI_WORKFLOW:-ci.yml}
QUIET=$STATE/hooks.log   # checkout/merge hooks (installs, codegen) write here, not to the caller
ensure_wt() { [ -d "$WT" ] || git worktree add -q --detach "$WT" "origin/$trunk" >>"$QUIET" 2>&1; }
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
