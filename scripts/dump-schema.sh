#!/usr/bin/env bash

yarn workspace @storyteller-platform/web db:dump

git add applications/web/schema.sql applications/web/src/database/schema.ts
