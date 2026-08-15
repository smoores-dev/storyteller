#!/usr/bin/env bash

export NODE_ARCH=$([ "${TARGETARCH}" == "amd64" ] && echo "x64" || echo "arm64")

wget https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-$NODE_ARCH.tar.xz

tar -xf node-v24.19.0-linux-$NODE_ARCH.tar.xz

rm node-v24.19.0-linux-$NODE_ARCH.tar.xz

cp -r node-v24.19.0-linux-$NODE_ARCH/* /usr/

rm -r node-v24.19.0-linux-$NODE_ARCH

corepack enable

yes | yarn --version
