#!/usr/bin/env bash
# embed-shots.sh <pr> <body-file> <shots-dir>
# Uploads every `.shots/NAME.png` the body references (written in backticks), swaps each for a sized
# <img>, and PATCHes the PR body through the API (gh pr edit fails silently on repos with classic
# Projects). Names containing 390, phone or mobile get width 260; the rest get 460.
set -euo pipefail
pr=$1; body=$2; dir=$3
R=${GH_REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}
upload="$HOME/.claude/skills/github-image-upload/scripts/upload-asset.sh"
for name in $(grep -o '\.shots/[A-Za-z0-9_.-]*\.png' "$body" | sort -u); do
  file="$dir/${name#.shots/}"
  [ -f "$file" ] || { echo "missing $file" >&2; continue; }
  url=$("$upload" "$R" "$file" | tail -1)
  width=460
  case "$name" in *390*|*phone*|*mobile*) width=260 ;; esac
  python3 - "$body" "$name" "$url" "$width" <<'PY'
import sys
path, name, url, width = sys.argv[1:]
text = open(path).read().replace("`" + name + "`", f'<img src="{url}" width="{width}">')
open(path, "w").write(text)
PY
done
gh api -X PATCH "repos/$R/pulls/$pr" -F body=@"$body" --jq .html_url
