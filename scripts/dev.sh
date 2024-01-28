#!/usr/bin/env bash

poetry run python -m uvicorn storyteller.api:app --host 0.0.0.0 --reload
