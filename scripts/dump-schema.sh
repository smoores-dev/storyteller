#!/usr/bin/env bash
sqlite3 storyteller.db .schema > schema.sql
git add schema.sql
