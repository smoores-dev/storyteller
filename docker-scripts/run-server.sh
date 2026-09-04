#!/usr/bin/env bash
set -u

LOG_DIR="${STORYTELLER_DATA_DIR:-/data}/logs"
mkdir -p "$LOG_DIR"

exec > >(rotatelogs -e -f "$LOG_DIR/storyteller-%Y-%m-%d.log" 86400) 2>&1
ROTATELOGS=$!

node --enable-source-maps "${1:-server.js}" &
NODE=$!

STOPPING=
trap 'STOPPING=1; kill -TERM "$NODE"' TERM INT

wait "$NODE"
CODE=$?
while kill -0 "$NODE" 2>/dev/null; do
  wait "$NODE"
  CODE=$?
done

if [ -n "$STOPPING" ]; then
  LEVEL=30 MSG="server stopped" CODE=0
elif [ "$CODE" -gt 128 ]; then
  LEVEL=60 MSG="server killed by SIG$(kill -l $((CODE - 128)))"
else
  LEVEL=60 MSG="server exited with code $CODE"
fi

printf '{"level":%s,"time":%s000,"msg":"%s","src":"launcher","code":%s}\n' \
  "$LEVEL" "$(date +%s)" "$MSG" "$CODE"

exec >&- 2>&-
wait "$ROTATELOGS"
exit "$CODE"
