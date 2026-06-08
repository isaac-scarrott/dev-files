#!/usr/bin/env bash
# Render per-tool MCP config from the canonical manifest (mcp.manifest.json).
#
# Single source of truth: mcp.manifest.json. Outputs:
#   - Claude:   .claude/marketplaces/dev-files/plugins/{personal,holibob}/.mcp.json
#   - OpenCode: ~/.config/opencode/opencode.json  (.mcp key, merged in place)
#
# Re-run after editing mcp.manifest.json. Idempotent.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/mcp.manifest.json"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "missing $MANIFEST" >&2; exit 1; }

# Claude .mcp.json shape: http -> {type:http,url}; stdio -> {type:stdio,command,args,env}
CLAUDE_SHAPE='map_values(
  if .transport == "http" then {type:"http", url:.url}
  else {type:"stdio", command:.command, args:(.args // []), env:(.env // {})} end)'

# OpenCode mcp shape: http -> remote; stdio -> local (command as array, env -> environment)
OPENCODE_SHAPE='map_values(
  if .transport == "http" then {type:"remote", url:.url}
  else {type:"local", command:([.command] + (.args // [])), environment:(.env // {})} end)'

servers_for() { # <target>
  jq --arg t "$1" '.servers | with_entries(select(.value.targets | index($t)))' "$MANIFEST"
}

write_claude() { # <target> <dest>
  servers_for "$1" | jq "$CLAUDE_SHAPE" > "$2"
  echo "  wrote $2"
}

PLUGINS="$ROOT/.claude/marketplaces/dev-files/plugins"
write_claude "claude-personal" "$PLUGINS/personal/.mcp.json"
write_claude "claude-holibob"  "$PLUGINS/holibob/.mcp.json"

OC="$HOME/.config/opencode/opencode.json"
if [ -f "$OC" ]; then
  mcp="$(servers_for "opencode" | jq "$OPENCODE_SHAPE")"
  tmp="$(mktemp)"
  jq --argjson mcp "$mcp" '.mcp = $mcp' "$OC" > "$tmp"
  cat "$tmp" > "$OC"   # write through the symlink — do not mv (that replaces the link)
  rm -f "$tmp"
  echo "  merged .mcp into $OC"
else
  echo "  skipped OpenCode (no $OC)"
fi

echo "MCP config generated from $MANIFEST"
