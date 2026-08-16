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

import { WAV2VEC2_MODELS } from "@storyteller-platform/ghost-story/constants"

import { loggingParser } from "../common/parse.ts"

export const emitParser = object({
  model: withDefault(
    option("--model", "-m", choice(WAV2VEC2_MODELS, { metavar: "MODEL" }), {
      description: message`The wav2vec2 model to use`,
    }),
    "onnx-community/mms-300m-1130-forced-aligner-ONNX",
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
