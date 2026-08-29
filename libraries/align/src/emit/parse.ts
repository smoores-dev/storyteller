import {
  argument,
  choice,
  command,
  constant,
  map,
  merge,
  message,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core"
import { string, url } from "@optique/core/valueparser"
import { path } from "@optique/run/valueparser"

import {
  CTC_ENGINES,
  DEFAULT_WAV2VEC2_MODEL,
  WAV2VEC2_DEVICES,
  WAV2VEC2_DTYPES,
  WAV2VEC2_MODELS,
} from "@storyteller-platform/ghost-story/constants"

import { loggingParser } from "../common/parse.ts"

export const emitParser = object({
  engine: withDefault(
    option("--engine", choice(CTC_ENGINES, { metavar: "ENGINE" }), {
      description: message`Whether to run the model locally or on an emission server`,
    }),
    "ctc-local",
  ),
  model: withDefault(
    option("--model", "-m", choice(WAV2VEC2_MODELS, { metavar: "MODEL" }), {
      description: message`The wav2vec2 model to use`,
    }),
    DEFAULT_WAV2VEC2_MODEL,
  ),
  device: withDefault(
    option("--device", "-d", choice(WAV2VEC2_DEVICES, { metavar: "DEVICE" }), {
      description: message`The device to run inference on`,
    }),
    "auto",
  ),
  dtype: withDefault(
    option("--dtype", choice(WAV2VEC2_DTYPES, { metavar: "DTYPE" }), {
      description: message`The data type to load the model with`,
    }),
    "fp16",
  ),
  serverUrl: optional(
    map(
      option("--server-url", url(), {
        description: message`The URL of the emission server`,
      }),
      (url) => url.toString(),
    ),
  ),
  serverApiKey: optional(
    option("--api-key", string(), {
      description: message`The API key of the emission server`,
    }),
  ),
})

export const emitCommand = command(
  "emit",
  merge(
    object({
      action: constant("emit"),
      input: argument(
        path({ type: "directory", mustExist: true, metavar: "INPUT" }),
      ),
      output: argument(path({ metavar: "OUTPUT", type: "directory" })),
    }),
    emitParser,
    loggingParser,
  ),
  { description: message`Transcribe a directory of audiobook files.` },
)
