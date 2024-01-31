#!/usr/bin/env bash

poetry run black --check storyteller
poetry run yarn pyright
