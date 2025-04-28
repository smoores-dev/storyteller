#!/usr/bin/env bash
# yarn workspace @storyteller/web tsx src/database/migrate.ts
sqlite3 storyteller.db .schema > schema.sql
git add schema.sql
