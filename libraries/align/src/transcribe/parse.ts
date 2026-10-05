import {
  argument,
  choice,
  command,
  constant,
  integer,
  map,
  merge,
  message,
  object,
  option,
  optional,
  or,
  withDefault,
} from "@optique/core"
import { string, url } from "@optique/core/valueparser"
import { path } from "@optique/run/valueparser"

import { WHISPER_MODELS } from "@storyteller-platform/ghost-story/constants"

import {
  languageParser,
  loggingParser,
  parallelismParser,
} from "../common/parse.ts"

export const transcribeParser = or(
  object("whisper.cpp", {
    engine: option(
      "--engine",
      "-e",
      choice(["whisper.cpp"], { metavar: "whisper.cpp" }),
    ),
    model: withDefault(
      option("--model", "-m", choice(WHISPER_MODELS, { metavar: "MODEL" }), {
        description: message`The whisper model to use`,
      }),
      "tiny.en",
    ),
    threads: withDefault(option("--threads", integer()), 4),
    processors: withDefault(
      option("--processors", integer(), {
        description: message`The number of processors to use (values greater than 1 may affect timing accuracy)`,
      }),
      1,
    ),
    cpuOverride: optional(
      option(
        "--cpu-override",
        choice(["blas", "cpu"], { metavar: "CPU_ENGINE" }),
        {
          description: message`When provided, will use this whisper variant even if another is available`,
        },
      ),
    ),
  }),
  object("whisper-server", {
    engine: option(
      "--engine",
      "-e",
      choice(["whisper-server"], { metavar: "whisper-server" }),
    ),
    whisperServerUrl: map(option("--whisper-server-url", url()), (url) =>
      url.toString(),
    ),
    whisperServerApiKey: optional(option("--whisper-server-api-key", string())),
  }),
  object("openai-cloud", {
    engine: option(
      "--engine",
      "-e",
      choice(["openai-cloud"], { metavar: "openai-cloud" }),
    ),
    openaiModelName: optional(option("--openai-model", string())),
    openAiApiKey: optional(option("--openai-api-key", string())),
    openAiOrganization: optional(option("--openai-organization", string())),
    openAiBaseUrl: optional(
      map(option("--openai-base-url", url()), (url) => url.toString()),
    ),
  }),
  object("google-cloud", {
    engine: option(
      "--engine",
      "-e",
      choice(["google-cloud"], { metavar: "google-cloud" }),
    ),
    googleCloudApiKey: option("--google-cloud-api-key", string()),
  }),
  object("microsoft-azure", {
    engine: option(
      "--engine",
      "-e",
      choice(["microsoft-azure"], { metavar: "microsoft-azure" }),
    ),
    azureServiceRegion: option("--azure-service-region", string()),
    azureSubscriptionKey: option("--azure-subscription-key", string()),
  }),
  object("amazon-transcribe", {
    engine: option(
      "--engine",
      "-e",
      choice(["amazon-transcribe"], { metavar: "amazon-transcribe" }),
    ),
    amazonTranscribeRegion: option("--amazon-transcribe-region", string()),
    amazonTranscribeAccessKeyId: option(
      "--amazon-transcribe-access-key-id",
      string(),
    ),
    amazonTranscribeSecretAccessKey: option(
      "--amazon-transcribe-secret-access-key",
      string(),
    ),
  }),
  object("deepgram", {
    engine: option(
      "--engine",
      "-e",
      choice(["deepgram"], { metavar: "deepgram" }),
    ),
    deepgramApiKey: option("--deepgram-api-key", string()),
    deepgramModel: withDefault(option("--deepgram-model", string()), "nova-3"),
  }),
)

export const transcribeCommand = command(
  "transcribe",
  merge(
    object({
      action: constant("transcribe"),
      input: argument(
        path({ type: "directory", mustExist: true, metavar: "INPUT" }),
      ),
      output: argument(path({ metavar: "OUTPUT", type: "directory" })),
    }),
    parallelismParser,
    languageParser,
    transcribeParser,
    loggingParser,
  ),
  {
    brief: message`Transcribe a directory of audiobook files.

`,
    description: message`Takes a directory of audiobook files (treated as a
single audiobook) and transcribes them, outputting one transcription
file per input audio file into the output directory.

The input audiobook file directory MUST have been first processed with the
stalign process command. See stalign help process for more information.

The transcription can be run locally with whisper.cpp (the CLI will
automatically download the appropriate pre-compiled whisper.cpp binary
for your platform), remotely on an OpenAI-compatible whisper server
(such as ghost-story), or on a paid transcription service, including
Google Cloud, Microsoft Azure, Amazon Transcribe, or Deepgram.

When running locally with --engine=whisper.cpp, it's recommended to
use --model=tiny.en for English-language books, and --model=large-v3-turbo
for books in languages other than English.

You must pass the --language flag to specify the language of the book.
If unspecified, the language will be assumed to be "en-US". The language
must be a valid BCP-47 language code (e.g. "en", "de", "zh"). The
locale (e.g. "US", "UK", "DE") is optional for this step.

`,
  },
)
