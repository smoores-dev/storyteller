import {
  argument,
  choice,
  command,
  constant,
  dependency,
  integer,
  merge,
  message,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import { loggingParser, parallelismParser } from "../common/parse.ts"

const codecParser = dependency(choice(["libopus", "lipmp3lame", "aac", "copy"]))

const bitrateParser = codecParser.derive({
  metavar: "BITRATE",
  factory: (codec) => {
    switch (codec) {
      case "libopus": {
        return choice(["16K", "32K", "64K", "96K"])
      }
      case "lipmp3lame": {
        return choice(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"])
      }
      default:
        return choice([])
    }
  },
  defaultValue: () => "copy",
})

export const processParser = object("Audio processing", {
  codec: withDefault(
    option("--codec", codecParser, {
      description: message`The audio codec to transcode to. If unspecified, will copy audio data without transcoding.`,
    }),
    "copy",
  ),
  bitrate: optional(
    option("--bitrate", bitrateParser, {
      description: message`The audio bitrate to transcode to ()`,
    }),
  ),
  maxLength: withDefault(
    option("--max-length", integer(), {
      description: message`The maximum allowed length of a processed audio track, in minutes`,
    }),
    120,
  ),
})

export const processCommand = command(
  "process",
  merge(
    object({
      action: constant("process"),
      input: argument(
        path({ type: "directory", mustExist: true, metavar: "INPUT" }),
      ),
      output: argument(path({ metavar: "OUTPUT", type: "directory" })),
    }),
    parallelismParser,
    processParser,
    loggingParser,
  ),
  { description: message`Process audiobook files for transcription.` },
)
