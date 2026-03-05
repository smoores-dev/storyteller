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

import { WHISPER_MODELS } from "@storyteller-platform/ghost-story"

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
  { description: message`Transcribe a directory of audiobook files.` },
)
