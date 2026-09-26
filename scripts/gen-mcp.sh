#!/usr/bin/env bash
# Render per-tool MCP config from the canonical manifest (mcp.manifest.json).
#
# Single source of truth: mcp.manifest.json. Outputs:
#   - Claude:   .claude/marketplaces/dev-files/plugins/{personal,holibob}/.mcp.json
#   - OpenCode: ~/.config/opencode/opencode.json  (.mcp key, merged in place)
#   - Codex:    ~/.codex/config.toml  ([mcp_servers.*], maintained as a marked block)
#
# Re-run after editing mcp.manifest.json. Idempotent. --check reports drift without writing.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/mcp.manifest.json"
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "missing $MANIFEST" >&2; exit 1; }
CHECK=0
case "${1:-}" in
  --check) CHECK=1 ;;
  "") ;;
  *) echo "Usage: $0 [--check]" >&2; exit 2 ;;
esac
drift=0

render() { # <dest> <content>
  local dest="$1" tmp
  tmp="$(mktemp)"
  printf '%s\n' "$2" > "$tmp"
  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
    echo "  ok: $dest"
  elif [ "$CHECK" -eq 1 ]; then
    echo "  DRIFT: $dest"
    drift=1
  else
    mkdir -p "$(dirname "$dest")"
    cat "$tmp" > "$dest" # Write through symlinks and preserve existing file modes.
    echo "  wrote $dest"
  fi
  rm -f "$tmp"
}

# Claude .mcp.json shape: http -> {type:http,url}; stdio -> {type:stdio,command,args,env}
CLAUDE_SHAPE='map_values(
  if .transport == "http" then {type:"http", url:.url}
  else {type:"stdio", command:.command, args:(.args // []), env:(.env // {})} end)'

# OpenCode mcp shape: http -> remote; stdio -> local (command as array, env -> environment)
# The background service may start outside a login shell; uvx lives in ~/.local/bin.
OPENCODE_SHAPE='map_values(
  if .transport == "http" then {type:"remote", url:.url}
  else {type:"local", command:([.command] + (.args // [])),
        environment:({PATH:"{env:HOME}/.local/bin:{env:PATH}"} + (.env // {}))} end)'

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
  local content
  content="$(servers_for "$1" | jq "$CLAUDE_SHAPE")"
  render "$2" "$content"
}

PLUGINS="$ROOT/.claude/marketplaces/dev-files/plugins"
write_claude "claude-personal" "$PLUGINS/personal/.mcp.json"
write_claude "claude-holibob"  "$PLUGINS/holibob/.mcp.json"

OC="$HOME/.config/opencode/opencode.json"
if [ -f "$OC" ]; then
  mcp="$(servers_for "opencode" | jq "$OPENCODE_SHAPE")"
  content="$(jq --argjson mcp "$mcp" '
    if .mcp.servers? then .mcp.servers = $mcp else .mcp = $mcp end
  ' "$OC")"
  render "$OC" "$content"
else
  content="$(servers_for "opencode" | jq "$OPENCODE_SHAPE | {\"\$schema\":\"https://opencode.ai/config.json\", mcp:.}")"
  render "$OC" "$content"
fi

# Codex shares ~/.codex/config.toml across CLI, IDE extension, and desktop app.
# That file is Codex-owned (it rewrites hook/marketplace state) and may hold secrets,
# so we never symlink or replace it — we maintain a marked block and leave the rest alone.
CODEX="$HOME/.codex/config.toml"
CX_START="# >>> dev-files managed MCP — from mcp.manifest.json; edit there + run scripts/gen-mcp.sh >>>"
CX_END="# <<< dev-files managed MCP <<<"
block="$(servers_for "codex" | jq -r "$CODEX_TOML")"
if [ -f "$CODEX" ]; then
  # Codex may insert its own servers inside our markers. Move those tables outside
  # the managed block rather than deleting them on the next generation.
  names="$(servers_for "codex" | jq -r 'keys | join(" ")')"
  body="$(awk -v s="$CX_START" -v e="$CX_END" -v names="$names" '
    BEGIN { split(names, list, " "); for (i in list) managed[list[i]]=1 }
    $0==s { inblk=1; keep=0; next }
    $0==e { inblk=0; next }
    inblk && /^\[mcp_servers\./ {
      name=$0; sub(/^\[mcp_servers\./, "", name); sub(/[.\]].*$/, "", name)
      keep=!(name in managed)
    }
    !inblk || keep { print }
  ' "$CODEX")"
  content="$(printf '%s\n\n%s\n%s\n%s' "$body" "$CX_START" "$block" "$CX_END")"
  render "$CODEX" "$content"
else
  umask 077
  content="$(printf '%s\n%s\n%s' "$CX_START" "$block" "$CX_END")"
  render "$CODEX" "$content"
fi

exit "$drift"
