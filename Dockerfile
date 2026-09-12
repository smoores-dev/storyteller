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
COPY libraries/media-types/package.json ./libraries/media-types/package.json
COPY libraries/mlx-audio/package.json ./libraries/mlx-audio/package.json
COPY config/tsup/package.json ./config/tsup/package.json

# prevent onnxruntime from installing shit, almost always hangs
ENV ONNXRUNTIME_NODE_INSTALL=skip
# --inline-builds streams native build-script output so a hang during the
# link step names the offending package instead of freezing silently
RUN yarn install --inline-builds

# manualy reproducing that stupid onnxruntime install step
ARG BASE_TAG
RUN case "$BASE_TAG" in \
      cuda-12*) ORT_CUDA=cuda12 ;; \
      cuda-13*) ORT_CUDA=cuda13 ;; \
      *) ORT_CUDA= ;; \
    esac && \
    if [ -n "$ORT_CUDA" ]; then \
      ORT_VERSION=$(node -p "require('./node_modules/onnxruntime-node/package.json').version") && \
      ORT_DIST="onnxruntime-linux-x64-gpu_$ORT_CUDA-$ORT_VERSION" && \
      curl -fL --retry 5 --retry-all-errors --retry-delay 15 --connect-timeout 30 --speed-limit 10000 --speed-time 60 \
        -o /tmp/ort.tgz "https://github.com/microsoft/onnxruntime/releases/download/v$ORT_VERSION/$ORT_DIST.tgz" && \
      tar -xzf /tmp/ort.tgz --strip-components=2 -C node_modules/onnxruntime-node/bin/napi-v6/linux/x64 \
        "$ORT_DIST/lib/libonnxruntime_providers_cuda.so" "$ORT_DIST/lib/libonnxruntime_providers_shared.so" && \
      rm /tmp/ort.tgz; \
    fi

COPY docker-scripts/ ./scripts/

COPY . .

RUN cp docker-scripts/* ./scripts/

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

RUN yarn workspaces foreach -Rpt --from @storyteller-platform/web run build

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

# libvulkan1 and the mesa ICDs back onnxruntime's WebGPU provider on AMD and
# Intel GPUs, NVIDIA mounts its own ICD through the container toolkit
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gosu libcurl4 libxml2 libvulkan1 mesa-vulkan-drivers apache2-utils \
    && rm -rf /var/lib/apt/lists/*

RUN  (userdel -r ubuntu || true) \
    && groupadd -g 1000 storyteller \
    && useradd -u 1000 -g storyteller -m storyteller \
    && (usermod -aG render,video storyteller 2>/dev/null || true)

COPY --from=ghcr.io/readium/readium:0.9.1 /opt/readium /opt/readium
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
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics

ENV ERROR_ALIGN_NATIVE_BINDING=/app/.next/standalone/applications/web/work-dist/@storyteller-platform/align/
ENV STORYTELLER_WORKER=worker.mjs
ENV STORYTELLER_FILE_WRITE_WORKER=fileWriteWorker.mjs

WORKDIR /app/.next/standalone/applications/web

COPY --from=builder /app/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=builder /app/scripts/run-server.sh /usr/local/bin/run-server.sh
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/run-server.sh

ENTRYPOINT ["entrypoint.sh"]

CMD ["run-server.sh"]
