FROM registry.gitlab.com/smoores/storyteller-base:latest

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

EXPOSE 8001

ENV PORT=8001
ENV HOST=0.0.0.0
ENV STORYTELLER_DATA_DIR=/data
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

CMD ["yarn", "workspace", "@storyteller/web", "start"]
