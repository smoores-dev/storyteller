# BASE_TAG should match the GPU variant: main (cpu), cuda-11, cuda-12, cuda-13, vulkan, sycl
ARG BASE_TAG=main
# WHISPER_VARIANT is the whisper.cpp build to pre-install (e.g., linux-x64-cuda-12.9.0)
# declared at top level so it's available in all stages
ARG WHISPER_VARIANT=""
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS builder

WORKDIR /app

# onnxruntime-node's postinstall on linux/x64 downloads the 205MB CUDA execution
# provider nupkg from nuget.org inside the yarn link step, with no retries and
# no progress output, which is what stalls the amd64 builds. fetch it here
# instead so it gets its own cached layer, curl retries, and readable logs.
# only cuda-12 bases can load it (built against cuda 12 + cudnn 9), so every
# other variant skips it and runs cpu inference from the bundled binary.
ARG BASE_TAG
ARG ORT_VERSION=1.24.3
RUN mkdir -p /tmp/ort && case "$BASE_TAG" in cuda-12*) \
      curl -fsSL --retry 5 --retry-all-errors -o /tmp/ort.nupkg \
        "https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime.gpu.linux/$ORT_VERSION/microsoft.ml.onnxruntime.gpu.linux.$ORT_VERSION.nupkg" \
      && python3 -c "import zipfile,sys; z=zipfile.ZipFile('/tmp/ort.nupkg'); [open('/tmp/ort/'+n.rsplit('/',1)[1],'wb').write(z.read(n)) for n in z.namelist() if n.startswith('runtimes/linux-x64/native/libonnxruntime_providers_')]" \
      && rm /tmp/ort.nupkg && ls -la /tmp/ort ;; \
    esac

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
# ONNXRUNTIME_NODE_INSTALL=skip makes the onnxruntime-node postinstall exit
# without downloading anything, then the prefetched cuda provider libs (if any)
# are dropped into the location the postinstall would have written them to.
RUN ONNXRUNTIME_NODE_INSTALL=skip NODE_OPTIONS="--dns-result-order=ipv4first" yarn install --inline-builds \
    && if [ -n "$(ls /tmp/ort)" ]; then cp /tmp/ort/*.so node_modules/onnxruntime-node/bin/napi-v6/linux/x64/; fi \
    && rm -rf /tmp/ort

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

ARG BASE_TAG=main
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS runner

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

# onnxruntime-node loads its native binding via dynamic path.join() that
# next.js file tracing cannot follow. copy the js files and only the linux
# platform binaries (skips ~160mb of darwin/win32 binaries from the tarball).
COPY --from=builder /app/node_modules/onnxruntime-node/dist ./.next/standalone/node_modules/onnxruntime-node/dist
COPY --from=builder /app/node_modules/onnxruntime-node/package.json ./.next/standalone/node_modules/onnxruntime-node/package.json
COPY --from=builder /app/node_modules/onnxruntime-node/bin/napi-v6/linux ./.next/standalone/node_modules/onnxruntime-node/bin/napi-v6/linux


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

# set the whisper variant that was pre-installed in this image
# this tells the runtime which binary to use without needing detection
ARG WHISPER_VARIANT
ENV STORYTELLER_WHISPER_VARIANT=${WHISPER_VARIANT}

WORKDIR /app/.next/standalone/applications/web

COPY --from=builder /app/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["entrypoint.sh"]

CMD ["node", "--enable-source-maps", "server.js"]
