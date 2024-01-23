#!/usr/bin/env bash

poetry run python -m uvicorn storyteller.api:app --host ::1 --reload
