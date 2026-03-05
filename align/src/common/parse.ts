import {
  choice,
  integer,
  locale,
  message,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core"

export const loggingParser = object({
  noProgress: option("--no-progress", {
    description: message`Disable the progress bar`,
  }),
  logLevel: withDefault(
    option(
      "--log-level",
      choice(["silent", "debug", "info", "warn", "error"]),
      {
        description: message`Log level. If enabled, will disable progress bar.`,
      },
    ),
    "silent",
  ),
  time: option("--time", {
    description: message`Whether to print timing statistics`,
  }),
})

export const granularityParser = object({
  granularity: withDefault(
    option("--granularity", "-g", choice(["word", "sentence"])),
    "sentence",
  ),
})

export const languageParser = object({
  language: optional(
    option("--language", locale(), {
      description: message`BCP 47 language tag representing the primary language of the audio (e.g. en-US)`,
    }),
  ),
})

export const parallelismParser = object({
  parallelism: withDefault(
    option("--parallel", integer(), {
      description: message`How many files to attempt to transcode in parallel.`,
    }),
    1,
  ),
})
