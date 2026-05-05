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
    description: message`Mark up an EPUB file at the provided granularity level`,
  },
)
