#!/usr/bin/env bash
# Fetch upstream files listed in vendor.manifest into the repo.
# Manifest format (one entry per line, # for comments):
#   OWNER/REPO REF SRC_PATH DEST_PATH [| TRANSFORM]
# REF can be a branch, tag, or commit SHA — prefer SHAs for stability.
# Optional TRANSFORM (after ` | `) is a filter command; upstream is piped through
# it into DEST, so a file can track upstream AND carry a local change. Use a
# content-based transform (robust to upstream line shifts), e.g.:
#   ...SKILL.md .claude/skills/x/SKILL.md | sed '/^disable-model-invocation:/d'

set -euo pipefail

cd "$(dirname "$0")/.."
MANIFEST="vendor.manifest"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST"; exit 1; }

while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
    # Optional post-fetch transform after a ` | `: upstream is piped through it.
    transform=""
    if [[ "$line" == *"|"* ]]; then
        transform="$(printf '%s' "${line#*|}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        line="${line%%|*}"
    fi
    read -r repo ref src dest <<< "$line"
    url="https://raw.githubusercontent.com/$repo/$ref/$src"
    echo "→ $dest  ($repo@$ref:$src)${transform:+  | $transform}"
    mkdir -p "$(dirname "$dest")"
    if [ -n "$transform" ]; then
        curl -fsSL "$url" | eval "$transform" > "$dest"
    else
        curl -fsSL "$url" -o "$dest"
    fi
done < "$MANIFEST"

echo "done"
