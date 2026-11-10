#!/bin/sh
# Starts the private harness for shell-handoff (own ports and root; never the user's app or service) and leaves it running.
# Stop it with harness/down.sh.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SKILL=$(cd "$HERE/../../.claude/skills/opencode-gui-plugins/scripts" && pwd)
PLUGINS=$(cd "$HERE/../.." && pwd)
W=/private/tmp/sh-handoff
export OC_HARNESS_ROOT=/private/tmp/oc-harness-shh OC_HARNESS_CDP_PORT=${SH_CDP:-9471} OC_HARNESS_SERVICE_PORT=${SH_SVC:-49641}
export NODE_OPTIONS=--max-old-space-size=1500
[ -n "$(pgrep -f desktop-harness)" ] && { echo "another harness script is running; stop it first" >&2; exit 1; }
mkdir -p $W
rm -f $W/req.jsonl
echo '{"command":"sleep 600","background":true}' > $W/args.json
SH_STUB_PORT=${SH_STUB:-49642} SH_ARGS=$W/args.json SH_LOG=$W/req.jsonl nohup node "$HERE/stub-model.mjs" > $W/stub.log 2>&1 < /dev/null &
echo $! > $W/stub.pid
rm -rf "$OC_HARNESS_ROOT"
OC_HARNESS_EXTRA_CONFIG=$HERE/provider.json OC_HARNESS_TURNS=2 perl -e 'alarm 150; exec @ARGV' "$SKILL/desktop-harness.sh" start "$PLUGINS/shell-handoff" | tail -1
