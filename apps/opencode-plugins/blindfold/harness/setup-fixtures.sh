#!/bin/sh
# Copies the fixture op, bw and security CLIs of blindfold-providers to a directory with the absolute path of node in their
# wrappers (the harness service has a bare PATH), and resets their state. Prints the directory.
# Usage: setup-fixtures.sh [dir]   (default /private/tmp/bf-fixtures)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
DEST=${1:-/private/tmp/bf-fixtures}
NODE=$(command -v node)
rm -rf "$DEST" /tmp/blindfold-fixture
mkdir -p "$DEST"
cp "$HERE/../../blindfold-providers/fixture-cli/fixture.mjs" "$DEST/"
for tool in op bw security; do
  printf '#!/bin/sh\nexec "%s" "$(dirname "$0")/fixture.mjs" %s "$@"\n' "$NODE" "$tool" > "$DEST/$tool"
  chmod +x "$DEST/$tool"
done
echo "$DEST"
