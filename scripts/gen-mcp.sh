#!/usr/bin/env bash
# Render per-tool MCP config from the canonical manifest (mcp.manifest.json).
#
# Single source of truth: mcp.manifest.json. Outputs:
#   - Claude:   .claude/marketplaces/dev-files/plugins/{personal,holibob}/.mcp.json
#   - OpenCode: ~/.config/opencode/opencode.json  (.mcp key, merged in place)
#   - Codex:    ~/.codex/config.toml  ([mcp_servers.*], maintained as a marked block)
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

# Codex shape: raw TOML text, one [mcp_servers.NAME] table per server.
# http -> url; stdio -> command/args/env (env rendered as a TOML inline table).
CODEX_TOML='to_entries | map(
  "[mcp_servers." + .key + "]\n" +
  ( .value as $s
    | if $s.transport == "http" then "url = " + ($s.url | @json)
      else "command = " + ($s.command | @json) + "\nargs = " + (($s.args // []) | @json)
           + ( ($s.env // {}) | to_entries
               | if length > 0
                 then "\nenv = { " + ([.[] | .key + " = " + (.value | @json)] | join(", ")) + " }"
                 else "" end )
      end )
) | join("\n\n")'

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

# Codex shares ~/.codex/config.toml across CLI, IDE extension, and desktop app.
# That file is Codex-owned (it rewrites hook/marketplace state) and may hold secrets,
# so we never symlink or replace it — we maintain a marked block and leave the rest alone.
CODEX="$HOME/.codex/config.toml"
CX_START="# >>> dev-files managed MCP — from mcp.manifest.json; edit there + run scripts/gen-mcp.sh >>>"
CX_END="# <<< dev-files managed MCP <<<"
block="$(servers_for "codex" | jq -r "$CODEX_TOML")"
if [ -f "$CODEX" ]; then
  # Drop any prior managed block (matched by exact marker lines), trim trailing
  # blank lines via command substitution, then re-append the freshly rendered block.
  body="$(awk -v s="$CX_START" -v e="$CX_END" '$0==s{inblk=1} !inblk{print} $0==e{inblk=0}' "$CODEX")"
  tmp="$(mktemp)"
  { printf '%s\n' "$body"; printf '\n%s\n%s\n%s\n' "$CX_START" "$block" "$CX_END"; } > "$tmp"
  cat "$tmp" > "$CODEX"   # preserve mode + inode (not a symlink); do not mv
  rm -f "$tmp"
  echo "  merged managed block into $CODEX"
else
  printf '%s\n%s\n%s\n' "$CX_START" "$block" "$CX_END" > "$CODEX"
  chmod 600 "$CODEX"
  echo "  wrote $CODEX"
fi

echo "MCP config generated from $MANIFEST"
