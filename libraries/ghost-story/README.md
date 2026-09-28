# @storyteller-platform/ghost-story

Minimal fork of [echogarden](https://github.com/echogarden-project/echogarden)
to be more specific to the Storyteller platform.

## Usage

### CLI

Install the package:

```sh
npm i -g @storyteller-platform/ghost-story
```

Usage:

```sh
ghost-story --help

USAGE ghost-story install|status|serve|vad

COMMANDS

  install    Install whisper.cpp binary and models.

Usage:
  ghost-story install binary [variant]  - Install whisper.cpp binary (auto-detects platform if variant not specified)
  ghost-story install model <model>     - Install a whisper model
  ghost-story install vad               - Install Silero VAD model
  ghost-story install all               - Install binary, all models, and VAD
  status     Show installation status
  server     <deprecated> Start a whisper.cpp transcription server (use `serve` instead)
  serve      Start a server for CTC emissions, and optionally transcription
  vad        Run voice activity detection on an audio file
```

### Offloading CTC emissions

During CTC Alignment, Storyteller offload the expensive computation of emissions
to another machine, for example a gaming PC or a Mac Mini. Run this on that
machine:

```sh
npx @storyteller-platform/ghost-story serve --api-key <a long random string>
```

You are required to provide an API key. You can try using `openssl rand -hex 32`
to generate a random string. You can also set it through the
`GHOST_STORY_API_KEY` environment variable.

Then pick "On another server" under the aligner settings in Storyteller and fill
in `http://<that machine's address>:8765` and the same API key.

If you are running Storyeller in a Docker container on the same machine, you nee
to use `http://host.docker.internal:8765` as the address.

The model will be downloaded on demand and cached in in

- `~/Library/Application Support/ghost-story/models` on macOS
- `~/.local/share/ghost-story/models` on Linux
- `%LOCALAPPDATA%\ghost-story\models` on Windows

What the machine needs:

- Node 24 or newer.
- `ffmpeg` and `ffprobe` on the `PATH`, or pass `--ffmpeg` and `--ffprobe`.
- On Windows, the
  [Microsoft Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe).
  Windows asks whether to let Node through the firewall the first time the
  server starts. You need to allow that.

The server picks its device on its own: MLX on Apple Silicon, DirectML on
Windows and the CPU elsewhere. On Linux with an NVIDIA GPU pass `--device cuda`.

Storyteller uploads each audio file once, starts a job for it and waits on the
job, so no single request stays open long. A reverse proxy in front of the
server has to accept large uploads, for example `client_max_body_size 0;` in
nginx. The server keeps up to `--cache-size` gigabytes of uploaded audio (10 by
default) so a second run with another model does not upload the book again.

### Offloading transcription

The same server can transcribe with whisper.cpp. Pass the model to use:

```sh
npx @storyteller-platform/ghost-story serve --api-key <key> --whisper-model large-v3-turbo
```

The server will install whisper.cpp and specified model before it starts
listening. This exposes an OpenAI compatible API at `/v1/audio/transcriptions`.

In Storyteller, pick `whisper-server` as the transcription engine, set the base
URL to `http://<that machine's address>:8765/v1`, and use the API key. The
server has the same API as `ghost-story server` does, making it compatible with
older versions of Storyteller. The `openai` engine works with the same base URL
and key, with `whisper-1` or an installed model as the model name. `--threads`
and `--processors` work as they do for `ghost-story server`.

### The API

Every service exposes a similar API:

- `POST /v1/{service}` is synchronous like OpenAI.
- `POST /v1/{service}/jobs` creates and returns a job. Pool at
  `/v1/{service}/jobs/{id}` until it is done, then remove it.

An OpenAPI specification is available at `/openapi.json`. You do not require an
API key for this route.

See [openapi.json](./openapi.json), and the
[HTTP API reference](https://storyteller-platform.dev/libraries/ghost-story/http-api)
for the OpenAPI documentation. You can also see it at `./openapi.json` when the
server is running.

## Credits

Based on echogarden, developed by Rotem Dan (IPA: /ˈʁɒːtem ˈdän/).

## License

GNU General Public License v3

Licenses for components, models and other dependencies are detailed on
[this page](docs/Licenses.md).
