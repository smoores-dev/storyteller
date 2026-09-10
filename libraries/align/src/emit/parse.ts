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
} from "@storyteller-platform/ghost-story/constants"

import { loggingParser } from "../common/parse.ts"

export const emitParser = object({
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
