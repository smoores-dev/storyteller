import {
  argument,
  command,
  constant,
  merge,
  message,
  object,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import {
  autoUpgradeParser,
  granularityParser,
  languageParser,
  loggingParser,
  removeNcxParser,
} from "../common/parse.ts"

export const markupCommand = command(
  "markup",
  merge(
    object({
      action: constant("markup"),
      input: argument(
        path({
          mustExist: true,
          type: "file",
          extensions: [".epub"],
          metavar: "INPUT_PATH",
        }),
      ),
      output: argument(
        path({ type: "file", extensions: [".epub"], metavar: "OUTPUT_PATH" }),
      ),
    }),
    granularityParser,
    autoUpgradeParser,
    removeNcxParser,
    languageParser,
    loggingParser,
  ),
  {
    brief: message`Mark up an EPUB file at the provided granularity level.

`,
    description: message`Takes an input EPUB file and produces a new EPUB
with all of the same contents, but with a <span> HTML element with a unique
ID around every sentence (and word, if --granularity=word is passed).

This step is required for the align step with --text-ref=id-fragment. For
--text-ref=text-fragment, this can be skipped.

`,
  },
)
