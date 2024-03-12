FROM python:3.11-slim

# Install whisperx dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get -y install --no-install-recommends \
  wget \
  swig \
  libpulse-dev \
  libasound2-dev \
  ffmpeg \
  libavcodec-extra \
  gcc \
  libsqlite3-dev

ENV PYTHONFAULTHANDLER=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONHASHSEED=random \
  PIP_NO_CACHE_DIR=off \
  PIP_DISABLE_PIP_VERSION_CHECK=on \
  PIP_DEFAULT_TIMEOUT=100 \
  POETRY_VERSION=1.7.1

# System deps:
RUN pip install "poetry==$POETRY_VERSION"

WORKDIR /usr/app/src

RUN mkdir dict && \
  wget -O dict/en.txt https://raw.githubusercontent.com/dwyl/english-words/master/words.txt

COPY pyproject.toml poetry.lock ./

RUN poetry install --no-interaction --no-ansi && \
  poetry run python -m nltk.downloader punkt

ENV STORYTELLER_DATA_DIR=/data

COPY migrations ./migrations
COPY storyteller/api ./storyteller/api
COPY storyteller/synchronize ./storyteller/synchronize

ENTRYPOINT poetry run uvicorn storyteller.api:app --host 0.0.0.0
