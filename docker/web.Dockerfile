ARG BASE_TAG=latest
FROM registry.gitlab.com/smoores/storyteller-base:${BASE_TAG}

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY .yarn/cache ./.yarn/cache
COPY web/package.json ./web/package.json

RUN yarn workspaces focus @storyteller/web
# While using async/await fork:
RUN npm rebuild --build-from-source sqlite3

# When a user cancels a processing worker, if pymport is running,
# it will return to a now-unavailable environment.

# We manually patch it to swallow this flavor of error
COPY web/pymport-swallow-unthrowable.patch ./web/pymport-swallow-unthrowable.patch
RUN patch -p1 node_modules/pymport/src/pymport.h web/pymport-swallow-unthrowable.patch
RUN npm rebuild --build-from-source pymport

COPY . .

RUN gcc -g -fPIC -rdynamic -shared web/sqlite/uuid.c -o web/sqlite/uuid.c.so

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN yarn build:web

EXPOSE 8001

ENV PORT 8001
ENV HOST 0.0.0.0
# ENV NEXT_SHARP_PATH /app/node_modules/sharp
ENV STORYTELLER_DATA_DIR /data

CMD yarn workspace @storyteller/web start
