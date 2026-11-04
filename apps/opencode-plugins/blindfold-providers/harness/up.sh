#!/bin/sh
# Starts the private onboarding harness (own ports, own root; never the user's app or service) and leaves it running.
# Stop it with harness/down.sh. Fixture CLIs and fake values only.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
SKILL=$(cd "$HERE/../../../../.claude/skills/opencode-gui-plugins/scripts" && pwd)
PLUGINS=$(cd "$HERE/../.." && pwd)
export OC_HARNESS_ROOT=/private/tmp/oc-harness-onb OC_HARNESS_CDP_PORT=${ONB_CDP:-9481} OC_HARNESS_SERVICE_PORT=${ONB_SVC:-49681}
export NODE_OPTIONS=--max-old-space-size=1500
[ -n "$(pgrep -f desktop-harness)" ] && { echo "another harness script is running; stop it first" >&2; exit 1; }
mkdir -p /private/tmp/bf-onb
rm -f /private/tmp/bf-onb/accounts.json /private/tmp/bf-onb/audit.jsonl
sed "s/49882/${ONB_STUB:-49887}/" "$PLUGINS/blindfold/harness/provider.json" > /private/tmp/bf-onb/provider.json
# Own fixture copy and own state: never the shared /tmp/blindfold-fixture of the other harness scripts.
FX=/private/tmp/bf-onb/fx
rm -rf "$FX" /private/tmp/bf-onb/fixture-state && mkdir -p "$FX" /private/tmp/bf-onb/fixture-state
cp "$HERE/../fixture-cli/fixture.mjs" "$FX/"
for tool in op bw security; do
  printf '#!/bin/sh\nFIXTURE_STATE=/private/tmp/bf-onb/fixture-state exec "%s" "$(dirname "$0")/fixture.mjs" %s "$@"\n' "$(command -v node)" "$tool" > "$FX/$tool"
  chmod +x "$FX/$tool"
done
BF_STUB_PORT=${ONB_STUB:-49887} BF_CODE_FILE=/private/tmp/bf-onb/code.js BF_STUB_LOG=/private/tmp/bf-onb/req.json nohup node "$PLUGINS/blindfold/harness/stub-model.mjs" > /private/tmp/bf-onb/stub.log 2>&1 < /dev/null &
echo $! > /private/tmp/bf-onb/stub.pid
rm -rf "$OC_HARNESS_ROOT"
OC_HARNESS_EXTRA_CONFIG=/private/tmp/bf-onb/provider.json OC_HARNESS_TURNS=4 perl -e 'alarm 150; exec @ARGV' "$SKILL/desktop-harness.sh" start "$PLUGINS/blindfold-providers" "$PLUGINS/blindfold" | tail -1
node "$HERE/config.mjs" "$OC_HARNESS_ROOT"
sleep 8
