# See here for image contents: https://github.com/microsoft/vscode-dev-containers/tree/v0.177.0/containers/python-3/.devcontainer/base.Dockerfile

# [Choice] Python version: 3, 3.9, 3.8, 3.7, 3.6
ARG VARIANT="3.9"
FROM mcr.microsoft.com/vscode/devcontainers/python:0-${VARIANT}

# [Optional] If your pip requirements rarely change, uncomment this section to add them to the image.
# COPY requirements.txt /tmp/pip-tmp/
# RUN pip3 --disable-pip-version-check --no-cache-dir install -r /tmp/pip-tmp/requirements.txt \
#    && rm -rf /tmp/pip-tmp

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends swig libpulse-dev libasound2-dev ffmpeg libavcodec-extra

USER vscode
# RUN curl -sSL https://install.python-poetry.org | python3 -
# ENV PATH "/home/vscode/.local/bin:$PATH"

RUN wget -O /home/vscode/en.txt https://raw.githubusercontent.com/dwyl/english-words/master/words.txt

RUN python -m pip install pip-tools

RUN curl -fsSL https://deno.land/x/install/install.sh | sh

ENV DENO_INSTALL=/home/vscode/.deno
ENV PATH=$DENO_INSTALL/bin:$PATH

# [Optional] Uncomment this line to install global node packages.
# RUN su vscode -c "source /usr/local/share/nvm/nvm.sh && npm install -g <your-package-here>" 2>&1
