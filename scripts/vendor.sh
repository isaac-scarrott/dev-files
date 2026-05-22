#!/usr/bin/env bash
# Fetch upstream files listed in vendor.manifest into the repo.
# Manifest format (one entry per line, # for comments):
#   OWNER/REPO REF SRC_PATH DEST_PATH
# REF can be a branch, tag, or commit SHA — prefer SHAs for stability.

set -euo pipefail

cd "$(dirname "$0")/.."
MANIFEST="vendor.manifest"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST"; exit 1; }

while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
    read -r repo ref src dest <<< "$line"
    url="https://raw.githubusercontent.com/$repo/$ref/$src"
    echo "→ $dest  ($repo@$ref:$src)"
    mkdir -p "$(dirname "$dest")"
    curl -fsSL "$url" -o "$dest"
done < "$MANIFEST"

echo "done"
