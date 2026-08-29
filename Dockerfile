# BASE_TAG should match the GPU variant: main (cpu), cuda-11, cuda-12, cuda-13, vulkan, sycl
ARG BASE_TAG=main
# WHISPER_VARIANT is the whisper.cpp build to pre-install (e.g., linux-x64-cuda-12.9.0)
# declared at top level so it's available in all stages
ARG WHISPER_VARIANT=""
# TARGETARCH is declared globally so it can be used in a FROM line
ARG TARGETARCH
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS builder

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/cache ./.yarn/cache
COPY .yarn/patches ./.yarn/patches

COPY applications/web/package.json ./applications/web/package.json
COPY libraries/align/package.json ./libraries/align/package.json
COPY libraries/align/binding.gyp ./libraries/align/binding.gyp
COPY libraries/align/prebuilds/linux-x64 ./libraries/align/prebuilds/linux-x64
COPY libraries/align/prebuilds/linux-arm64 ./libraries/align/prebuilds/linux-arm64
COPY libraries/fs/package.json ./libraries/fs/package.json
COPY libraries/mapping/package.json ./libraries/mapping/package.json
COPY libraries/epub/package.json ./libraries/epub/package.json
COPY libraries/path/package.json ./libraries/path/package.json
COPY libraries/audiobook/package.json ./libraries/audiobook/package.json
COPY libraries/ghost-story/package.json ./libraries/ghost-story/package.json
COPY libraries/opds/package.json ./libraries/opds/package.json
COPY libraries/nodekit/package.json ./libraries/nodekit/package.json
COPY config/tsup/package.json ./config/tsup/package.json
COPY config/eslint/package.json ./config/eslint/package.json

# --inline-builds streams native build-script output so a hang during the
# link step names the offending package instead of freezing silently.
# onnxruntime-node's postinstall downloads the CUDA execution provider on
# linux/x64, which is dead weight in images that have no CUDA runtime.
# It only ships a CUDA 12 provider, so the cuda-11 images skip it too, matching
# the package set scripts/install-cuda.sh picks for CUDA 11.
ARG WHISPER_VARIANT
RUN case "$WHISPER_VARIANT" in \
      *cuda-1[2-9]*) ;; \
      *) export ONNXRUNTIME_NODE_INSTALL=skip ;; \
    esac; \
    yarn install --inline-builds

COPY docker-scripts/ ./scripts/

COPY . .

RUN cp docker-scripts/* ./scripts/

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

RUN yarn workspaces foreach -Rpt --from @storyteller-platform/web --exclude @storyteller-platform/eslint run build

# Pre-install whisper.cpp binary and default model in builder stage
ARG TARGETARCH
ARG WHISPER_VARIANT
RUN if [ -z "$WHISPER_VARIANT" ]; then \
      case "$TARGETARCH" in \
        amd64) WHISPER_VARIANT="linux-x64-cpu" ;; \
        arm64) WHISPER_VARIANT="linux-arm64-cpu" ;; \
        *) echo "Unsupported architecture: $TARGETARCH" && exit 1 ;; \
      esac; \
    fi && \
    node ./libraries/ghost-story/dist/cli/bin.js \
      install binary "$WHISPER_VARIANT" && \
    node ./libraries/ghost-story/dist/cli/bin.js \
      install model tiny.en && \
    if [ "$WHISPER_VARIANT" = "linux-x64-cpu" ]; then \
      echo "Also installing legacy CPU variant for older hardware..." && \
      node ./libraries/ghost-story/dist/cli/bin.js \
        install binary linux-x64-cpu-legacy; \
    fi

# Pre-download the CTC alignment model so a fresh container can align offline.
# It resolves the same device and precision the worker will, so the weights it
# fetches are the ones the run actually loads.
RUN node ./libraries/ghost-story/dist/cli/bin.js install ctc-model \
    || echo "CTC model pre-install failed, it will download on first use"

# The worker bundle keeps onnxruntime and transformers external, so their
# dependency closure has to exist on disk. Next's tracing never sees them
# because nothing in the Next graph imports them.
RUN node -e 'const fs=require("node:fs"),path=require("node:path");const seen=new Set();const walk=(name)=>{const dir=path.join("node_modules",name);if(seen.has(name)||!fs.existsSync(dir))return;seen.add(name);const pkg=JSON.parse(fs.readFileSync(path.join(dir,"package.json"),"utf8"));for(const dep of [...Object.keys(pkg.dependencies??{}),...Object.keys(pkg.optionalDependencies??{})])walk(dep)};["onnxruntime-node","onnxruntime-web","onnxruntime-common","@huggingface/transformers"].forEach(walk);for(const name of seen){const dest=path.join("/app/ort-deps",name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(path.join("node_modules",name),dest,{recursive:true,dereference:true})}'
# onnxruntime-node ships prebuilt bindings for every platform in one tarball,
# and the win32 and darwin ones are ~160 MB a Linux image can never load.
RUN rm -rf /app/ort-deps/onnxruntime-node/bin/napi-v6/win32 \
           /app/ort-deps/onnxruntime-node/bin/napi-v6/darwin

# The whisper variant defaults per architecture, and ENV cannot branch, so the
# runner picks an arch-specific base that carries the right default.
ARG BASE_TAG=main
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS runner-base-amd64
ARG WHISPER_VARIANT
ENV STORYTELLER_WHISPER_VARIANT=${WHISPER_VARIANT:-linux-x64-cpu}

ARG BASE_TAG=main
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS runner-base-arm64
ARG WHISPER_VARIANT
ENV STORYTELLER_WHISPER_VARIANT=${WHISPER_VARIANT:-linux-arm64-cpu}

FROM runner-base-${TARGETARCH} AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gosu libcurl4 libxml2 \
    && rm -rf /var/lib/apt/lists/*

RUN  (userdel -r ubuntu || true) \
    && groupadd -g 1000 storyteller \
    && useradd -u 1000 -g storyteller -m storyteller \
    && (usermod -aG render,video storyteller 2>/dev/null || true)

COPY --from=ghcr.io/readium/readium:0.6.5 /opt/readium /opt/readium
RUN ln -sf /opt/readium /usr/local/bin/readium


COPY --from=builder /app/applications/web/.next/standalone ./.next/standalone
COPY --from=builder /app/applications/web/public ./.next/standalone/applications/web/public
COPY --from=builder /app/applications/web/.next/static ./.next/standalone/applications/web/.next/static
RUN mkdir -p ./.next/standalone/applications/web/.next/cache \
    && chown storyteller:storyteller ./.next/standalone/applications/web/.next/cache

# Copy SQL migrations
COPY --from=builder /app/applications/web/migrations ./.next/standalone/applications/web/migrations

# scripts
# just so its in the right place and we dont have to modify the docs
COPY --from=builder /app/scripts/ ./.next/standalone/applications/web/scripts/

# worker bundles (ESM with code-split chunks)
COPY --from=builder /app/applications/web/work-dist ./.next/standalone/applications/web/work-dist
COPY --from=builder /app/applications/web/file-write-dist ./.next/standalone/applications/web/file-write-dist

COPY --from=builder /app/libraries/align/prebuilds/linux-x64 ./.next/standalone/applications/web/work-dist/@storyteller-platform/align/prebuilds/linux-x64
COPY --from=builder /app/libraries/align/prebuilds/linux-arm64 ./.next/standalone/applications/web/work-dist/@storyteller-platform/align/prebuilds/linux-arm64

# Echogarden tries to naively resolve its own wasm builds
COPY --from=builder /app/node_modules/@echogarden/icu-segmentation-wasm/wasm/*.wasm ./.next/standalone/applications/web/work-dist/

# @parcel/watcher native binaries are loaded dynamically at runtime and
# not traced by next.js into the standalone output
COPY --from=builder /app/node_modules/@parcel ./.next/standalone/node_modules/@parcel

# better-sqlite3 v13+ ships platform prebuilds that are loaded dynamically
COPY --from=builder /app/node_modules/better-sqlite3/prebuilds ./.next/standalone/node_modules/better-sqlite3/prebuilds

# kuromoji package: the bundled kuroshiro-analyzer-kuromoji still calls
# require.resolve("kuromoji") at runtime to locate its dict/ directory, so the
# package must exist on disk in a location reachable from web/work-dist/.
COPY --from=builder /app/node_modules/kuromoji ./.next/standalone/node_modules/kuromoji

# onnxruntime-node loads its .node binding through a dynamic require that
# esbuild cannot bundle, so the packages stay external and are copied whole
COPY --from=builder /app/ort-deps ./.next/standalone/node_modules


# Copy pre-installed whisper binaries and models from builder
COPY --from=builder --chown=storyteller:storyteller /root/.local/share/ghost-story /home/storyteller/.local/share/ghost-story

EXPOSE 8001

ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

ENV HOME=/home/storyteller
ENV PORT=8001
ENV HOSTNAME=0.0.0.0
ENV STORYTELLER_DATA_DIR=/data
ENV READIUM_PORT=9000
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

ENV ERROR_ALIGN_NATIVE_BINDING=/app/.next/standalone/applications/web/work-dist/@storyteller-platform/align/
ENV STORYTELLER_WORKER=worker.mjs
ENV STORYTELLER_FILE_WRITE_WORKER=fileWriteWorker.mjs

WORKDIR /app/.next/standalone/applications/web

COPY --from=builder /app/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]

CMD ["node", "--enable-source-maps", "server.js"]
