#!/usr/bin/env bash

yarn workspace @storyteller/web db:dump-schema

yarn prettier --write schema.sql

git add schema.sql
