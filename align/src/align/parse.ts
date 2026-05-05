import {
  choice,
  command,
  constant,
  merge,
  message,
  object,
  option,
  optional,
  withDefault,
} from "@optique/core"
import { path } from "@optique/run/valueparser"

import {
  autoUpgradeParser,
  granularityParser,
  languageParser,
  loggingParser,
  removeNcxParser,
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
  textRef: withDefault(
    option("--text-ref", choice(["id-fragment", "text-fragment"]), {
      description: message`Whether to use text fragments or element id fragments to identify text ranges in generated media overlays.`,
    }),
    "id-fragment",
  ),
  reports: optional(
    option("--reports", path({ type: "file", extensions: [".json"] })),
  ),
  outFormat: withDefault(
    option("--out-format", choice(["epub", "gnp"]), {
      description: message`Whether to output a full EPUB 3 package with embedded media overlays and audio, or a Readium Guided Navigation Package with just a manifest and guided navigation documents.`,
    }),
    "epub",
  ),
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
      output: option(
        "--output",
        // TODO: I think it should be possible to pick the correct
        // extension based on the output format
        path({ type: "file", extensions: [".epub", ".gnp"] }),
      ),
    }),
    alignParser,
    autoUpgradeParser,
    removeNcxParser,
    loggingParser,
    languageParser,
    granularityParser,
  ),
  {
    description: message`Run forced alignment to determine where each sentence|word is spoken in the audiobook and produce a new EPUB package with Media Overlays and embedded audio.`,
  },
)
