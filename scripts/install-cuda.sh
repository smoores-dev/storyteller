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

apt-get update
apt-get install -y --no-install-recommends "cuda-toolkit-${CUDA_VERSION}"
rm -rf /var/lib/apt/lists/*

# create symlink so /usr/local/cuda always points to the installed version
ln -sf "/usr/local/cuda-${CUDA_VERSION_DOT}" /usr/local/cuda