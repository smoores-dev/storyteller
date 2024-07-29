FROM node:20-bullseye

RUN apt-get update && \
    apt-get install -y build-essential git cmake software-properties-common

WORKDIR /app

COPY --link --from=mwader/static-ffmpeg:6.1.1 /ffmpeg /usr/local/bin/
COPY --link --from=mwader/static-ffmpeg:6.1.1 /ffprobe /usr/local/bin/

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY .yarn/cache ./.yarn/cache
COPY web/package.json ./web/package.json

RUN yarn workspaces focus @storyteller/web

COPY . .

RUN gcc -g -fPIC -rdynamic -shared web/sqlite/uuid.c -o web/sqlite/uuid.c.so

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN yarn build:web

EXPOSE 8001

ENV PORT=8001
ENV HOST=0.0.0.0
# ENV NEXT_SHARP_PATH=/app/node_modules/sharp
ENV STORYTELLER_DATA_DIR=/data

CMD yarn workspace @storyteller/web start
