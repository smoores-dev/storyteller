# See here for image contents: https://github.com/microsoft/vscode-dev-containers/tree/v0.177.0/containers/python-3/.devcontainer/base.Dockerfile

# [Choice] Python version: 3, 3.9, 3.8, 3.7, 3.6
ARG VARIANT="3.10"
FROM mcr.microsoft.com/vscode/devcontainers/python:0-${VARIANT}

# [Optional] If your pip requirements rarely change, uncomment this section to add them to the image.
# COPY requirements.txt /tmp/pip-tmp/
# RUN pip3 --disable-pip-version-check --no-cache-dir install -r /tmp/pip-tmp/requirements.txt \
#    && rm -rf /tmp/pip-tmp

RUN . /usr/local/share/nvm/nvm.sh && nvm install node

# Install whisperx dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get -y install --no-install-recommends \
  wget \
  swig \
  libpulse-dev \
  libasound2-dev \
  ffmpeg \
  libavcodec-extra

ENV PYTHONFAULTHANDLER=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONHASHSEED=random \
  PIP_NO_CACHE_DIR=off \
  PIP_DISABLE_PIP_VERSION_CHECK=on \
  PIP_DEFAULT_TIMEOUT=100 \
  POETRY_VERSION=1.5.0

USER vscode

# System deps:
RUN pip install "poetry==$POETRY_VERSION"

ENV PATH "/home/vscode/.local/bin:$PATH"

RUN wget -O /home/vscode/en.txt https://raw.githubusercontent.com/dwyl/english-words/master/words.txt

# [Optional] Uncomment this line to install global node packages.
# RUN su vscode -c "source /usr/local/share/nvm/nvm.sh && npm install -g <your-package-here>" 2>&1
