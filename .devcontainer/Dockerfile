FROM node:20 

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  git-lfs \
  ffmpeg \
  sudo \
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
  python3-dev \
  python3-full \
  python3-pip \
  sqlite3 \
  zlib1g-dev

RUN mkdir -p /home/node/.local

# RUN wget https://www.python.org/ftp/python/3.12.2/Python-3.12.2.tar.xz -O /tmp/python.tar.xz \
#   && tar -xf /tmp/python.tar.xz -C /tmp \
#   && cd /tmp/Python-3.12.2 \
#   && ./configure --enable-optimizations --prefix=/home/node/.local \
#   && make -j $(nproc) \
#   && make install \
#   && cd \
#   && rm -r /tmp/Python-3.12.2 \
#   && rm /tmp/python.tar.xz

RUN python3 -m venv /home/node/.local/venv

RUN chown -R node:node /home/node
RUN passwd -d node
RUN adduser node sudo
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER node

ENV PATH=/home/node/.local/venv/bin:$PATH

RUN pip install -U pip setuptools
RUN pip install fuzzysearch
RUN pip install torch==2.2.1+cpu torchaudio==2.2.1+cpu --index-url https://download.pytorch.org/whl/cpu
RUN pip install git+https://github.com/m-bain/whisperx.git

ENV NEXT_TELEMETRY_DISABLED 1

