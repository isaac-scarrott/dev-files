#!/bin/sh
# One command: fixtures, stub model, a private harness with both plugins, the provider driver, then everything stopped.
# Never touches the user's app or service (own root, CDP 9377, service 49577, stub 49883). Fake CLIs and values only.
# Usage: harness/run-providers.sh [shots-dir]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SKILL=$(cd "$HERE/../../../../.claude/skills/opencode-gui-plugins/scripts" && pwd)
PLUGINS=$(cd "$HERE/../.." && pwd)
export OC_HARNESS_ROOT=/private/tmp/oc-harness-prov OC_HARNESS_CDP_PORT=9377 OC_HARNESS_SERVICE_PORT=49577
export BF_CDP=http://127.0.0.1:9377 BF_ROOT=$OC_HARNESS_ROOT BF_CODE_FILE=/private/tmp/bf-run/code.js BF_REQ_LOG=/private/tmp/bf-run/req.json BF_AUDIT=/private/tmp/bf-run/audit.jsonl BF_STUB_PORT=49883
export NODE_OPTIONS=--max-old-space-size=1500
mkdir -p /private/tmp/bf-run
[ -n "$(pgrep -f desktop-harness)" ] && echo "another harness script is running; stop it first" >&2
sed 's/49882/49883/' "$HERE/provider.json" > /private/tmp/bf-run/provider.json
rm -f /private/tmp/bf-run/audit.jsonl
"$HERE/setup-fixtures.sh" > /dev/null
BF_STUB_LOG=$BF_REQ_LOG node "$HERE/stub-model.mjs" > /private/tmp/bf-run/stub.log 2>&1 &
STUB=$!
"$SKILL/desktop-harness.sh" stop > /dev/null 2>&1; rm -rf "$OC_HARNESS_ROOT"
OC_HARNESS_EXTRA_CONFIG=/private/tmp/bf-run/provider.json OC_HARNESS_TURNS=4 perl -e 'alarm 150; exec @ARGV' "$SKILL/desktop-harness.sh" start "$PLUGINS/blindfold-providers" "$PLUGINS/blindfold" | tail -1
node "$HERE/harness-config.mjs" "$OC_HARNESS_ROOT" 0.25
sleep 8
perl -e 'alarm 600; exec @ARGV' node "$HERE/drive-providers.mjs" "${1:-/private/tmp/bf-run/shots-prov}"
CODE=$?
"$SKILL/desktop-harness.sh" stop
pkill -f "$OC_HARNESS_ROOT/desktop/cli/" 2>/dev/null
kill $STUB 2>/dev/null
exit $CODE
