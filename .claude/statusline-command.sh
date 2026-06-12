#!/bin/sh
input=$(cat)

dir=$(echo "$input" | jq -r '.cwd')
short_dir=$(basename "$dir")
remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')
five_hour_used=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
branch=$(git -C "$dir" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)

ESC=$(printf '\033')
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
YELLOW="${ESC}[33m"
GREEN="${ESC}[32m"
RED="${ESC}[31m"
GRAY="${ESC}[90m"

sep="${GRAY} · ${RESET}"

ctx_color="$GREEN"
if [ -n "$remaining" ]; then
    rem_int=$(printf '%.0f' "$remaining")
    if [ "$rem_int" -lt 20 ]; then
        ctx_color="$RED"
    elif [ "$rem_int" -lt 50 ]; then
        ctx_color="$YELLOW"
    fi
fi

fh_color="$GREEN"
if [ -n "$five_hour_used" ]; then
    used_int=$(printf '%.0f' "$five_hour_used")
    if [ "$used_int" -ge 80 ]; then
        fh_color="$RED"
    elif [ "$used_int" -ge 50 ]; then
        fh_color="$YELLOW"
    fi
fi

line="${YELLOW}${BOLD}${short_dir}${RESET}"
[ -n "$branch" ] && line="${line}${sep}${GREEN}${branch}${RESET}"
[ -n "$remaining" ] && line="${line}${sep}${DIM}ctx${RESET} ${ctx_color}$(printf '%.0f' "$remaining")%${RESET}"
[ -n "$five_hour_used" ] && line="${line}${sep}${DIM}5h${RESET} ${fh_color}$(printf '%.0f' "$five_hour_used")%${RESET}"

printf "%s" "$line"
