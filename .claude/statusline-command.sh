#!/bin/sh
input=$(cat)

dir=$(echo "$input" | jq -r '.cwd')
short_dir=$(basename "$dir")
session_id=$(echo "$input" | jq -r '.session_id // empty')
remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')
five_hour_used=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week_used=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
effort=$(echo "$input" | jq -r '.effort.level // empty')
thinking=$(echo "$input" | jq -r '.thinking.enabled | if . == null then "" else tostring end')
fast=$(echo "$input" | jq -r '.fast_mode | if . == null then "" else tostring end')
branch=$(git -C "$dir" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)

# The address other sessions message this one by. It lives in the session registry, not in the
# statusline payload, and the registry is keyed by pid, so find the entry by session id.
peer_name=""
if [ -n "$session_id" ]; then
    reg=$(grep -l "\"sessionId\":\"$session_id\"" "$HOME"/.claude/sessions/*.json 2>/dev/null | head -1)
    [ -n "$reg" ] && peer_name=$(jq -r '.name // empty' "$reg" 2>/dev/null)
fi

ESC=$(printf '\033')
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
YELLOW="${ESC}[33m"
GREEN="${ESC}[32m"
RED="${ESC}[31m"
GRAY="${ESC}[90m"
CYAN="${ESC}[36m"

sep="${GRAY} · ${RESET}"

# Green until it's worth knowing, yellow past half, red near the ceiling.
used_color() {
    if [ -z "$1" ]; then
        printf '%s' "$GREEN"
    elif [ "$(printf '%.0f' "$1")" -ge 80 ]; then
        printf '%s' "$RED"
    elif [ "$(printf '%.0f' "$1")" -ge 50 ]; then
        printf '%s' "$YELLOW"
    else
        printf '%s' "$GREEN"
    fi
}

ctx_color="$GREEN"
if [ -n "$remaining" ]; then
    rem_int=$(printf '%.0f' "$remaining")
    if [ "$rem_int" -lt 20 ]; then
        ctx_color="$RED"
    elif [ "$rem_int" -lt 50 ]; then
        ctx_color="$YELLOW"
    fi
fi

# The effort level where the model has one; otherwise thinking shows only when it is on.
if [ -n "$effort" ]; then
    thinking_label="$effort"
elif [ "$thinking" = "true" ]; then
    thinking_label="thinking"
else
    thinking_label=""
fi

model_chip=""
[ -n "$model" ] && model_chip="${CYAN}${model}${RESET}"
[ -n "$model_chip" ] && [ -n "$thinking_label" ] && model_chip="${model_chip} ${DIM}${thinking_label}${RESET}"
[ -z "$model_chip" ] && [ -n "$thinking_label" ] && model_chip="${DIM}${thinking_label}${RESET}"

# The address is usually the directory plus a suffix, so printing both says it twice.
dir_chip="${YELLOW}${BOLD}${short_dir}${RESET}"
case "$peer_name" in
    "$short_dir"-*) dir_chip="" ;;
esac

if [ -n "$peer_name" ]; then
    line="${BOLD}${peer_name}${RESET}"
    [ -n "$dir_chip" ] && line="${line}${sep}${dir_chip}"
else
    line="$dir_chip"
fi
[ -n "$branch" ] && line="${line}${sep}${GREEN}${branch}${RESET}"
[ -n "$model_chip" ] && line="${line}${sep}${model_chip}"
[ "$fast" = "true" ] && line="${line}${sep}${DIM}fast${RESET}"
[ -n "$remaining" ] && line="${line}${sep}${DIM}ctx${RESET} ${ctx_color}$(printf '%.0f' "$remaining")%${RESET}"
[ -n "$five_hour_used" ] && line="${line}${sep}${DIM}5h${RESET} $(used_color "$five_hour_used")$(printf '%.0f' "$five_hour_used")%${RESET}"
[ -n "$week_used" ] && line="${line}${sep}${DIM}wk${RESET} $(used_color "$week_used")$(printf '%.0f' "$week_used")%${RESET}"

printf "%s" "$line"
