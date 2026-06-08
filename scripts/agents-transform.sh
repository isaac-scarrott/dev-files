#!/usr/bin/env bash
# Transform for AGENTS.md (invoked by vendor.sh via vendor.manifest).
#
# Reads the vendored multica-ai/andrej-karpathy-skills CLAUDE.md on stdin and
# reshapes it into our AGENTS.md: retitle, plus our local additions inserted at
# their anchors. Edit our content in agents-local/{s1,s4,s5}.md — NOT AGENTS.md,
# which is generated. Anchors are content-based (robust to upstream line shifts).
set -euo pipefail

sed -e 's/^# CLAUDE\.md$/# AGENTS.md/' \
    -e '/If something is unclear, stop/r agents-local/s1.md' \
    -e '/Ensure tests pass before and after/r agents-local/s4.md' \
    -e '/require constant clarification/r agents-local/s5.md'
