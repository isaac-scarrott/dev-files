#!/usr/bin/env bash
# Detect (and optionally fix) drift between dev-files and its declared canonical state.
#
# Drift sources:
#   1. Symlinks declared in install.sh — does every $HOME/... target actually point at the right dev-files path?
#   2. Vendored files in vendor.manifest — does local content match upstream?
#   3. Submodules — is the pinned SHA still upstream HEAD on the tracking branch?
#
# Usage:
#   scripts/drift.sh           # report only
#   scripts/drift.sh --fix     # apply fixes (refuses if working tree is dirty)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIX=0
[ "${1:-}" = "--fix" ] && FIX=1

# shellcheck source=../install.sh
source "$ROOT/install.sh"

red()   { printf "\033[31m%s\033[0m" "$1"; }
green() { printf "\033[32m%s\033[0m" "$1"; }
yel()   { printf "\033[33m%s\033[0m" "$1"; }

drift_count=0
report() {
  local kind="$1" detail="$2"
  drift_count=$((drift_count + 1))
  printf "  %s  %s\n" "$(red DRIFT)" "$kind: $detail"
}

# ---- 1. Symlink drift --------------------------------------------------------
echo "=== symlinks (vs install.sh LINKS) ==="
for entry in "${LINKS[@]}"; do
  dest="${entry%%|*}"
  src="${entry##*|}"
  want="$ROOT/$src"
  if [ ! -L "$dest" ]; then
    if [ -e "$dest" ]; then
      report "symlink" "$dest is a real file/dir, not a symlink"
    else
      report "symlink" "$dest is missing"
    fi
  else
    have="$(readlink "$dest")"
    if [ "$have" != "$want" ]; then
      report "symlink" "$dest → $have (want $want)"
    fi
  fi
done

# ---- 2. Vendored-file drift --------------------------------------------------
echo
echo "=== vendored files (vs upstream) ==="
if [ -f vendor.manifest ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ -z "${line// }" || "$line" =~ ^[[:space:]]*# ]] && continue
    read -r repo ref src dest <<< "$line"
    url="https://raw.githubusercontent.com/$repo/$ref/$src"
    if [ ! -f "$dest" ]; then
      report "vendor" "$dest missing locally (expected from $repo@$ref:$src)"
      continue
    fi
    local_hash=$(md5 -q "$dest")
    remote_hash=$(curl -fsSL "$url" 2>/dev/null | md5 -q || echo "FETCH_FAILED")
    if [ "$remote_hash" = "FETCH_FAILED" ]; then
      report "vendor" "could not fetch $url (offline?)"
    elif [ "$local_hash" != "$remote_hash" ]; then
      report "vendor" "$dest differs from $repo@$ref:$src"
    fi
  done < vendor.manifest
fi

# ---- 3. Submodule drift ------------------------------------------------------
echo
echo "=== submodules (pinned vs upstream HEAD) ==="
if [ -f .gitmodules ]; then
  git submodule foreach --quiet '
    pinned=$(git rev-parse HEAD)
    branch=$(git remote show origin | awk "/HEAD branch:/ {print \$NF}")
    upstream=$(git ls-remote origin "$branch" 2>/dev/null | awk "{print \$1}")
    if [ -n "$upstream" ] && [ "$pinned" != "$upstream" ]; then
      echo "  DRIFT  submodule: $sm_path pinned $pinned, upstream $branch is $upstream"
    fi
  ' | tee /tmp/drift-submodule.out
  if grep -q DRIFT /tmp/drift-submodule.out 2>/dev/null; then
    submod_drift=$(grep -c DRIFT /tmp/drift-submodule.out)
    drift_count=$((drift_count + submod_drift))
  fi
fi

# ---- Summary -----------------------------------------------------------------
echo
if [ "$drift_count" -eq 0 ]; then
  echo "$(green '✓ no drift')"
  exit 0
fi
echo "$(yel "$drift_count drift item(s)")"

# ---- Fix mode ----------------------------------------------------------------
if [ "$FIX" -eq 0 ]; then
  echo
  echo "Re-run with --fix to apply."
  exit 1
fi

echo
echo "=== --fix ==="
if [ -n "$(git status --porcelain)" ]; then
  echo "$(red ERROR): working tree is dirty. Commit/stash before --fix so changes are reviewable."
  git status --short
  exit 2
fi

echo "1) refreshing vendored files"
scripts/vendor.sh

echo
echo "2) updating submodules to upstream HEAD"
git submodule update --remote --recursive || true

echo
echo "3) re-applying symlinks"
link_all

echo
echo "done — review the diff with: git status && git diff"
