#!/usr/bin/env bash
#
# implement-ticket-folder — Orchestrate Claude Code instances to implement a folder of markdown tickets.
#
#
# Mirrors implement-ticket.sh but reads its parent + subtasks from a directory of
# markdown files instead of Linear:
#   <FOLDER>/README.md           — parent epic (frontmatter: id, title, type: epic)
#   <FOLDER>/01-*.md, 02-*.md…   — sub-tasks (frontmatter: id, title, type, phase, status, …)
#
# For each subtask of the given folder, this script:
#   1. Creates a git worktree on a fresh feature branch (stacked off the previous subtask).
#   2. Spawns a dedicated `claude -p` instance in that worktree.
#   3. Lets the instance implement the subtask and run a dynamic multi-round
#      reviewer loop (spawning subagents it picks per diff).
#   4. The implementer COMMITS LOCALLY ONLY. Nothing is pushed; no PR is opened.
#   5. Writes the resulting branch into the source markdown frontmatter.
#
# Usage: implement-ticket-folder <FOLDER> [--repo <path>] [--base <branch>]
#                                        [--model <model>] [--phase <n>] [--start <id>]
#
# Notes:
#   * Source of truth lives in ~/.claude/scripts/ — edit there, not via the PATH shim.
#   * Reviewers are dynamic per subtask, chosen by the spawned instance from its diff.
#   * Subtasks run SEQUENTIALLY with stacked branches (off the previous subtask's branch).
#   * Uses --dangerously-skip-permissions — runs are fully unattended.
#   * Tickets with status: implemented / done / merged in their frontmatter are skipped.

set -euo pipefail

# ---- args ----
FOLDER=""
REPO_PATH="$PWD"
BASE_BRANCH=""
MODEL="claude-opus-4-7"
PHASE_FILTER=""
START_FROM=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo) REPO_PATH="$2"; shift 2 ;;
        --base) BASE_BRANCH="$2"; shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        --phase) PHASE_FILTER="$2"; shift 2 ;;
        --start) START_FROM="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        -*) echo "Unknown flag: $1" >&2; exit 2 ;;
        *)
            if [[ -z "$FOLDER" ]]; then
                FOLDER="$1"; shift
            else
                echo "Unexpected arg: $1" >&2; exit 2
            fi
            ;;
    esac
done

if [[ -z "$FOLDER" ]]; then
    echo "Usage: implement-ticket-folder <FOLDER> [--repo <path>] [--base <branch>] [--model <model>] [--phase <n>] [--start <id>]" >&2
    exit 2
fi

if [[ ! -d "$FOLDER" ]]; then
    echo "Folder not found: $FOLDER" >&2; exit 1
fi
FOLDER="$(cd "$FOLDER" && pwd)"

PARENT_FILE="$FOLDER/README.md"
if [[ ! -f "$PARENT_FILE" ]]; then
    echo "No README.md in folder: $FOLDER" >&2; exit 1
fi

# ---- deps ----
for bin in claude git jq python3; do
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

# ---- frontmatter helpers (python3, no PyYAML required) ----
fm_get() {
    # fm_get <file> <key> — print scalar value from YAML frontmatter, or empty.
    python3 - "$1" "$2" <<'PY'
import sys, re
path, key = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()
m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
if not m:
    sys.exit(0)
for line in m.group(1).splitlines():
    line = line.rstrip()
    if not line or line.startswith("#"):
        continue
    if ":" not in line:
        continue
    k, _, v = line.partition(":")
    if k.strip() == key:
        v = v.strip()
        # strip optional surrounding quotes
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        # treat ~/null/empty as empty string
        if v in ("~", "null", ""):
            v = ""
        print(v)
        break
PY
}

fm_set() {
    # fm_set <file> <key> <value> — upsert a scalar field in the frontmatter, in-place.
    python3 - "$1" "$2" "$3" <<'PY'
import sys, re
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "r", encoding="utf-8") as f:
    text = f.read()
m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
if not m:
    sys.exit("no frontmatter in " + path)
fm, body = m.group(1), text[m.end():]
lines = fm.splitlines()
new_line = f"{key}: {value}" if value else f"{key}: ~"
replaced = False
for i, line in enumerate(lines):
    if ":" in line:
        k = line.split(":", 1)[0].strip()
        if k == key:
            lines[i] = new_line
            replaced = True
            break
if not replaced:
    lines.append(new_line)
new_fm = "\n".join(lines)
with open(path, "w", encoding="utf-8") as f:
    f.write("---\n" + new_fm + "\n---\n" + body)
PY
}

# ---- read parent ----
PARENT_ID="$(fm_get "$PARENT_FILE" id)"
PARENT_TITLE="$(fm_get "$PARENT_FILE" title)"
PARENT_TYPE="$(fm_get "$PARENT_FILE" type)"
if [[ -z "$PARENT_ID" || -z "$PARENT_TITLE" ]]; then
    echo "$PARENT_FILE missing required frontmatter (id, title)" >&2
    exit 1
fi
if [[ "$PARENT_TYPE" != "epic" ]]; then
    echo "Warning: $PARENT_FILE has type=$PARENT_TYPE (expected 'epic')" >&2
fi
PARENT_DESC="$(awk 'BEGIN{n=0} /^---[[:space:]]*$/{n++; next} n>=2{print}' "$PARENT_FILE")"

# ---- collect subtasks (sorted by filename, which doubles as the natural order) ----
SUBTASK_FILES=()
while IFS= read -r f; do
    SUBTASK_FILES+=("$f")
done < <(find "$FOLDER" -maxdepth 1 -type f -name '[0-9]*-*.md' -print | sort)

if [[ ${#SUBTASK_FILES[@]} -eq 0 ]]; then
    echo "No subtask files matching '[0-9]*-*.md' in $FOLDER" >&2
    exit 1
fi

# ---- run identifiers ----
RUN_TS="$(date +%Y%m%d-%H%M%S)"
RUN_ID="${PARENT_ID}-${RUN_TS}"
LOG_DIR="$HOME/.claude/logs/implement-ticket-folder/$RUN_ID"
mkdir -p "$LOG_DIR"

SCRIPT_DIR="$HOME/.claude/scripts"
IMPL_PROMPT_FILE="$SCRIPT_DIR/implementer-prompt-folder.md"
if [[ ! -f "$IMPL_PROMPT_FILE" ]]; then
    echo "Missing implementer prompt: $IMPL_PROMPT_FILE" >&2; exit 1
fi
IMPL_PROMPT="$(cat "$IMPL_PROMPT_FILE")"

log() { printf '[orchestrator %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

log "Run ID: $RUN_ID"
log "Folder: $FOLDER"
log "Parent: $PARENT_ID — $PARENT_TITLE"
log "Repo: $REPO_ROOT"
log "Base branch: $BASE_BRANCH"
log "Model: $MODEL"
[[ -n "$PHASE_FILTER" ]] && log "Phase filter: $PHASE_FILTER"
[[ -n "$START_FROM"   ]] && log "Start from: $START_FROM"
log "Log dir: $LOG_DIR"
log "Subtask files found: ${#SUBTASK_FILES[@]}"

# ---- sync base ----
log "Fetching origin/$BASE_BRANCH..."
git fetch origin "$BASE_BRANCH" --quiet

PREV_BRANCH="origin/$BASE_BRANCH"
RESULT_LINES=()
SKIPPED_REACHED_START=false
[[ -z "$START_FROM" ]] && SKIPPED_REACHED_START=true

# ---- per-subtask loop ----
for SUB_FILE in "${SUBTASK_FILES[@]}"; do
    SUB_ID="$(fm_get "$SUB_FILE" id)"
    SUB_TITLE="$(fm_get "$SUB_FILE" title)"
    SUB_PHASE="$(fm_get "$SUB_FILE" phase)"
    SUB_STATUS="$(fm_get "$SUB_FILE" status)"
    SUB_PARENT="$(fm_get "$SUB_FILE" parent)"

    if [[ -z "$SUB_ID" || -z "$SUB_TITLE" ]]; then
        log "Skipping $SUB_FILE — missing id or title in frontmatter"
        continue
    fi

    # --start filter (skip until the named id is reached, then process inclusive)
    if [[ "$SKIPPED_REACHED_START" != "true" ]]; then
        if [[ "$SUB_ID" == "$START_FROM" ]]; then
            SKIPPED_REACHED_START=true
        else
            log "Skipping $SUB_ID — before --start $START_FROM"
            continue
        fi
    fi

    # --phase filter
    if [[ -n "$PHASE_FILTER" && "$SUB_PHASE" != "$PHASE_FILTER" ]]; then
        log "Skipping $SUB_ID — phase $SUB_PHASE != $PHASE_FILTER"
        continue
    fi

    # statuses that cause us to skip and move on
    #   implemented / done / merged / pr_open — already shipped; stack on its branch.
    #   blocked / escalated                   — operator marked it as not-now; do not retry.
    case "$SUB_STATUS" in
        implemented|done|merged|pr_open)
            log "Skipping $SUB_ID — status=$SUB_STATUS"
            SUB_BRANCH="$(fm_get "$SUB_FILE" branch)"
            if [[ -n "$SUB_BRANCH" ]] && git show-ref --verify --quiet "refs/heads/$SUB_BRANCH"; then
                PREV_BRANCH="$SUB_BRANCH"
            fi
            RESULT_LINES+=("$SUB_ID: skipped (status=$SUB_STATUS, branch=${SUB_BRANCH:-?})")
            continue
            ;;
        blocked|escalated)
            log "Skipping $SUB_ID — status=$SUB_STATUS (operator-marked, do not retry)"
            RESULT_LINES+=("$SUB_ID: skipped (status=$SUB_STATUS — needs human attention)")
            continue
            ;;
    esac

    # Body of the markdown after the frontmatter — this is the subtask description.
    SUB_DESC="$(awk 'BEGIN{n=0} /^---[[:space:]]*$/{n++; next} n>=2{print}' "$SUB_FILE")"

    SLUG="$(echo "$SUB_TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//;s/-*$//' | cut -c1-50 | sed 's/-*$//')"
    BRANCH="$(echo "$SUB_ID" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//;s/-*$//')-${SLUG}"
    WORKTREE="${REPO_ROOT%/*}/wt-${BRANCH}"

    echo
    log "=== Subtask: $SUB_ID — $SUB_TITLE ==="
    log "Source: $SUB_FILE"
    log "Branch: $BRANCH (off $PREV_BRANCH)"
    log "Worktree: $WORKTREE"

    # Refuse to silently clobber a half-finished attempt.
    # If a branch/worktree exists for this subtask, the user should mark the
    # frontmatter status (implemented / done) themselves — or clean it up.
    if [[ -e "$WORKTREE" ]] || git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        echo "Stale state for $SUB_ID — worktree ($WORKTREE) or branch ($BRANCH) already exists." >&2
        echo "If the previous attempt finished, set 'status: implemented' in $SUB_FILE and rerun." >&2
        echo "Otherwise clean up and rerun:" >&2
        echo "  git worktree remove $WORKTREE --force" >&2
        echo "  git branch -D $BRANCH" >&2
        exit 1
    fi

    git worktree add "$WORKTREE" -b "$BRANCH" "$PREV_BRANCH"
    # Strip any inherited .pr-body.md from the parent subtask's branch — the
    # implementer needs a clean slate and the Write tool rejects overwriting
    # an unread file. (Implementers tend to commit .pr-body.md alongside code.)
    rm -f "$WORKTREE/.pr-body.md"
    fm_set "$SUB_FILE" status "in_progress"
    fm_set "$SUB_FILE" branch "$BRANCH"

    # Build context JSON for the implementer
    CONTEXT_JSON="$(jq -n \
        --arg parent_id    "$PARENT_ID" \
        --arg parent_title "$PARENT_TITLE" \
        --arg parent_file  "$PARENT_FILE" \
        --arg parent_desc  "$PARENT_DESC" \
        --arg sub_id       "$SUB_ID" \
        --arg sub_title    "$SUB_TITLE" \
        --arg sub_file     "$SUB_FILE" \
        --arg sub_phase    "$SUB_PHASE" \
        --arg sub_desc     "$SUB_DESC" \
        --arg base         "$PREV_BRANCH" \
        --arg base_human   "$( [[ "$PREV_BRANCH" == origin/* ]] && echo "${PREV_BRANCH#origin/}" || echo "$PREV_BRANCH" )" \
        --arg branch       "$BRANCH" \
        --arg worktree     "$WORKTREE" \
        --arg ticket_dir   "$FOLDER" \
        '{
          parent_id: $parent_id,
          parent_title: $parent_title,
          parent_file: $parent_file,
          parent_description: $parent_desc,
          subtask_id: $sub_id,
          subtask_title: $sub_title,
          subtask_file: $sub_file,
          subtask_phase: $sub_phase,
          subtask_description: $sub_desc,
          base_branch: $base,
          base_branch_local: $base_human,
          branch: $branch,
          worktree: $worktree,
          ticket_dir: $ticket_dir
        }')"

    USER_PROMPT="\`\`\`json
$CONTEXT_JSON
\`\`\`

Your cwd is the worktree \`$WORKTREE\` on branch \`$BRANCH\`, forked from \`$PREV_BRANCH\`. The full subtask spec lives at \`$SUB_FILE\` (read it directly — its body is the description). Begin."

    SUB_LOG="$LOG_DIR/${SUB_ID}.log"
    SUB_ERR="$LOG_DIR/${SUB_ID}.stderr"
    log "Launching implementer (log: $SUB_LOG) — this will take a while..."

    set +e
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
    IMPL_RC=$?
    set -e

    # Verify the implementer actually committed something to the branch
    COMMIT_COUNT=0
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
        COMMIT_COUNT=$(git rev-list --count "$PREV_BRANCH..$BRANCH" 2>/dev/null || echo 0)
    fi

    if [[ "$IMPL_RC" -eq 0 && "$COMMIT_COUNT" -gt 0 ]]; then
        log "Done: $BRANCH ($COMMIT_COUNT commit(s)) — pushing and opening PR..."

        # Push the implementer's branch to origin
        if ! (cd "$WORKTREE" && git push -u origin "$BRANCH" --quiet) 2>>"$SUB_ERR"; then
            log "WARNING: failed to push $BRANCH — see $SUB_ERR"
            RESULT_LINES+=("$SUB_ID: implemented but push failed — see $SUB_ERR")
            fm_set "$SUB_FILE" status "needs_review"
            PREV_BRANCH="$BRANCH"
            continue
        fi

        # Determine PR base: strip origin/ prefix if present (gh wants a branch name).
        PR_BASE="${PREV_BRANCH#origin/}"

        # Locate the PR body the implementer should have written.
        PR_BODY_FILE="$WORKTREE/.pr-body.md"
        if [[ ! -s "$PR_BODY_FILE" ]]; then
            log "WARNING: no .pr-body.md from implementer; using commit list as fallback body"
            PR_BODY_FILE="$LOG_DIR/${SUB_ID}.pr-body-fallback.md"
            {
                echo "## Commits"
                echo
                (cd "$WORKTREE" && git log --oneline "$PREV_BRANCH..$BRANCH")
                echo
                echo "_Generated by orchestrator (implementer did not write .pr-body.md)._"
            } > "$PR_BODY_FILE"
        fi

        PR_TITLE="[$SUB_ID] $SUB_TITLE"
        PR_URL="$(cd "$WORKTREE" && gh pr create \
            --title "$PR_TITLE" \
            --body-file "$PR_BODY_FILE" \
            --base "$PR_BASE" \
            --head "$BRANCH" 2>>"$SUB_ERR")" || PR_URL=""

        if [[ -n "$PR_URL" ]]; then
            log "PR opened: $PR_URL"
            RESULT_LINES+=("$SUB_ID: $PR_URL ($COMMIT_COUNT commits)")
            fm_set "$SUB_FILE" status "pr_open"
            fm_set "$SUB_FILE" pr_url "$PR_URL"
        else
            log "WARNING: PR creation failed for $BRANCH — see $SUB_ERR"
            RESULT_LINES+=("$SUB_ID: implemented and pushed, but PR creation failed — see $SUB_ERR")
            fm_set "$SUB_FILE" status "needs_review"
        fi
    elif [[ "$IMPL_RC" -ne 0 ]]; then
        log "WARNING: implementer exited non-zero ($IMPL_RC) — check $SUB_LOG / $SUB_ERR"
        RESULT_LINES+=("$SUB_ID: implementer failed (exit=$IMPL_RC) — see $SUB_LOG")
        fm_set "$SUB_FILE" status "needs_review"
    else
        log "WARNING: no commits on $BRANCH — check $SUB_LOG"
        RESULT_LINES+=("$SUB_ID: no commits — see $SUB_LOG")
        fm_set "$SUB_FILE" status "needs_review"
    fi

    # Next subtask branches off this one (stacked branches, all local)
    PREV_BRANCH="$BRANCH"
done

echo
log "All subtask(s) complete."
log "Results:"
for line in "${RESULT_LINES[@]}"; do
    printf '  - %s\n' "$line"
done
log "Logs: $LOG_DIR"
echo
log "Nothing has been pushed. Branches and worktrees are local only."
log "To list them:    git worktree list"
log "To inspect one:  cd <worktree> && git log --oneline"
