import {
  argument,
  command,
  constant,
  merge,
  message,
  object,
} from "@optique/core"
import { path } from "@optique/run"

import { removeNcxParser } from "../common/parse.ts"

export const upgradeEpubCommand = command(
  "upgrade-epub",
  merge(
    object({
      action: constant("upgrade-epub"),
      input: argument(
        path({ type: "file", mustExist: true, metavar: "EPUB2" }),
      ),
      output: argument(path({ metavar: "OUTPUT", type: "file" })),
    }),
    removeNcxParser,
  ),
  { description: message`Upgrade an EPUB 2 file to EPUB 3` },
)
