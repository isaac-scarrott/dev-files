#!/usr/bin/env bash
# Isolated second OpenCode desktop for driving GUI plugins over CDP. Never touches the user's app or service.
# Usage: desktop-harness.sh start <plugin-dir>...   launch, seed a long session, print CDP url
#        desktop-harness.sh stop                    kill only the processes this script started
set -euo pipefail

# One root per checkout, so two agents never stop each other's app. Override with OC_HARNESS_ROOT.
ROOT=${OC_HARNESS_ROOT:-/private/tmp/oc-harness-$(printf %s "$PWD" | cksum | cut -d" " -f1)}
CDP_PORT=${OC_HARNESS_CDP_PORT:-9333}
SVC_PORT=${OC_HARNESS_SERVICE_PORT:-49555}   # the user's service owns 49374; two services on one port fail to start
APP=/Applications/OpenCode.app/Contents/MacOS/OpenCode
CLI="$HOME/Library/Application Support/ai.opencode.desktop/cli/$(defaults read /Applications/OpenCode.app/Contents/Info.plist CFBundleShortVersionString)-arm64/opencode-cli"
HERE=$(cd "$(dirname "$0")" && pwd)

case "${1:-}" in
start)
  shift
  [ -e "$ROOT/app.pid" ] && kill -0 "$(cat "$ROOT/app.pid")" 2>/dev/null && { echo "already running" >&2; exit 1; }
  mkdir -p "$ROOT/config/opencode" "$ROOT/project"
  [ -e "$HOME/Documents/Default Project" ] || touch "$ROOT/created-default-project"   # first-launch onboarding creates it
  git -C "$ROOT/project" init -q 2>/dev/null || true
  node -e 'console.log(JSON.stringify({ plugins: process.argv.slice(1) }, null, 2))' "$@" > "$ROOT/config/opencode/opencode.json"
  # TEST_ROOT points userData and every XDG dir at $ROOT, so the app's service.json, db and config are private.
  XDG_CONFIG_HOME="$ROOT/config" XDG_DATA_HOME="$ROOT/data" XDG_STATE_HOME="$ROOT/state" XDG_CACHE_HOME="$ROOT/cache" \
    "$CLI" service set port "$SVC_PORT" >/dev/null
  OPENCODE_DESKTOP_TEST_ROOT="$ROOT" nohup "$APP" --remote-debugging-port="$CDP_PORT" > "$ROOT/app.log" 2>&1 &
  echo $! > "$ROOT/app.pid"
  for _ in $(seq 60); do [ -s "$ROOT/state/opencode/service.json" ] && curl -sf "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null && break; sleep 1; done
  password=$(node -e 'console.log(require(process.argv[1]).password)' "$ROOT/state/opencode/service.json")
  node "$HERE/seed-session.mjs" "http://127.0.0.1:$SVC_PORT" "$password" "$ROOT/project" 40
  echo "cdp: http://127.0.0.1:$CDP_PORT  pid: $(cat "$ROOT/app.pid")  root: $ROOT"
  ;;
stop)
  [ -e "$ROOT/app.pid" ] || { echo "nothing to stop"; exit 0; }
  pid=$(cat "$ROOT/app.pid")
  kill "$pid" 2>/dev/null || true
  sleep 3
  pkill -f "$ROOT/desktop/cli/" 2>/dev/null || true   # scoped to this root's CLI copy, never the user's
  rm -f "$ROOT/app.pid"
  [ -e "$ROOT/created-default-project" ] && rmdir "$HOME/Documents/Default Project" 2>/dev/null; rm -f "$ROOT/created-default-project"
  echo "stopped $pid"
  ;;
*) echo "usage: $0 start <plugin-dir>... | stop" >&2; exit 2 ;;
esac
