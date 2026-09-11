import {
  argument,
  choice,
  command,
  constant,
  merge,
  message,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import {
  CTC_MODELS,
  WAV2VEC2_DEVICES,
  WAV2VEC2_DTYPES,
  WAV2VEC_ENGINES,
} from "@storyteller-platform/ghost-story/constants"

import { loggingParser } from "../common/parse.ts"

export const emitParser = object({
  engine: withDefault(
    option("--engine", choice(WAV2VEC_ENGINES, { metavar: "ENGINE" }), {
      description: message`The wav2vec2 engine to generate emissions with`,
    }),
    "wav2vec-local",
  ),
  device: withDefault(
    option("--device", "-d", choice(WAV2VEC2_DEVICES, { metavar: "DEVICE" }), {
      description: message`The device to run inference on`,
    }),
    "auto",
  ),
  dtype: withDefault(
    option("--dtype", choice(WAV2VEC2_DTYPES, { metavar: "DTYPE" }), {
      description: message`The data type to load the model with. Use fp32 for device=cpu, and fp16 otherwise.`,
    }),
    "fp16",
  ),
  model: optional(
    option("--model", choice(CTC_MODELS, { metavar: "MODEL" }), {
      description: message`The CTC model to generate emissions with. Defaults to the MMS model matching the device and dtype.`,
    }),
  ),
  // serverUrl: optional(
  //   map(
  //     option("--server-url", url(), {
  //       description: message`The URL of the emission server`,
  //     }),
  //     (url) => url.toString(),
  //   ),
  // ),
  // serverApiKey: optional(
  //   option("--api-key", string(), {
  //     description: message`The API key of the emission server`,
  //   }),
  // ),
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
