#!/usr/bin/env bash
# Test install.sh's symlink logic in a sandboxed $HOME.
#
# Strategy: source install.sh (which doesn't run main() when sourced), then
# point $HOME at a tmpdir and exercise link_all + link_one. Source paths still
# resolve to the real dev-files repo; destinations land in the sandbox.
#
# Skips the network/git pieces of install.sh (vendor fetch, submodule init,
# git config) since those are tested separately and would mutate real state.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX=$(mktemp -d -t devfiles-install-test.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT

pass=0
fail=0
expect() {
  local label="$1" actual="$2" want="$3"
  if [ "$actual" = "$want" ]; then
    echo "  PASS  $label"
    pass=$((pass + 1))
  else
    echo "  FAIL  $label"
    echo "        actual: $actual"
    echo "        want:   $want"
    fail=$((fail + 1))
  fi
}

# Source install.sh with HOME redirected so LINKS gets evaluated against the sandbox.
export HOME="$SANDBOX"
# shellcheck source=../install.sh
source "$ROOT/install.sh"

echo "=== test 1: fresh install creates all symlinks ==="
link_all > /dev/null
for entry in "${LINKS[@]}"; do
  dest="${entry%%|*}"
  src="${entry##*|}"
  if [ ! -L "$dest" ]; then
    expect "exists: $dest" "missing" "symlink"
    continue
  fi
  expect "target: $dest" "$(readlink "$dest")" "$ROOT/$src"
done

echo
echo "=== test 2: idempotent re-run leaves symlinks untouched ==="
before=$(find "$SANDBOX" -name '*.bak.*' 2>/dev/null | wc -l | tr -d ' ')
link_all > /dev/null
after=$(find "$SANDBOX" -name '*.bak.*' 2>/dev/null | wc -l | tr -d ' ')
expect "no .bak created on re-run" "$after" "$before"

echo
echo "=== test 3: pre-existing real file gets backed up before linking ==="
# Pick one symlink, replace it with a real file, re-run, verify .bak appears.
target="$SANDBOX/.zshrc"
rm "$target"
echo "user-written content" > "$target"
link_all > /dev/null
bak_count=$(find "$SANDBOX" -maxdepth 1 -name '.zshrc.bak.*' | wc -l | tr -d ' ')
expect ".zshrc.bak.* exists" "$bak_count" "1"
expect ".zshrc is now a symlink" "$([ -L "$target" ] && echo yes || echo no)" "yes"
expect ".zshrc points at dev-files" "$(readlink "$target")" "$ROOT/.zshrc"

echo
echo "=== test 4: wrong-target symlink is replaced without backup ==="
rm "$target"
ln -s /nowhere/else "$target"
bak_before=$(find "$SANDBOX" -maxdepth 1 -name '.zshrc.bak.*' | wc -l | tr -d ' ')
link_all > /dev/null
bak_after=$(find "$SANDBOX" -maxdepth 1 -name '.zshrc.bak.*' | wc -l | tr -d ' ')
expect "no new .bak for wrong symlink" "$bak_after" "$bak_before"
expect "wrong symlink fixed" "$(readlink "$target")" "$ROOT/.zshrc"

echo
echo "=== summary ==="
echo "  $pass passed, $fail failed"
exit "$fail"
