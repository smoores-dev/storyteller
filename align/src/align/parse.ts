import {
  command,
  constant,
  merge,
  message,
  object,
  option,
  optional,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import {
  granularityParser,
  languageParser,
  loggingParser,
} from "../common/parse.ts"

export const alignParser = object("Alignment", {
  audiobook: option(
    "--audiobook",
    path({ mustExist: true, type: "directory" }),
  ),
  epub: option(
    "--epub",
    path({ mustExist: true, type: "file", extensions: [".epub"] }),
  ),
  reports: optional(option("--reports", path({ type: "directory" }))),
})

export const alignCommand = command(
  "align",
  merge(
    object({
      action: constant("align"),
      transcriptions: option(
        "--transcriptions",
        path({ mustExist: true, type: "directory" }),
      ),
      output: option("--output", path({ type: "file", extensions: [".epub"] })),
    }),
    alignParser,
    loggingParser,
    languageParser,
    granularityParser,
  ),
  {
    description: message`Run forced alignment to determine where each sentence|word is spoken in the audiobook and produce a new EPUB package with Media Overlays and embedded audio.`,
  },
)
