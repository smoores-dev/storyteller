FROM registry.gitlab.com/smoores/storyteller-base:latest AS builder

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY .yarn/cache ./.yarn/cache
COPY web/package.json ./web/package.json

COPY fs/package.json ./fs/package.json
COPY epub/package.json ./epub/package.json

RUN yarn workspaces focus @storyteller/web

COPY docker-scripts/ ./scripts/

COPY . .

RUN cp docker-scripts/* ./scripts/

RUN gcc -g -fPIC -rdynamic -shared web/sqlite/uuid.c -o web/sqlite/uuid.c.so

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

RUN yarn build:web

FROM registry.gitlab.com/smoores/storyteller-base:latest AS runner

WORKDIR /app

COPY --from=builder /app/web/.next/standalone ./.next/standalone
COPY --from=builder /app/web/public ./.next/standalone/web/public
COPY --from=builder /app/web/.next/static ./.next/standalone/web/.next/static
COPY --from=builder /app/web/sqlite/uuid.c.so ./.next/standalone/web/sqlite/uuid.c.so

# Copy SQL migrations
COPY --from=builder /app/web/migrate-dist ./.next/standalone/web/migrate-dist
COPY --from=builder /app/web/migrations ./.next/standalone/web/migrations

# WASM files aren't statically imported, so esbuild doesn't find them and they need to be manually copied over
COPY --from=builder /app/node_modules/@echogarden/speex-resampler-wasm/wasm/*.wasm ./.next/standalone/web/work-dist/
COPY --from=builder /app/node_modules/@echogarden/pffft-wasm/dist/simd/pffft.wasm ./.next/standalone/web/work-dist/
COPY --from=builder /app/node_modules/tiktoken/lite/tiktoken_bg.wasm ./.next/standalone/web/work-dist/

# Unfortunately, echogarden attempts to manually resolve some of its own files
COPY --from=builder /app/node_modules/echogarden/data ./.next/standalone/data
COPY --from=builder /app/node_modules/echogarden/dist ./.next/standalone/dist
COPY --from=builder /app/node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.data ./.next/standalone/web/work-dist/

EXPOSE 8001

ARG CI_COMMIT_TAG
ENV CI_COMMIT_TAG=${CI_COMMIT_TAG}

ENV PORT=8001
ENV HOSTNAME=0.0.0.0
ENV STORYTELLER_DATA_DIR=/data
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

ENV SQLITE_NATIVE_BINDING=/app/.next/standalone/node_modules/better-sqlite3/build/Release/better_sqlite3.node
ENV STORYTELLER_WORKER=worker.cjs

WORKDIR /app/.next/standalone/web

CMD ["node", "--run", "start", "migrate-dist/migrate.cjs"]
