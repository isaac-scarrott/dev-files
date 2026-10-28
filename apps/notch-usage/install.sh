#!/usr/bin/env bash
# Build NotchUsage and run it at login via a LaunchAgent.
# The plist is rendered, not symlinked: launchd needs the binary's absolute path baked in.
# Idempotent: rebuilds, rewrites the plist, and restarts the agent.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="dev.isaac.notch-usage"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BINARY="$APP_DIR/.build/release/NotchUsage"

if ! command -v swift >/dev/null; then
  echo "  ! swift not found; skipping notch-usage (install Xcode command line tools)"
  exit 0
fi

swift build --package-path "$APP_DIR" -c release 2>&1 | tail -1

mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$BINARY</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
PLIST

pkill -x NotchUsage 2>/dev/null || true
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "  loaded: $LABEL → $BINARY"
