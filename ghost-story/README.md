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

USAGE ghost-story install|status|server|vad

COMMANDS

  install    Install whisper.cpp binary and models.

Usage:
  ghost-story install binary [variant]  - Install binary (auto-detects platform if variant not specified)
  ghost-story install model <model>     - Install a whisper model
  ghost-story install vad               - Install Silero VAD model
  ghost-story install all               - Install binary, all models, and VAD
  status     Show installation status
  server     Start a whisper.cpp transcription server
  vad        Run voice activity detection on an audio file
```

## Credits

Based on echogarden, developed by Rotem Dan (IPA: /ˈʁɒːtem ˈdän/).

## License

GNU General Public License v3

Licenses for components, models and other dependencies are detailed on
[this page](docs/Licenses.md).
