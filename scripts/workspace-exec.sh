#!/usr/bin/env bash
set -euo pipefail

workspace="$1"
bin="$2"
shift 2

exec yarn workspace @storyteller/$workspace $bin $@
