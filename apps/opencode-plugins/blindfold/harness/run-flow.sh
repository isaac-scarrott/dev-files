#!/bin/sh
# One command: fixtures, stub model, the multi-step sign-in page, a private harness with both plugins, the flow driver, then
# everything stopped. Never touches the user's app or service (own root, CDP 9611, service 49711, stub 49893, page 47341).
# Fake CLIs and values only. Usage: harness/run-flow.sh [shots-dir]    (BF_PARITY=1 adds the parity spec)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SKILL=$(cd "$HERE/../../.claude/skills/opencode-gui-plugins/scripts" && pwd)
PLUGINS=$(cd "$HERE/../.." && pwd)
RUN=/private/tmp/bf-flow-run
export OC_HARNESS_ROOT=/private/tmp/oc-harness-flow OC_HARNESS_CDP_PORT=9611 OC_HARNESS_SERVICE_PORT=49711
export BF_CDP=http://127.0.0.1:9611 BF_ROOT=$OC_HARNESS_ROOT BF_CODE_FILE=$RUN/code.js BF_REQ_LOG=$RUN/req.json BF_AUDIT=$RUN/audit.jsonl BF_STUB_PORT=49893 BF_FLOW_MINUTES=${BF_FLOW_MINUTES:-0.5}
export NODE_OPTIONS=--max-old-space-size=1500
mkdir -p $RUN
[ -n "$(pgrep -f desktop-harness)" ] && echo "another harness script is running; stop it first" >&2
sed 's/49882/49893/' "$HERE/provider.json" > $RUN/provider.json
rm -f $RUN/audit.jsonl
FLOW=1 "$HERE/setup-fixtures.sh" > /dev/null
BF_STUB_LOG=$BF_REQ_LOG node "$HERE/stub-model.mjs" > $RUN/stub.log 2>&1 &
STUB=$!
node "$HERE/flow-page/server.mjs" 47341 > $RUN/page.log 2>&1 &
PAGE=$!
"$SKILL/desktop-harness.sh" stop > /dev/null 2>&1; rm -rf "$OC_HARNESS_ROOT"
OC_HARNESS_EXTRA_CONFIG=$RUN/provider.json OC_HARNESS_TURNS=4 perl -e 'alarm 150; exec @ARGV' "$SKILL/desktop-harness.sh" start "$PLUGINS/blindfold-providers" "$PLUGINS/blindfold" | tail -1
node "$HERE/harness-config.mjs" "$OC_HARNESS_ROOT" 10
sleep 8
perl -e 'alarm 900; exec @ARGV' node "$HERE/drive-flow.mjs" "${1:-$RUN/shots}"
CODE=$?
if [ -n "${BF_PARITY:-}" ] && [ $CODE -eq 0 ]; then
  OC_PW_ROOT=${BF_PW:-/private/tmp/bf-pw} perl -e 'alarm 300; exec @ARGV' node "$SKILL/parity.mjs" --spec "$HERE/../parity.spec.mjs" --cdp "$BF_CDP" --out $RUN/parity
  CODE=$?
fi
"$SKILL/desktop-harness.sh" stop
pkill -f "$OC_HARNESS_ROOT/desktop/cli/" 2>/dev/null
kill $STUB $PAGE 2>/dev/null
exit $CODE
