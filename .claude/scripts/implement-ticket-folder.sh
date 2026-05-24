#!/usr/bin/env bash
#
# implement-ticket-folder — Orchestrate Claude Code instances to implement a folder of markdown tickets.
#
# Thin shim. The implementation lives in the `orchestrate` package; this file
# just forwards to it so the entry-point stays at a stable, well-known path.
#
# Usage: implement-ticket-folder <FOLDER> [--repo <path>] [--base <branch>]
#                                        [--model <model>] [--phase <n>] [--start <id>]

set -euo pipefail

ORCH="$HOME/.claude/scripts/orchestrate.sh"
if [[ ! -x "$ORCH" ]]; then
    echo "implement-ticket-folder: orchestrate package not installed at $ORCH" >&2
    echo "  install it from: https://github.com/isaac-scarrott/claude-orchestrate" >&2
    exit 1
fi

exec "$ORCH" implement-ticket-folder "$@"
