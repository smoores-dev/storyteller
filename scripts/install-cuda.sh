#!/bin/sh
set -e

# usage: install-cuda.sh <cuda-version> <ubuntu-version>
# example: install-cuda.sh 12-9 2404

CUDA_VERSION="$1"
UBUNTU_VERSION="${2:-2404}"

# convert 12-9 to 12.9 for the path
CUDA_VERSION_DOT=$(echo "$CUDA_VERSION" | tr '-' '.')

wget "https://developer.download.nvidia.com/compute/cuda/repos/ubuntu${UBUNTU_VERSION}/x86_64/cuda-keyring_1.1-1_all.deb"
dpkg -i cuda-keyring_1.1-1_all.deb
rm cuda-keyring_1.1-1_all.deb

# onnxruntime's CUDA execution provider needs cuDNN 9 plus cuFFT and cuRAND on
# top of the runtime whisper.cpp uses. ORT dropped CUDA 11, so 11.8 keeps the
# original whisper-only package set.
CUDA_MAJOR=$(echo "$CUDA_VERSION" | cut -d- -f1)
EXTRA_PACKAGES=""
case "$CUDA_MAJOR" in
  12 | 13)
    EXTRA_PACKAGES="libcufft-${CUDA_VERSION} libcurand-${CUDA_VERSION} libcudnn9-cuda-${CUDA_MAJOR}"
    ;;
esac

apt-get update
# EXTRA_PACKAGES is deliberately unquoted so it splits into separate packages
# shellcheck disable=SC2086
apt-get install -y --no-install-recommends "cuda-cudart-${CUDA_VERSION}" "libcublas-${CUDA_VERSION}" $EXTRA_PACKAGES
rm -rf /var/lib/apt/lists/*

# create symlink so /usr/local/cuda always points to the installed version
ln -sf "/usr/local/cuda-${CUDA_VERSION_DOT}" /usr/local/cuda
