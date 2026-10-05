# @storyteller-platform/align

A library and CLI for forced alignment of ebooks and audiobooks.

The CLI is named `stalign`. It aligns an EPUB with an audiobook and produces an
EPUB 3 publication with Media Overlays, or a Readium Guided Navigation Package.
Called with no subcommand, `stalign` runs the entire alignment pipeline on a set
of input files. Called with a subcommand, it runs a single pipeline step.

## Installation

If you have Node.js 24 or newer, you can run the CLI with `npx`:

```sh
npx @storyteller-platform/align --help
```

Standalone executables (no Node.js install required) are published to the GitLab
package registry, and are named `stalign-<os>-<arch>`. Make the downloaded file
executable with `chmod +x`, put it on your `PATH`, and rename it to `stalign`.

Either way, `ffmpeg` must be installed and available on your `PATH` for the
audio processing, transcription, and emission steps.

## Getting help

```sh
stalign --help                 # the pipeline command: all flags, plus examples
stalign help <command>         # description, arguments, and flags for one step
stalign --version              # print the version
stalign completion <shell>     # print a shell completion script
```

## Pipeline

With no subcommand, `stalign` runs every step in order:

1. **process** — Split the audiobook to `--max-length` and chapter boundaries,
   and transcode it if `--codec` asks for something other than `copy`. Skipped
   entirely when `--ctc` is passed with the default `--codec copy`, in which
   case the input audio is used as-is.
2. **emit** (with `--ctc`) or **transcribe** (without it) — Analyze or
   transcribe each processed audio file.
3. **markup** — Wrap every sentence (and word, at `--granularity word`) in the
   EPUB in an element with a unique id. Skipped when `--text-ref` is
   `text-fragment`.
4. **align** — Produce the output publication with Media Overlays.

Two alignment algorithms are available. Pass `--ctc` to use the CTC-based
aligner, which consumes emissions from `stalign emit` and is the more accurate
of the two. Without `--ctc`, the error-align-based aligner is used, which
consumes transcriptions from `stalign transcribe`.

## Examples

To run the CTC aligner on an input audiobook and ebook (the `--emissions` flag
is just used for caching emissions output in the case of a re-run):

```sh
stalign --ctc --audiobook ./peter-and-wendy/audiobook --epub "./peter-and-wendy/text/Peter and Wendy.epub" --emissions ./cache/peter-and-wendy/emissions --output "./peter-and-wendy/aligned/Peter and Wendy (readaloud).epub"
```

To run just the emissions step on an Apple computer with MLX and the quartznet
model:

```sh
stalign emit --model quartznet15x5 --language en --device mlx --dtype fp16 ./peter-and-wendy/audiobook ./cache/peter-and-wendy/emissions
```

To run just the markup step with multi-level (sentence and word) granularity:

```sh
stalign markup --granularity word --language en "./peter-and-wendy/text/Peter and Wendy.epub" "./cache/peter-and-wendy/markedup/Peter and Wendy (marked up).epub"
```

To run just the align step on the output of the emissions and markup examples:

```sh
stalign align --ctc --audiobook ./peter-and-wendy/audiobook --epub "./cache/peter-and-wendy/markedup/Peter and Wendy (marked up).epub" --emissions ./cache/peter-and-wendy/emissions --output "./peter-and-wendy/aligned/Peter and Wendy (readaloud).epub"
```

## Shared flags

| Flag                         | Default    | Applies to                                        | Description                                                                                                                                                                                     |
| ---------------------------- | ---------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--no-progress`              | off        | all commands except `upgrade-epub`                | Disable the progress bar                                                                                                                                                                        |
| `--log-level <type>`         | `silent`   | all commands except `upgrade-epub`                | Log level (`silent`, `debug`, `info`, `warn`, `error`). If enabled, will disable progress bar                                                                                                   |
| `--time`                     | off        | all commands except `upgrade-epub`                | Whether to print timing statistics                                                                                                                                                              |
| `--language <locale>`        | –          | `transcribe`, `emit`, `markup`, `align`, pipeline | BCP 47 language tag representing the primary language of the audio (e.g. `en-US`)                                                                                                               |
| `--granularity <type>`, `-g` | `sentence` | `markup`, `align`, pipeline                       | `word` or `sentence`                                                                                                                                                                            |
| `--autoupgrade`, `-u`        | off        | `markup`, `align`, pipeline                       | Automatically upgrade any EPUB 2 files to EPUB 3                                                                                                                                                |
| `--remove-ncx`               | off        | `markup`, `align`, `upgrade-epub`, pipeline       | Whether to remove the NCX and guide element after upgrading an EPUB from 2 to 3                                                                                                                 |
| `--parallel <integer>`       | `1`        | `process`, `transcribe`                           | How many files to attempt to transcode in parallel. Transcoding takes 1 CPU core per file, so you can generally set this to the number of cores that you wish to be utilized during transcoding |

## `stalign process`

Process audiobook files for transcription.

```sh
stalign process [--parallel INTEGER] [--codec TYPE] [--bitrate BITRATE] [--max-length INTEGER] [--no-progress] [--log-level TYPE] [--time] INPUT OUTPUT
```

Takes a directory of audiobook files (treated as a singular audiobook) and:

1. Splits them according to `--max-length` (default: 2hrs) and chapter
   boundaries
2. Transcodes the audiobook files according to the `--codec` and `--bitrate`
   arguments, if provided

This step is only required for the whisper + error-align (i.e., non-CTC)
alignment algorithm. You may still use it with CTC if you wish to transcode your
input audiobook before aligning.

| Argument/Flag            | Values                                                                               | Default | Description                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| `INPUT`                  | directory                                                                            | –       | Required. Input directory of audiobook files                                                    |
| `OUTPUT`                 | directory                                                                            | –       | Required. Output directory for the processed files                                              |
| `--parallel <integer>`   | –                                                                                    | `1`     | See [shared flags](#shared-flags)                                                               |
| `--codec <type>`         | `libopus`, `libmp3lame`, `aac`, `copy`                                               | `copy`  | The audio codec to transcode to. If unspecified, will copy audio data without transcoding       |
| `--bitrate <bitrate>`    | `16K`, `32K`, `64K`, `96K` with `--codec libopus`; `0`–`9` with `--codec libmp3lame` | –       | The audio bitrate to transcode to. Only accepted with `--codec libopus` or `--codec libmp3lame` |
| `--max-length <integer>` | minutes                                                                              | `120`   | The maximum allowed length of a processed audio track, in minutes                               |

`--codec`, `--bitrate`, and `--max-length` are grouped in `--help` under **Audio
processing**.

## `stalign transcribe`

Transcribe a directory of audiobook files.

```sh
stalign transcribe [--parallel INTEGER] [--language LOCALE] --engine <engine> [engine flags] [--no-progress] [--log-level TYPE] [--time] INPUT OUTPUT
```

Takes a directory of audiobook files (treated as a single audiobook) and
transcribes them, outputting one transcription file per input audio file into
the output directory.

The input audiobook file directory MUST have been first processed with the
`stalign process` command. See `stalign help process` for more information.

The transcription can be run locally with whisper.cpp (the CLI will
automatically download the appropriate pre-compiled whisper.cpp binary for your
platform), remotely on an OpenAI-compatible whisper server (such as
ghost-story), or on a paid transcription service, including Google Cloud,
Microsoft Azure, Amazon Transcribe, or Deepgram.

When running locally with `--engine=whisper.cpp`, it's recommended to use
`--model=tiny.en` for English-language books, and `--model=large-v3-turbo` for
books in languages other than English.

You must pass the `--language` flag to specify the language of the book. If
unspecified, the language will be assumed to be `en-US`. The language must be a
valid BCP-47 language code (e.g. `en`, `de`, `zh`). The locale (e.g. `US`, `UK`,
`DE`) is optional for this step.

| Argument/Flag             | Values                                                                                                              | Default       | Description                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `INPUT`                   | directory                                                                                                           | –             | Required. Input directory of processed audiobook files |
| `OUTPUT`                  | directory                                                                                                           | –             | Required. Output directory for the transcription files |
| `--parallel <integer>`    | –                                                                                                                   | `1`           | See [shared flags](#shared-flags)                      |
| `--language <locale>`     | –                                                                                                                   | –             | See [shared flags](#shared-flags)                      |
| `--engine <engine>`, `-e` | `whisper.cpp`, `whisper-server`, `openai-cloud`, `google-cloud`, `microsoft-azure`, `amazon-transcribe`, `deepgram` | `whisper.cpp` | Which transcription engine to run                      |

### `--engine=whisper.cpp` (default)

| Flag                          | Values                                                                     | Default   | Description                                                                        |
| ----------------------------- | -------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `--model <model>`, `-m`       | whisper model names, e.g. `tiny.en`, `small`, `large-v3`, `large-v3-turbo` | `tiny.en` | The whisper model to use                                                           |
| `--threads <integer>`         | –                                                                          | `4`       | How many CPU threads whisper.cpp may use                                           |
| `--processors <integer>`      | –                                                                          | `1`       | The number of processors to use (values greater than 1 may affect timing accuracy) |
| `--cpu-override <cpu_engine>` | `blas`, `cpu`                                                              | –         | When provided, will use this whisper variant even if another is available          |

### Other engines

| Engine              | Required flags                                                                                                                        | Optional flags                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `whisper-server`    | `--whisper-server-url <url>`                                                                                                          | `--whisper-server-api-key <string>`                                                                                 |
| `openai-cloud`      | –                                                                                                                                     | `--openai-model <string>`, `--openai-api-key <string>`, `--openai-organization <string>`, `--openai-base-url <url>` |
| `google-cloud`      | `--google-cloud-api-key <string>`                                                                                                     | –                                                                                                                   |
| `microsoft-azure`   | `--azure-service-region <string>`, `--azure-subscription-key <string>`                                                                | –                                                                                                                   |
| `amazon-transcribe` | `--amazon-transcribe-region <string>`, `--amazon-transcribe-access-key-id <string>`, `--amazon-transcribe-secret-access-key <string>` | –                                                                                                                   |
| `deepgram`          | `--deepgram-api-key <string>`                                                                                                         | `--deepgram-model <string>` (default `nova-3`)                                                                      |

## `stalign emit`

Analyze a directory of audiobook files for CTC alignment.

```sh
stalign emit [--engine ENGINE] [--device/-d DEVICE] [--model MODEL] [--dtype PRECISION] [--batch-size INTEGER] [--concurrency INTEGER] [--server-url URL] [--server-api-key STRING] [--language LOCALE] [--no-progress] [--log-level TYPE] [--time] INPUT OUTPUT
```

Takes a directory of audiobook files (treated as a single audiobook) and runs
the CTC analyzer on them, outputting one emissions file per input audio file
into the output directory.

The analysis can be run locally (default) or remotely if `--engine=ctc-server`
or `--server-url` is passed. If using the `ctc-server` engine, `--server-url`
must point to hostname for a ghost-story server that is accessible by this
machine. Audio will be streamed to the server, and then emissions will be
streamed back to disk.

The `--device` flag configures which hardware acceleration framework to use. On
Linux and macOS, the default `auto` device will select `cpu`; on Windows, it
will select `dml`. It is highly recommended to choose `--device=mlx` on macOS,
and `--device=cuda` if you have an NVIDIA graphics card, or `--device=webgpu` if
you have any other graphics card. This will significantly improve analysis time.

The `--model` flag defaults to `mms`, which is the Massively Multilingual Speech
model. This model supports over 1,000 languages, and generally has the most
precise timing output. However, `--model=quartznet15x5` can be more than 10x
faster on most systems. It only supports Arabic, Catalan, German, English,
Spanish, Faroese, French, Armenian, Icelandic, Kazakh, Maltese, Polish,
Portuguese, Russian, Chinese (Mandarin), and Japanese.

The `--dtype` flag should be set to `fp32` when running on `--device=cpu`, and
otherwise set to `fp16`.

| Argument/Flag               | Values                                                               | Default | Description                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INPUT`                     | directory                                                            | –       | Required. Input directory of audiobook files                                                                                                                              |
| `OUTPUT`                    | directory                                                            | –       | Required. Output directory for the emissions files                                                                                                                        |
| `--engine <engine>`         | `ctc-local`, `ctc-server`                                            | –       | Where to generate emissions. Unset runs on this machine, or on the server when `--server-url` is given                                                                    |
| `--device <device>`, `-d`   | `auto`, `cpu`, `webgpu`, `dml`, `cuda`, `mlx`                        | `auto`  | The device to run inference on                                                                                                                                            |
| `--model <model>`           | `mms`, `quartznet15x5`, `citrinet256`, `citrinet512`, `citrinet1024` | `mms`   | The CTC model family to generate emissions with. `mms` handles any language and picks its precision from the device, the others need a `--language` they have a model for |
| `--dtype <precision>`       | `fp32`, `fp16`                                                       | –       | The precision to run the model in on a GPU. CPU always runs `fp32`. Unset uses `fp16` for `mms` and `fp32` for the other families                                         |
| `--batch-size <integer>`    | >= 1                                                                 | –       | How many chunks of audio go through the model per call. Higher is faster on a GPU and needs more memory. Unset picks 2 on a GPU and 1 on a CPU                            |
| `--concurrency <integer>`   | >= 1                                                                 | –       | How many ffmpeg processes decode audio ahead of the model. Unset picks 4, or fewer on small machines                                                                      |
| `--server-url <url>`        | URL                                                                  | –       | The URL of a ghost-story server started with `ghost-story serve`                                                                                                          |
| `--server-api-key <string>` | –                                                                    | –       | The API key of the ghost-story server                                                                                                                                     |
| `--language <locale>`       | –                                                                    | –       | See [shared flags](#shared-flags)                                                                                                                                         |

## `stalign markup`

Mark up an EPUB file at the provided granularity level.

```sh
stalign markup [--granularity/-g TYPE] [--autoupgrade/-u] [--remove-ncx] [--language LOCALE] [--no-progress] [--log-level TYPE] [--time] INPUT_PATH OUTPUT_PATH
```

Takes an input EPUB file and produces a new EPUB with all of the same contents,
but with a `<span>` HTML element with a unique ID around every sentence (and
word, if `--granularity=word` is passed).

This step is required for the align step with `--text-ref=id-fragment`. For
`--text-ref=text-fragment`, this can be skipped.

| Argument/Flag                | Values             | Default    | Description                                                                         |
| ---------------------------- | ------------------ | ---------- | ----------------------------------------------------------------------------------- |
| `INPUT_PATH`                 | `.epub` file       | –          | Required. The EPUB to mark up                                                       |
| `OUTPUT_PATH`                | `.epub` file       | –          | Required. Where to write the marked up EPUB                                         |
| `--granularity <type>`, `-g` | `word`, `sentence` | `sentence` | With `word`, every word is wrapped in its own element in addition to every sentence |
| `--autoupgrade`, `-u`        | –                  | off        | See [shared flags](#shared-flags)                                                   |
| `--remove-ncx`               | –                  | off        | See [shared flags](#shared-flags)                                                   |
| `--language <locale>`        | –                  | –          | See [shared flags](#shared-flags)                                                   |

## `stalign align`

Run forced alignment to determine where each sentence|word is spoken in the
audiobook and produce a new EPUB package with Media Overlays and embedded audio.

```sh
stalign align --output PATH (--ctc --emissions PATH | --transcriptions PATH) --audiobook PATH --epub PATH [--text-ref TYPE] [--reports PATH] [--out-format TYPE] [--gap-seconds NUMBER] [--audio-chapter-seconds NUMBER] [--drop-unread] [--autoupgrade/-u] [--remove-ncx] [--no-progress] [--log-level TYPE] [--time] [--language LOCALE] [--granularity/-g TYPE]
```

Takes an input EPUB and audiobook directory and produces an EPUB with Media
Overlays or a Readium Guided Navigation Package with the alignment between the
text and audio.

If `--ctc` is passed, uses the more accurate CTC-based alignment algorithm. This
requires that `--emissions` is passed with a directory of emissions files,
generated by `stalign emit`.

If `--ctc` is not passed, uses the error-align-based alignment algorithm. This
requires that `--transcriptions` is passed with a directory of transcription
files, generated by `stalign transcribe`.

The `--text-ref` flag specifies how to reference text in the EPUB from the media
overlays/guided navigation documents. The default is `id-fragment`, which
requires that the input EPUB has been marked up by the `stalign markup` step.
The `--granularity` flag passed to this command must also match the command
passed during the markup step. You may also specify `--text-ref=text-fragment`,
in which case stalign will output experimental text fragment references, which
do NOT require the EPUB to be marked up, but are not natively supported by any
known EPUB reading systems.

The `--out-format` flag defaults to `epub`, which outputs a single EPUB 3
publication with embedded audio and media overlays. This can be read by any EPUB
reading system with media overlay support. `--out-format=gnp` will produce,
instead, a Guided Navigation Package, which is an experimental Readium
publication profile that contains ONLY the alignment metadata. A GNP does not
have the text or audio embedded within it, so it is much smaller than an EPUB
publication. However, no EPUB reading systems natively support GNPs yet.

| Flag                               | Values                         | Default       | Description                                                                                                                                                                 |
| ---------------------------------- | ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <path>`                  | `.epub` or `.gnp` file         | –             | Required. Where to write the aligned publication                                                                                                                            |
| `--ctc`                            | –                              | off           | Use CTC emissions instead of transcriptions for alignment                                                                                                                   |
| `--emissions <path>`               | directory                      | –             | Required with `--ctc`. Directory of emissions files from `stalign emit`                                                                                                     |
| `--transcriptions <path>`          | directory                      | –             | Required without `--ctc`. Directory of transcription files from `stalign transcribe`                                                                                        |
| `--audiobook <path>`               | directory                      | –             | Required. The audiobook the text is aligned against                                                                                                                         |
| `--epub <path>`                    | `.epub` file                   | –             | Required. The input EPUB                                                                                                                                                    |
| `--text-ref <type>`                | `id-fragment`, `text-fragment` | `id-fragment` | Whether to use text fragments or element id fragments to identify text ranges in generated media overlays                                                                   |
| `--out-format <type>`              | `epub`, `gnp`                  | `epub`        | Whether to output a full EPUB 3 package with embedded media overlays and audio, or a Readium Guided Navigation Package with just a manifest and guided navigation documents |
| `--reports <path>`                 | `.json` file                   | –             | Where to write a JSON report about the alignment                                                                                                                            |
| `--gap-seconds <number>`           | seconds                        | –             | Stretches of audio longer than this with no matching text become audio-only media overlay entries instead of being folded into the previous sentence                        |
| `--audio-chapter-seconds <number>` | seconds                        | –             | Audio-only stretches between chapters at least this long become their own chapters in the output                                                                            |
| `--drop-unread`                    | –                              | off           | Give sentences the narrator did not read no audio instead of an interpolated clip                                                                                           |
| `--autoupgrade`, `-u`              | –                              | off           | See [shared flags](#shared-flags)                                                                                                                                           |
| `--remove-ncx`                     | –                              | off           | See [shared flags](#shared-flags)                                                                                                                                           |
| `--language <locale>`              | –                              | –             | See [shared flags](#shared-flags)                                                                                                                                           |
| `--granularity <type>`, `-g`       | `word`, `sentence`             | `sentence`    | Must match the granularity the EPUB was marked up with                                                                                                                      |

`--audiobook`, `--epub`, `--text-ref`, `--reports`, `--out-format`,
`--gap-seconds`, `--audio-chapter-seconds`, and `--drop-unread` are grouped in
`--help` under **Alignment**.

## Full pipeline (no subcommand)

```
stalign [--processed-audio PATH] [--markedup PATH] [--parallel-transcodes INTEGER] [--parallel-transcribes INTEGER] --output PATH [--codec TYPE] [--bitrate BITRATE] [--max-length INTEGER] (--ctc [--emissions PATH] [emit flags] | --engine <engine> [transcribe flags] [--transcriptions PATH]) [--autoupgrade/-u] [--remove-ncx] [--granularity/-g TYPE] [--language LOCALE] --audiobook PATH --epub PATH [--text-ref TYPE] [--reports PATH] [--out-format TYPE] [--gap-seconds NUMBER] [--audio-chapter-seconds NUMBER] [--drop-unread] [--no-progress] [--log-level TYPE] [--time]
```

Runs the whole alignment pipeline: process, emit or transcribe, markup, align.
The flags of the individual steps are accepted here unchanged — see
[`process`](#stalign-process), [`emit`](#stalign-emit),
[`transcribe`](#stalign-transcribe), [`markup`](#stalign-markup), and
[`align`](#stalign-align) — with these differences:

| Flag                               | Values       | Default     | Description                                                                                             |
| ---------------------------------- | ------------ | ----------- | ------------------------------------------------------------------------------------------------------- |
| `--audiobook <path>`               | directory    | –           | Required. The input audiobook                                                                           |
| `--epub <path>`                    | `.epub` file | –           | Required. The input EPUB                                                                                |
| `--output <path>`                  | `.epub` file | –           | Required. Where to write the aligned EPUB. Unlike `stalign align`, the pipeline only writes EPUB output |
| `--ctc`                            | –            | off         | Use the CTC aligner and the emit step instead of transcription-based alignment                          |
| `--emissions <path>`               | directory    | scratch dir | Where to write emissions. Passing a path keeps them around, so a re-run can reuse the work              |
| `--transcriptions <path>`          | directory    | scratch dir | Where to write transcriptions. Passing a path keeps them around, so a re-run can reuse the work         |
| `--processed-audio <path>`         | directory    | scratch dir | Where to write the processed audio                                                                      |
| `--markedup <path>`                | `.epub` file | scratch dir | Where to write the marked up EPUB                                                                       |
| `--parallel-transcodes <integer>`  | –            | `1`         | How many files to transcode in parallel, in place of `--parallel`                                       |
| `--parallel-transcribes <integer>` | –            | `1`         | How many files to transcribe or emit in parallel, in place of `--parallel`                              |

The `--emissions`, `--transcriptions`, `--processed-audio`, and `--markedup`
paths are optional precisely because the pipeline can generate them itself: any
that are not passed are written to a scratch directory and deleted when the run
finishes. Pass them to keep the intermediates, to inspect them, or to resume
expensive steps on a re-run.

`--parallel` is not accepted by the pipeline; use `--parallel-transcodes` and
`--parallel-transcribes` instead. Everything else from
[shared flags](#shared-flags) applies, except `--parallel`.

## `stalign snapshot`

Print a human-readable snapshot of the EPUB's alignment to a text file.

```
stalign snapshot --epub PATH (--transcriptions PATH | --ctc --emissions PATH) [--no-progress] [--log-level TYPE] [--time] OUTPUT_PATH
```

| Argument/Flag             | Values       | Default | Description                                                                                                                                                          |
| ------------------------- | ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--epub <path>`           | `.epub` file | –       | Required. Path to an EPUB file to snapshot. This EPUB must have Media Overlays and audio files corresponding to the transcription files passed to `--transcriptions` |
| `--transcriptions <path>` | directory    | –       | Required unless `--ctc` is passed. Directory of transcription files                                                                                                  |
| `--ctc`                   | –            | off     | Snapshot a CTC alignment instead of a transcription-based one                                                                                                        |
| `--emissions <path>`      | directory    | –       | Required with `--ctc`. Directory of emissions files                                                                                                                  |
| `OUTPUT_PATH`             | file         | –       | Required. Path to save the snapshot                                                                                                                                  |

## `stalign upgrade-epub`

Upgrade an EPUB 2 file to EPUB 3.

```
stalign upgrade-epub [--remove-ncx] EPUB2 OUTPUT
```

| Argument/Flag  | Values | Default | Description                                                                     |
| -------------- | ------ | ------- | ------------------------------------------------------------------------------- |
| `EPUB2`        | file   | –       | Required. The EPUB 2 file to upgrade                                            |
| `OUTPUT`       | file   | –       | Required. Where to write the EPUB 3 file                                        |
| `--remove-ncx` | –      | off     | Whether to remove the NCX and guide element after upgrading an EPUB from 2 to 3 |

This is the only command that does not accept the logging flags. `--autoupgrade`
makes `markup`, `align`, and the pipeline run this upgrade for you.

## Library usage

The package also exports the alignment library itself, plus the Readium guided
navigation helpers, the alignment report types, and the emissions reader:

```ts
import { ctcAlign, emit, markup } from "@storyteller-platform/align"
import * as readium from "@storyteller-platform/align/readium"
import type * as report from "@storyteller-platform/align/report"
```

## Development

This package lives in the
[Storyteller monorepo](https://gitlab.com/storyteller-platform/storyteller), and
is developed alongside the
[Storyteller platform](https://storyteller-platform.dev).

To get started with developing in the Storyteller monorepo, check out the
[development guides in the docs](https://storyteller-platform.dev/docs/category/development).
