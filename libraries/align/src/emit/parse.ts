import {
  argument,
  choice,
  command,
  constant,
  merge,
  message,
  object,
  option,
  withDefault,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import {
  WAV2VEC2_DEVICES,
  WAV2VEC2_DTYPES,
  WAV2VEC2_MODELS,
} from "@storyteller-platform/ghost-story/constants"

import { loggingParser } from "../common/parse.ts"

export const emitParser = object({
  model: withDefault(
    option("--model", "-m", choice(WAV2VEC2_MODELS, { metavar: "MODEL" }), {
      description: message`The wav2vec2 model to use`,
    }),
    "onnx-community/mms-300m-1130-forced-aligner-ONNX",
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
