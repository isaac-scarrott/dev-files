#!/usr/bin/env bash
# SessionStart hook: tell the session its peer name for this run and who the ledger says the merger is.
# Peer names are re-derived on every restart, so a merger's ledger row goes stale unless it re-announces.
# Prints nothing outside a repo that has an orchestration ledger.
input=$(cat)
session_id=$(jq -r '.session_id // empty' <<<"$input")
cwd=$(jq -r '.cwd // empty' <<<"$input")
[ -n "$cwd" ] || exit 0

common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
ledger="$common/orchestration/ledger.md"
[ -f "$ledger" ] || exit 0

name=""
for _ in 1 2 3 4 5; do
    reg=$(grep -l "\"sessionId\":\"$session_id\"" "$HOME"/.claude/sessions/*.json 2>/dev/null | head -1)
    [ -z "$reg" ] && [ -f "$HOME/.claude/sessions/$PPID.json" ] && reg="$HOME/.claude/sessions/$PPID.json"
    [ -n "$reg" ] && name=$(jq -r '.name // empty' "$reg" 2>/dev/null)
    [ -n "$name" ] && break
    sleep 1
done
[ -n "$name" ] || name="(unknown: run ListAgents)"

row=$(grep -E '^\| merger \|' "$ledger" | head -1)
holder=$(awk -F'|' '{gsub(/ /,"",$3); print $3}' <<<"$row")
note=$(awk -F'|' '{sub(/^ +/,"",$8); sub(/ +$/,"",$8); print $8}' <<<"$row")

ledger_py="$HOME/.claude/skills/orchestrator/scripts/ledger.py"
if [ -z "$row" ]; then
    merger_line="The ledger has no merger row."
elif [ "$holder" = "$name" ]; then
    merger_line="The ledger's merger row names you ($holder)."
else
    merger_line="The ledger's merger row names $holder ($note). If you are the merger, re-announce now: python3 $ledger_py set merger holder=$name state=active note=\"seen <UTC time>\". If you hand PRs to the merger and a send to $holder bounces, the row is stale: tell the owner."
fi

context="Your peer name this run is $name. Peer names change on every restart, so any name from before this run is stale. $merger_line"
jq -n --arg c "$context" '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $c}}'
