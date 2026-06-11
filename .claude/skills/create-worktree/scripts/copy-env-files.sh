#!/usr/bin/env bash
# Copy gitignored .env / .env.* files from the main repo into a worktree,
# preserving relative paths. Skips dependency and build-output directories.
set -euo pipefail

MAIN="${1:?usage: copy-env-files.sh <main-repo-root> <worktree-path>}"
DEST="${2:?usage: copy-env-files.sh <main-repo-root> <worktree-path>}"

cd "$MAIN"
files=$(git ls-files --others --ignored --exclude-standard \
    | grep -E '(^|/)\.env(\.[^/]*)?$' \
    | grep -vE '(^|/)(node_modules|cdk\.out|dist|build|\.next|coverage)/' || true)

if [ -z "$files" ]; then
    echo "No .env files to copy."
    exit 0
fi

count=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    mkdir -p "$DEST/$(dirname "$f")"
    cp "$MAIN/$f" "$DEST/$f"
    echo "  copied $f"
    count=$((count + 1))
done <<< "$files"

echo "Copied $count .env file(s)."
