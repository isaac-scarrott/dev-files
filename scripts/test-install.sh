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
  want="$(resolve_src "$src")"
  # $HOME is the sandbox here, so sibling-repo sources don't exist and get skipped.
  [ -e "$want" ] || continue
  if [ ! -L "$dest" ]; then
    expect "exists: $dest" "missing" "symlink"
    continue
  fi
  expect "target: $dest" "$(readlink "$dest")" "$want"
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
echo "=== test 5: a src outside dev-files links when present, skips when absent ==="
outside="$SANDBOX/sibling-repo/thing.sh"
mkdir -p "$(dirname "$outside")"
echo "#!/bin/sh" > "$outside"
link_one "$SANDBOX/.claude/scripts/thing.sh" "$outside" > /dev/null
expect "external src linked" "$(readlink "$SANDBOX/.claude/scripts/thing.sh")" "$outside"

rm "$outside"
missing_status=0
link_one "$SANDBOX/.claude/scripts/gone.sh" "$SANDBOX/sibling-repo/gone.sh" > /dev/null || missing_status=$?
expect "absent external src doesn't fail install" "$missing_status" "0"
expect "absent external src creates nothing" \
  "$([ -e "$SANDBOX/.claude/scripts/gone.sh" ] && echo created || echo none)" "none"

missing_status=0
link_one "$SANDBOX/.claude/gone-from-repo" "does/not/exist/in/repo" > /dev/null || missing_status=$?
expect "absent repo src still fails loudly" "$missing_status" "1"

echo
echo "=== test 6: every canonical skill is installed for all three tools ==="
for skill in "$ROOT"/.claude/skills/*/SKILL.md; do
  name="$(basename "$(dirname "$skill")")"
  for dir in "$HOME/.claude/skills" "$HOME/.config/opencode/skills" "$HOME/.codex/skills"; do
    expect "skill: $dir/$name" "$(readlink "$dir/$name" || true)" "$ROOT/.claude/skills/$name"
  done
done

echo
echo "=== test 7: MCP rendering detects drift and preserves tool-owned settings ==="
fixture="$SANDBOX/repo"
mkdir -p "$fixture/scripts" "$fixture/.claude/marketplaces/dev-files/plugins/"{personal,holibob}
cp "$ROOT/scripts/gen-mcp.sh" "$fixture/scripts/"
cp "$ROOT/mcp.manifest.json" "$fixture/"
# Replace the sandbox link so generation cannot write through to the real repo.
rm "$HOME/.config/opencode/opencode.json"
printf '%s\n' '{"model":"test/model","mcp":{"servers":{},"timeout":{"startup":45000}}}' > "$SANDBOX/opencode.json"
ln -s "$SANDBOX/opencode.json" "$HOME/.config/opencode/opencode.json"
printf '%s\n' 'model = "test-model"' > "$HOME/.codex/config.toml"
check_status=0
bash "$fixture/scripts/gen-mcp.sh" --check > /dev/null || check_status=$?
expect "check detects stale config" "$check_status" "1"
expect "check leaves Codex untouched" "$(cat "$HOME/.codex/config.toml")" 'model = "test-model"'
bash "$fixture/scripts/gen-mcp.sh" > /dev/null
check_status=0
bash "$fixture/scripts/gen-mcp.sh" --check > /dev/null || check_status=$?
expect "generated configs are in sync" "$check_status" "0"
expect "OpenCode symlink preserved" "$(readlink "$HOME/.config/opencode/opencode.json")" "$SANDBOX/opencode.json"
expect "OpenCode model preserved" "$(jq -r .model "$SANDBOX/opencode.json")" "test/model"
expect "V2 timeout preserved" "$(jq -r .mcp.timeout.startup "$SANDBOX/opencode.json")" "45000"
expect "all OpenCode servers rendered" "$(jq '.mcp.servers | length' "$SANDBOX/opencode.json")" \
  "$(jq '[.servers[] | select(.targets | index("opencode"))] | length' "$fixture/mcp.manifest.json")"
expect "Codex model preserved" "$(head -n 1 "$HOME/.codex/config.toml")" 'model = "test-model"'
sed -i '' '/^# <<< dev-files managed MCP/i\
[mcp_servers.tool-owned]\
command = "tool-server"\
[mcp_servers.tool-owned.env]\
EXAMPLE = "preserve-me"\
' "$HOME/.codex/config.toml"
bash "$fixture/scripts/gen-mcp.sh" > /dev/null
expect "tool-owned server survives inside markers" "$(grep -c '^command = "tool-server"' "$HOME/.codex/config.toml")" "1"
expect "tool-owned server environment survives" "$(grep -c '^EXAMPLE = "preserve-me"' "$HOME/.codex/config.toml")" "1"
expect "Codex managed block not duplicated" "$(grep -c '^# >>> dev-files managed MCP' "$HOME/.codex/config.toml")" "1"
rm "$HOME/.config/opencode/opencode.json" "$HOME/.codex/config.toml"
bash "$fixture/scripts/gen-mcp.sh" > /dev/null
expect "fresh OpenCode config rendered" "$(jq '.mcp | length' "$HOME/.config/opencode/opencode.json")" \
  "$(jq '[.servers[] | select(.targets | index("opencode"))] | length' "$fixture/mcp.manifest.json")"
expect "fresh Codex config is private" "$(stat -f '%Lp' "$HOME/.codex/config.toml")" "600"

echo
echo "=== summary ==="
echo "  $pass passed, $fail failed"
exit "$fail"
