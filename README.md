# Storyteller

A self-hostable system for producing ebooks with synced audio. Storyteller
allows you to automatically align your audiobooks with their accompanying
ebooks, producing a new ebook with
[EPUB Media Overlays](https://www.w3.org/TR/epub-33/#sec-media-overlays), which
can be read/played with any compatible ebook reader!

## Status

This project is in _very early_ alpha stages. You can literally use it, and it
might even work, but it's likely to have several bugs, and the interface is...
minimal, to put it overly generously.

## How to use it

Storyteller is a self-hosted system. It currently consists of two services, an
API and a web interface. Each is distributed as a Docker image:

- API: registry.gitlab.com/smoores/storyteller/api
- Web: registry.gitlab.com/smoores/storyteller/web

### Configuring the API

The API requires very little configuration. By default, it will run on port
8000; if you need to change this, you can specify the `UVICORN_PORT` environment
variable.

You should make sure to mount the `/data` directory as a volume, so that it
persists across container restarts. This is where all files, caches, and
databases will be stored, so take care not to delete it.

### Configuring the Web interface

The web interface needs to be provided with the location of the API service. To
do so, specify the `STORYTELLER_API_HOST` environment variable. You can also
configure the port that the web interface runs on with the `PORT` environment
variable; by default it runs on port 8001.

### Example

```console
# Run the API
$ docker run -v $(pwd)/storyteller:/data -p 8000:8000 registry.gitlab.com/smoores/storyteller/api:latest

# Run the web interface
$ docker run -e STORYTELLER_API_HOST=http://localhost:8000 -p 8001:8001 registry.gitlab.com/smoores/storyteller/web:latest
```

You can now access the web interface at http://localhost:8000, which will give
you an upload form to upload an ebook (must be an EPUB file) and an audiobook
(must be an m4b/mp4 file), and begin processing.

Processing will likely take over an hour, and potentially several hours,
depending on the length of the book. Generating the transcription for each
chapter is expensive!

## Actually reading the synced book

Once you've produced a synced ebook file, you need a reader application that has
support for Media Overlays to actually read it. One day, this project hopes to
include such an application; for now, we recommend using the BookFusion app,
which has some minimal Media Overlay support.

## How it works

This project implements a version of
[forced alignment](https://linguistics.berkeley.edu/plab/guestwiki/index.php?title=Forced_alignment).

First, it generates a transcription of the entire audiobook. Storyteller
attempts to get relatively accurate transcriptions (and associated timestamps)
by using [whisperX](https://github.com/m-bain/whisperX), which itself relies on
OpenAI's [whisper](https://github.com/openai/whisper) via
[faster-whisper](https://github.com/guillaumekln/faster-whisper), and
[wave2vec2](https://huggingface.co/docs/transformers/model_doc/wav2vec2).

Then, iterating through each sentence of each chapter, Storyteller fuzzily
searches through the transcription to find the start timestamp of the first word
of that sentence.

Once all of the sentences have been aligned, Storyteller produces a new EPUB
file, which includes both the audio files from the audiobook _and_ new Media
Overlays, instructing the reader application on where the the current sentence
lives in the audio files.
