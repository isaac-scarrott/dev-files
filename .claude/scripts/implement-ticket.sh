#!/usr/bin/env bash
#
# implement-ticket — Orchestrate Claude Code instances to implement a Linear ticket.
#
# For each subtask of the given Linear ticket, this script:
#   1. Creates a git worktree on a fresh feature branch (stacked off the previous subtask).
#   2. Spawns a dedicated `claude -p` instance in that worktree.
#   3. Lets the instance implement the subtask, run a dynamic multi-round
#      reviewer loop (spawning subagents it picks per diff), and open a PR.
#
# Usage: implement-ticket <TICKET-ID> [--repo <path>] [--base <branch>] [--model <model>]
#
# Notes:
#   * Source of truth lives in ~/.claude/scripts/ — edit there, not via the PATH shim.
#   * Reviewers are dynamic per subtask, chosen by the spawned instance from its diff.
#   * Subtasks run SEQUENTIALLY with stacked branches.
#   * Uses --dangerously-skip-permissions — runs are fully unattended.

set -euo pipefail

# ---- args ----
TICKET_ID=""
REPO_PATH="$PWD"
BASE_BRANCH=""
MODEL="opus"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo) REPO_PATH="$2"; shift 2 ;;
        --base) BASE_BRANCH="$2"; shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*) echo "Unknown flag: $1" >&2; exit 2 ;;
        *)
            if [[ -z "$TICKET_ID" ]]; then
                TICKET_ID="$1"; shift
            else
                echo "Unexpected arg: $1" >&2; exit 2
            fi
            ;;
    esac
done

if [[ -z "$TICKET_ID" ]]; then
    echo "Usage: implement-ticket <TICKET-ID> [--repo <path>] [--base <branch>] [--model <model>]" >&2
    exit 2
fi

# ---- deps ----
for bin in claude gh git jq; do
    command -v "$bin" >/dev/null || { echo "Missing dependency: $bin" >&2; exit 1; }
done

# ---- repo context ----
cd "$REPO_PATH"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not inside a git repo: $REPO_PATH" >&2; exit 1
fi
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ -z "$BASE_BRANCH" ]]; then
    BASE_BRANCH="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || true)"
    BASE_BRANCH="${BASE_BRANCH:-master}"
fi

# ---- run identifiers ----
RUN_TS="$(date +%Y%m%d-%H%M%S)"
RUN_ID="${TICKET_ID}-${RUN_TS}"
LOG_DIR="$HOME/.claude/logs/implement-ticket/$RUN_ID"
mkdir -p "$LOG_DIR"
TICKET_JSON="$LOG_DIR/ticket.json"

SCRIPT_DIR="$HOME/.claude/scripts"
IMPL_PROMPT_FILE="$SCRIPT_DIR/implementer-prompt.md"
if [[ ! -f "$IMPL_PROMPT_FILE" ]]; then
    echo "Missing implementer prompt: $IMPL_PROMPT_FILE" >&2; exit 1
fi
IMPL_PROMPT="$(cat "$IMPL_PROMPT_FILE")"

log() { printf '[orchestrator %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "Run ID: $RUN_ID"
log "Repo: $REPO_ROOT"
log "Base branch: $BASE_BRANCH"
log "Log dir: $LOG_DIR"

# ---- fetch ticket + subtasks via Linear MCP ----
log "Fetching $TICKET_ID and children via Linear MCP..."

FETCH_LOG="$LOG_DIR/fetch.log"
FETCH_RAW="$LOG_DIR/fetch.raw.json"

FETCH_PROMPT="Use the Linear MCP tools (\`mcp__linear-server__get_issue\` and \`mcp__linear-server__list_issues\`) to fetch Linear issue \`$TICKET_ID\` and ALL its direct sub-issues.

Output exactly one JSON object and nothing else — no prose, no markdown fences, no preamble, no trailing commentary. The JSON must match this shape:

{
  \"parent\": {
    \"id\": \"...\",
    \"identifier\": \"$TICKET_ID\",
    \"title\": \"...\",
    \"url\": \"...\",
    \"description\": \"...\"
  },
  \"subtasks\": [
    {
      \"id\": \"...\",
      \"identifier\": \"...\",
      \"title\": \"...\",
      \"url\": \"...\",
      \"description\": \"...\",
      \"createdAt\": \"...\"
    }
  ]
}

Rules: order subtasks by createdAt ascending; use \`\"subtasks\": []\` when there are none; \`description\` may be empty string but must be present."

JQ_ERR="$LOG_DIR/fetch.jq.err"

fetch_ticket() {
    printf '%s' "$FETCH_PROMPT" | claude -p \
        --dangerously-skip-permissions \
        --model sonnet \
        --output-format json \
        > "$FETCH_RAW" 2>"$FETCH_LOG"
}

attempt=0
while (( attempt < 3 )); do
    attempt=$((attempt + 1))
    if ! fetch_ticket; then
        log "Fetch attempt $attempt failed (claude CLI exited non-zero). Retrying..."
        continue
    fi
    jq -r '.result' "$FETCH_RAW" 2>/dev/null \
        | sed -E '/^[[:space:]]*```([a-zA-Z]+)?[[:space:]]*$/d' \
        > "$TICKET_JSON"
    # Structural validation AND empty-stderr (jq empty exits 0 on parse errors in some versions)
    if jq -e 'has("parent") and has("subtasks")' "$TICKET_JSON" >/dev/null 2>"$JQ_ERR" \
         && ! [[ -s "$JQ_ERR" ]]; then
        break
    fi
    log "Fetch attempt $attempt returned invalid JSON. Retrying..."
    [[ -f "$JQ_ERR" ]] && head -3 "$JQ_ERR" >&2
done

if ! jq -e 'has("parent") and has("subtasks")' "$TICKET_JSON" >/dev/null 2>"$JQ_ERR" \
     || [[ -s "$JQ_ERR" ]]; then
    echo "Fetched ticket JSON is not valid after $attempt attempts." >&2
    echo "--- stderr ---" >&2
    [[ -f "$JQ_ERR" ]] && cat "$JQ_ERR" >&2
    echo "--- Claude reply ---" >&2
    jq -r '.result' "$FETCH_RAW" 2>/dev/null >&2 || cat "$FETCH_RAW" >&2
    echo "--- end ---" >&2
    echo "Raw wrapper: $FETCH_RAW" >&2
    exit 1
fi

PARENT_TITLE="$(jq -r '.parent.title' "$TICKET_JSON")"
PARENT_URL="$(jq -r '.parent.url' "$TICKET_JSON")"
PARENT_DESC="$(jq -r '.parent.description' "$TICKET_JSON")"
SUBTASK_COUNT="$(jq '.subtasks | length' "$TICKET_JSON")"

log "Parent: $PARENT_TITLE"
log "Subtasks: $SUBTASK_COUNT"

if [[ "$SUBTASK_COUNT" -eq 0 ]]; then
    log "No subtasks — nothing to orchestrate. Exiting."
    exit 0
fi

# ---- sync base ----
log "Fetching origin/$BASE_BRANCH..."
git fetch origin "$BASE_BRANCH" --quiet

PREV_BRANCH="origin/$BASE_BRANCH"
PR_URLS=()

# ---- per-subtask loop ----
for i in $(seq 0 $((SUBTASK_COUNT - 1))); do
    SUB_JSON="$(jq -c ".subtasks[$i]" "$TICKET_JSON")"
    SUB_ID="$(echo "$SUB_JSON" | jq -r '.identifier')"
    SUB_TITLE="$(echo "$SUB_JSON" | jq -r '.title')"
    SUB_URL="$(echo "$SUB_JSON" | jq -r '.url')"
    SUB_DESC="$(echo "$SUB_JSON" | jq -r '.description')"

    SLUG="$(echo "$SUB_TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//;s/-*$//' | cut -c1-50 | sed 's/-*$//')"
    BRANCH="$(echo "$SUB_ID" | tr '[:upper:]' '[:lower:]')-${SLUG}"
    WORKTREE="${REPO_ROOT%/*}/wt-${BRANCH}"

    echo
    log "=== Subtask $((i+1))/$SUBTASK_COUNT: $SUB_ID — $SUB_TITLE ==="
    log "Branch: $BRANCH (off $PREV_BRANCH)"
    log "Worktree: $WORKTREE"

    # Resume support: if an open PR already exists for this branch name, skip the subtask
    # and stack the next one on top of it.
    EXISTING_PR="$(gh pr list --state open --head "$BRANCH" --json url --jq '.[0].url' 2>/dev/null || true)"
    if [[ -n "$EXISTING_PR" ]]; then
        log "Skipping $SUB_ID — PR already open: $EXISTING_PR"
        PR_URLS+=("$SUB_ID: $EXISTING_PR (skipped, already open)")
        PREV_BRANCH="$BRANCH"
        continue
    fi

    # No PR yet. Refuse to silently clobber a half-finished attempt.
    if [[ -e "$WORKTREE" ]] || git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        echo "Stale state for $SUB_ID — worktree ($WORKTREE) or branch ($BRANCH) exists but no open PR." >&2
        echo "Either finish/ship it manually, or clean up and rerun:" >&2
        echo "  git worktree remove $WORKTREE --force" >&2
        echo "  git branch -D $BRANCH" >&2
        exit 1
    fi

    git worktree add "$WORKTREE" -b "$BRANCH" "$PREV_BRANCH"

    # Build context JSON for the implementer
    CONTEXT_JSON="$(jq -n \
        --arg parent_id   "$TICKET_ID" \
        --arg parent_title "$PARENT_TITLE" \
        --arg parent_url  "$PARENT_URL" \
        --arg parent_desc "$PARENT_DESC" \
        --arg sub_id      "$SUB_ID" \
        --arg sub_title   "$SUB_TITLE" \
        --arg sub_url     "$SUB_URL" \
        --arg sub_desc    "$SUB_DESC" \
        --arg base        "$PREV_BRANCH" \
        --arg base_human  "$( [[ "$PREV_BRANCH" == origin/* ]] && echo "${PREV_BRANCH#origin/}" || echo "$PREV_BRANCH" )" \
        --arg branch      "$BRANCH" \
        --arg worktree    "$WORKTREE" \
        '{
          parent_id: $parent_id,
          parent_title: $parent_title,
          parent_url: $parent_url,
          parent_description: $parent_desc,
          subtask_id: $sub_id,
          subtask_title: $sub_title,
          subtask_url: $sub_url,
          subtask_description: $sub_desc,
          base_branch: $base,
          base_branch_local: $base_human,
          branch: $branch,
          worktree: $worktree
        }')"

    USER_PROMPT="\`\`\`json
$CONTEXT_JSON
\`\`\`

Your cwd is the worktree \`$WORKTREE\` on branch \`$BRANCH\`, forked from \`$PREV_BRANCH\`. Begin."

    SUB_LOG="$LOG_DIR/${SUB_ID}.log"
    SUB_ERR="$LOG_DIR/${SUB_ID}.stderr"
    log "Launching implementer (log: $SUB_LOG) — this will take a while..."

    (
        cd "$WORKTREE"
        claude \
            --dangerously-skip-permissions \
            --model "$MODEL" \
            --append-system-prompt "$IMPL_PROMPT" \
            --output-format stream-json --verbose \
            -p "$USER_PROMPT" \
            2> "$SUB_ERR" \
            | tee "$SUB_LOG" \
            | jq -rc --unbuffered '
                if .type == "assistant" and ((.message.content // []) | type == "array") then
                    .message.content[]?
                    | if .type == "text" then "[claude] " + ((.text // "") | gsub("\n"; " ") | .[0:260])
                      elif .type == "tool_use" then "[tool:" + .name + "] " + ((.input // {}) | tostring | .[0:220])
                      else empty end
                elif .type == "user" and ((.message.content // []) | type == "array") then
                    .message.content[]?
                    | if .type == "tool_result" then
                          "[result] " + (if (.is_error == true) then "ERROR " else "" end)
                          + ((.content | if type == "string" then . else tostring end) | gsub("\n"; " ") | .[0:220])
                      else empty end
                elif .type == "system" then "[system] " + (.subtype // "")
                elif .type == "result" then "[done] " + (.subtype // "") + " duration=" + ((.duration_ms // 0) | tostring) + "ms cost=$" + ((.total_cost_usd // 0) | tostring)
                else empty end
            ' 2>/dev/null
    )

    # Try to extract the PR URL from the log for the summary
    PR_URL="$(grep -Eo 'https://github\.com/[^ ]+/pull/[0-9]+' "$SUB_LOG" | tail -1 || true)"
    if [[ -n "$PR_URL" ]]; then
        log "PR: $PR_URL"
        PR_URLS+=("$SUB_ID: $PR_URL")
    else
        log "WARNING: could not detect PR URL in log — check $SUB_LOG"
        PR_URLS+=("$SUB_ID: (PR URL not detected — see $SUB_LOG)")
    fi

    # Next subtask branches off this one (stacked PRs)
    PREV_BRANCH="$BRANCH"
done

echo
log "All $SUBTASK_COUNT subtask(s) complete."
log "PRs:"
for line in "${PR_URLS[@]}"; do
    printf '  - %s\n' "$line"
done
log "Logs: $LOG_DIR"
