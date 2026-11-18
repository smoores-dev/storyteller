#!/usr/bin/env bash

STORYTELLER_LOG_LEVEL=error yarn workspace @storyteller/web db:dump

git add applications/web/schema.sql applications/web/src/database/schema.ts
