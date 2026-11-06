#!/usr/bin/env bash
set -e

export NODE_ARCH=$([ "${TARGETARCH}" == "amd64" ] && echo "x64" || echo "arm64")

wget https://nodejs.org/dist/v26.12.1/node-v26.12.1-linux-$NODE_ARCH.tar.xz

tar -xf node-v26.12.1-linux-$NODE_ARCH.tar.xz

rm node-v26.12.1-linux-$NODE_ARCH.tar.xz

cp -r node-v26.12.1-linux-$NODE_ARCH/* /usr/

rm -r node-v26.12.1-linux-$NODE_ARCH

npm i -g corepack

corepack enable

yes | yarn --version
