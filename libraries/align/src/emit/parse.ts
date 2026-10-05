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
  withDefault,
} from "@optique/core"
import { string, url } from "@optique/core/valueparser"
import { path } from "@optique/run/valueparser"

import {
  CTC_MODEL_FAMILIES,
  CTC_DEVICES,
  CTC_DTYPES,
  CTC_ENGINES,
} from "@storyteller-platform/ghost-story/constants"

import { languageParser, loggingParser } from "../common/parse.ts"

export const emitParser = object({
  engine: optional(
    option("--engine", choice(CTC_ENGINES, { metavar: "ENGINE" }), {
      description: message`Where to generate emissions. Unset runs on this machine, or on the server when --server-url is given.`,
    }),
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
  serverUrl: optional(
    map(
      option("--server-url", url(), {
        description: message`The URL of a ghost-story server started with ghost-story serve`,
      }),
      (url) => url.toString(),
    ),
  ),
  serverApiKey: optional(
    option("--server-api-key", string(), {
      description: message`The API key of the ghost-story server`,
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
    languageParser,
    loggingParser,
  ),
  {
    brief: message`Analyze a directory of audiobook files for CTC alignment.

`,
    description: message`Takes a directory of audiobook files (treated as a
single audiobook) and runs the CTC analyzer on them, outputting one emissions
file per input audio file into the output directory.

The analysis can be run locally (default) or remotely if --engine=ctc-server
or --server-url is passed. If using the ctc-server engine, --server-url must
point to hostname for a ghost-story server that is accessible by this machine.
Audio will be streamed to the server, and then emissions will be streamed
back to disk.

The --device flag configures which hardware acceleration framework to use. On
Linux and macOS, the default "auto" device will select "cpu"; on Windows, it
will select "dml". It is highly recommended to choose --device=mlx on macOS,
and --device=cuda if you have an NVIDIA graphics card, or --device=webgpu if
you have any other graphics card. This will significantly improve analysis time.

The --model flag defaults to "mms", which is the Massively Multilingual Speech
model. This model supports over 1,000 languages, and generally has the most
precise timing output. However, --model=quartznet15x5 can be more than 10x faster
on most systems. It only supports Arabic, Catalan, German, English, Spanish,
Faroese, French, Armenian, Icelandic, Kazakh, Maltese, Polish, Portuguese, Russian,
Chinese (Mandarin), and Japanese.

The --dtype flag should be set to fp32 when using --device=cpu, and otherwise set to
fp16.

`,
  },
)
