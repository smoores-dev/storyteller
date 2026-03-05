# BASE_TAG should match the GPU variant: main (cpu), cuda-11, cuda-12, cuda-13, vulkan
ARG BASE_TAG=main
# WHISPER_VARIANT is the whisper.cpp build to pre-install (e.g., linux-x64-cuda-12.9.0)
# declared at top level so it's available in all stages
ARG WHISPER_VARIANT=""
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS builder

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY .yarn/cache ./.yarn/cache
COPY .yarn/patches ./.yarn/patches

COPY web/package.json ./web/package.json
COPY align/package.json ./align/package.json
COPY fs/package.json ./fs/package.json
COPY epub/package.json ./epub/package.json
COPY path/package.json ./path/package.json
COPY audiobook/package.json ./audiobook/package.json
COPY ghost-story/package.json ./ghost-story/package.json
COPY config/tsup/package.json ./config/tsup/package.json
COPY config/eslint/package.json ./config/eslint/package.json

RUN yarn install

COPY docker-scripts/ ./scripts/

COPY . .

RUN cp docker-scripts/* ./scripts/

RUN gcc -g -fPIC -rdynamic -shared web/sqlite/uuid.c -o web/sqlite/uuid.c.so

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

ENV SQLITE_NATIVE_BINDING=/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node

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
    node ./ghost-story/dist/cli/bin.js \
      install binary "$WHISPER_VARIANT" && \
    node ./ghost-story/dist/cli/bin.js \
      install model tiny.en && \
    if [ "$WHISPER_VARIANT" = "linux-x64-cpu" ]; then \
      echo "Also installing legacy CPU variant for older hardware..." && \
      node ./ghost-story/dist/cli/bin.js \
        install binary linux-x64-cpu-legacy; \
    fi

ARG BASE_TAG=main
FROM registry.gitlab.com/storyteller-platform/storyteller/storyteller-base:${BASE_TAG} AS runner

WORKDIR /app

# Install FFmpeg runtime libraries (required by whisper.cpp with WHISPER_FFMPEG=1)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ARG READIUM_VERSION=0.6.1

# Install Readium CLI using our script
COPY --from=builder /app/web/install-readium-cli.sh /tmp/install-readium-cli.sh
RUN chmod +x /tmp/install-readium-cli.sh && \
    /tmp/install-readium-cli.sh ${READIUM_VERSION} && \
    rm /tmp/install-readium-cli.sh


COPY --from=builder /app/web/.next/standalone ./.next/standalone
COPY --from=builder /app/web/public ./.next/standalone/web/public
COPY --from=builder /app/web/.next/static ./.next/standalone/web/.next/static
COPY --from=builder /app/web/sqlite/uuid.c.so ./.next/standalone/web/sqlite/uuid.c.so

# Copy SQL migrations
COPY --from=builder /app/web/migrations ./.next/standalone/web/migrations

# scripts
# just so its in the right place and we dont have to modify the docs
COPY --from=builder /app/scripts/ ./.next/standalone/web/scripts/

# Copy pre-installed whisper binaries and models from builder
COPY --from=builder /root/.local/share/ghost-story /root/.local/share/ghost-story

EXPOSE 8001

ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

ENV PORT=8001
ENV HOSTNAME=0.0.0.0
ENV STORYTELLER_DATA_DIR=/data
ENV READIUM_PORT=9000
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

ENV SQLITE_NATIVE_BINDING=/app/.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node
ENV STORYTELLER_WORKER=worker.cjs
ENV STORYTELLER_FILE_WRITE_WORKER=fileWriteWorker.cjs

# set the whisper variant that was pre-installed in this image
# this tells the runtime which binary to use without needing detection
ARG WHISPER_VARIANT
ENV STORYTELLER_WHISPER_VARIANT=${WHISPER_VARIANT}

WORKDIR /app/.next/standalone/web


ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "--enable-source-maps", "server.js"]
