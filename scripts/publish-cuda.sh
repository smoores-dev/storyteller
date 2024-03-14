#!/usr/bin/env bash

docker buildx create --use --driver=docker-container cuda

CI_REGISTRY_IMAGE=registry.gitlab.com/smoores/storyteller

docker buildx build --push -f docker/api.Dockerfile --cache-from \
  type=registry,ref=$CI_REGISTRY_IMAGE/api-cache:cuda --cache-to \
  type=registry,ref=$CI_REGISTRY_IMAGE/api-cache:cuda,mode=max --tag \
  $CI_REGISTRY_IMAGE/api:cuda .
