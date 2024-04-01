FROM node:20 

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  ffmpeg \
  wget \
  build-essential \
  checkinstall \
  libncursesw5-dev \
  libssl-dev \
  libsqlite3-dev \
  tk-dev \
  libgdbm-dev \
  libc6-dev \
  libbz2-dev \
  libffi-dev \
  zlib1g-dev

RUN mkdir -p /home/node/.local

RUN wget https://www.python.org/ftp/python/3.12.2/Python-3.12.2.tar.xz -O /tmp/python.tar.xz \
  && tar -xf /tmp/python.tar.xz -C /tmp \
  && cd /tmp/Python-3.12.2 \
  && ./configure --enable-optimizations --prefix=/home/node/.local \
  && make -j $(nproc) \
  && make install \
  && cd \
  && rm -r /tmp/Python-3.12.2 \
  && rm /tmp/python.tar.xz

RUN mkdir /app

WORKDIR /app

RUN chown -R node:node /home/node
RUN chown -R node:node /app

USER node

ENV PATH=/home/node/.local/bin:$PATH

RUN pip3 install -U pip setuptools
RUN pip3 install fuzzysearch
RUN pip3 install torch==2.2.1+cpu torchaudio==2.2.1+cpu --index-url https://download.pytorch.org/whl/cpu
RUN pip3 install git+https://github.com/m-bain/whisperx.git

ARG PYTHONPATH="python3 -c \"import sys; print(':'.join([p for p in sys.path if p]))\""

COPY --chown=node package.json yarn.lock .yarnrc.yml ./
COPY --chown=node .yarn/releases ./.yarn/releases
COPY --chown=node .yarn/cache ./.yarn/cache
COPY --chown=node web/package.json ./web/package.json

RUN yarn workspaces focus @storyteller/web

COPY --chown=node . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN PYTHONPATH=$(eval "$PYTHONPATH") yarn build:web

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1


EXPOSE 8001

ENV PORT 8001
ENV HOST 0.0.0.0
ENV PYTHONPATH=${PYTHONPATH}
# ENV NEXT_SHARP_PATH /app/node_modules/sharp

CMD PYTHONPATH=$(eval "$PYTHONPATH") yarn workspace @storyteller/web start
