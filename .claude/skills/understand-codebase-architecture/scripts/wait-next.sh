#!/usr/bin/env bash
# Block until the live bridge has a question with no answer yet, print it, exit 0.
# Run this in the background: a backgrounded command re-invokes the Claude session
# when it exits, which is how the session "listens" for the next question.
#
#   bash wait-next.sh "$BRIDGE_DIR"
#
# Prints the inbox JSON ({ id, question, context, ts }). Answer by writing
# "$BRIDGE_DIR/outbox/<id>.txt", then run this again for the next one.
set -euo pipefail
DIR="${1:-${BRIDGE_DIR:?pass the bridge dir or set BRIDGE_DIR}}"
shopt -s nullglob
while :; do
  for f in "$DIR"/inbox/*.json; do
    id="$(basename "$f" .json)"
    [ -e "$DIR/outbox/$id.txt" ] && continue   # already answered — skip
    cat "$f"
    exit 0
  done
  sleep 1
done
