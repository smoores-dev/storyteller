#!/bin/bash
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
STORYTELLER_USER="storyteller"

# if user set `user:` in compose, yell at them to change it
# unless they set an extra env var to allow this 
if [ "$(id -u)" != "0" ]; then
    if [ -z "$FORCE_USER_SETTING" ]; then
        echo "Error: setting `user:` in compose or `-u/--user` using `docker run` is NOT supported!"
        echo "Please set the PUID/PGID environment variables instead. See https://docs.storyteller.ai/docs/installation/self-hosting#file-ownership-on-linux-puid-and-pgid for more details."
        echo "If you really know what you're doing, you can set the FORCE_USER_SETTING=1 environment variable to allow this."
        exit 1
    fi

    echo "FORCE_USER_SETTING is detected, hope you know what you're doing!"
    exec tini -- "$@"
fi

# if you want to run as root for some reason, weirdo
if [ "$PUID" = "0" ]; then
    exec tini -- "$@"
fi

# set storyteller uid/gid to match what's requested
if [ "$(id -u "$STORYTELLER_USER")" != "$PUID" ] || [ "$(id -g "$STORYTELLER_USER")" != "$PGID" ]; then
    groupmod -o -g "$PGID" "$STORYTELLER_USER" 2>/dev/null || true
    usermod -o -u "$PUID" -g "$PGID" "$STORYTELLER_USER" 2>/dev/null || true
fi

# fix ownership of all writable directories
chown "$STORYTELLER_USER:$STORYTELLER_USER" "$HOME" 2>/dev/null || true

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

# basically look throughall the gpu devices, and add the storyteller user to the group that owns the device
_ensure_gpu_group() {
    [ -e "$1" ] || return 0

    DEV_GID=$(stat -c '%g' "$1")
    [ "$DEV_GID" = "0" ] && return 0

    if id -G "$STORYTELLER_USER" | tr ' ' '\n' | grep -qx "$DEV_GID"; then
        return 0
    fi

    GROUP_NAME=$(getent group "$DEV_GID" 2>/dev/null | head -1 | cut -d: -f1 || true)
    if [ -z "$GROUP_NAME" ]; then
        GROUP_NAME="gpu_${DEV_GID}"
        groupadd -g "$DEV_GID" "$GROUP_NAME" 2>/dev/null || true
    fi

    usermod -aG "$GROUP_NAME" "$STORYTELLER_USER" 2>/dev/null || true
}

for _dev in /dev/kfd /dev/dri/render* /dev/nvidia*; do
    _ensure_gpu_group "$_dev"
done

exec gosu "$STORYTELLER_USER" tini -- "$@"
