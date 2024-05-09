#!/bin/bash

if [[ "$EAS_BUILD_PLATFORM" == "android" ]]; then
  DEBIAN_FRONTEND=noninteractive sudo apt-get update && sudo apt-get install --yes cmake ninja-build
elif [[ "$EAS_BUILD_PLATFORM" == "ios" ]]; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install cmake pkg-config
fi
