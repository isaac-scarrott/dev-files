#!/bin/sh
HERE=$(cd "$(dirname "$0")" && pwd)
SKILL=$(cd "$HERE/../../../../.claude/skills/opencode-gui-plugins/scripts" && pwd)
export OC_HARNESS_ROOT=/private/tmp/oc-harness-shh OC_HARNESS_CDP_PORT=${SH_CDP:-9471} OC_HARNESS_SERVICE_PORT=${SH_SVC:-49641}
"$SKILL/desktop-harness.sh" stop
pkill -f "$OC_HARNESS_ROOT/desktop/cli/" 2>/dev/null
[ -f /private/tmp/sh-handoff/stub.pid ] && kill "$(cat /private/tmp/sh-handoff/stub.pid)" 2>/dev/null
rm -f /private/tmp/sh-handoff/stub.pid
true
