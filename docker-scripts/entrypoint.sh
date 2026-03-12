#!/bin/bash
set -e

STORYTELLER_USER="storyteller"

# if already running as non-root (user set `user:`), just exec directly
if [ "$(id -u)" != "0" ]; then
    exec tini -- "$@"
fi

# running as root: fix ownership of writable directories, then drop privileges

NEXT_CACHE_DIR="/app/.next/standalone/web/.next/cache"
if [ -d "$NEXT_CACHE_DIR" ]; then
    chown "$STORYTELLER_USER:$STORYTELLER_USER" "$NEXT_CACHE_DIR"
fi

if [ -d "$HOME/.local/share/ghost-story" ]; then
    find "$HOME/.local/share/ghost-story" ! -user "$STORYTELLER_USER" -exec chown "$STORYTELLER_USER:$STORYTELLER_USER" {} + 2>/dev/null || true
fi

if [ -n "$STORYTELLER_DATA_DIR" ] && [ -d "$STORYTELLER_DATA_DIR" ]; then
    find "$STORYTELLER_DATA_DIR" ! -user "$STORYTELLER_USER" -exec chown "$STORYTELLER_USER:$STORYTELLER_USER" {} + 2>/dev/null || true
fi

if [ -n "$STORYTELLER_DB_DIR" ] && [ -d "$STORYTELLER_DB_DIR" ]; then
    find "$STORYTELLER_DB_DIR" ! -user "$STORYTELLER_USER" -exec chown "$STORYTELLER_USER:$STORYTELLER_USER" {} + 2>/dev/null || true
fi

exec gosu "$STORYTELLER_USER" tini -- "$@"
