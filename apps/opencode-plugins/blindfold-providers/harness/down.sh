#!/bin/sh
HERE=$(cd "$(dirname "$0")" && pwd)
SKILL=$(cd "$HERE/../../../../.claude/skills/opencode-gui-plugins/scripts" && pwd)
export OC_HARNESS_ROOT=/private/tmp/oc-harness-onb OC_HARNESS_CDP_PORT=${ONB_CDP:-9481} OC_HARNESS_SERVICE_PORT=${ONB_SVC:-49681}
"$SKILL/desktop-harness.sh" stop
pkill -f "$OC_HARNESS_ROOT/desktop/cli/" 2>/dev/null
[ -f /private/tmp/bf-onb/stub.pid ] && kill "$(cat /private/tmp/bf-onb/stub.pid)" 2>/dev/null
rm -f /private/tmp/bf-onb/stub.pid
true
