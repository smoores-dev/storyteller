import {
  argument,
  choice,
  command,
  constant,
  integer,
  merge,
  message,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import {
  CTC_MODEL_FAMILIES,
  CTC_DEVICES,
  CTC_DTYPES,
  CTC_ENGINES,
} from "@storyteller-platform/ghost-story/constants"

import { languageParser, loggingParser } from "../common/parse.ts"

export const emitParser = object({
  engine: withDefault(
    option("--engine", choice(CTC_ENGINES, { metavar: "ENGINE" }), {
      description: message`The wav2vec2 engine to generate emissions with`,
    }),
    "ctc-local",
  ),
  device: withDefault(
    option("--device", "-d", choice(CTC_DEVICES, { metavar: "DEVICE" }), {
      description: message`The device to run inference on`,
    }),
    "auto",
  ),
  model: withDefault(
    option("--model", choice(CTC_MODEL_FAMILIES, { metavar: "MODEL" }), {
      description: message`The CTC model family to generate emissions with. mms handles any language and picks its precision from the device, the others need a --language they have a model for.`,
    }),
    "mms",
  ),
  dtype: optional(
    option("--dtype", choice(CTC_DTYPES, { metavar: "PRECISION" }), {
      description: message`The precision to run the model in on a GPU. CPU always runs fp32. Unset uses fp16 for mms and fp32 for the other families.`,
    }),
  ),
  batchSize: optional(
    option("--batch-size", integer({ min: 1 }), {
      description: message`How many chunks of audio go through the model per call. Higher is faster on a GPU and needs more memory. Unset picks 2 on a GPU and 1 on a CPU.`,
    }),
  ),
  concurrency: optional(
    option("--concurrency", integer({ min: 1 }), {
      description: message`How many ffmpeg processes decode audio ahead of the model. Unset picks 4, or fewer on small machines.`,
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
    languageParser,
    loggingParser,
  ),
  { description: message`Transcribe a directory of audiobook files.` },
)
