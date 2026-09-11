import {
  choice,
  command,
  constant,
  flag,
  float,
  merge,
  message,
  object,
  option,
  optional,
  or,
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
  gapSeconds: optional(
    option("--gap-seconds", float(), {
      description: message`Stretches of audio longer than this with no matching text become audio-only media overlay entries instead of being folded into the previous sentence.`,
    }),
  ),
  audioChapterSeconds: optional(
    option("--audio-chapter-seconds", float(), {
      description: message`Audio-only stretches between chapters at least this long become their own chapters in the output.`,
    }),
  ),
  dropUnread: withDefault(
    flag("--drop-unread", {
      description: message`Give sentences the narrator did not read no audio instead of an interpolated clip.`,
    }),
    false,
  ),
})

export const alignCommand = command(
  "align",
  merge(
    object({
      action: constant("align"),
      output: option(
        "--output",
        // TODO: I think it should be possible to pick the correct
        // extension based on the output format
        path({ type: "file", extensions: [".epub", ".gnp"] }),
      ),
    }),
    or(
      object({
        ctc: flag("--ctc", {
          description: message`Use CTC emissions instead of transcriptions for alignment`,
        }),
        emissions: option(
          "--emissions",
          path({ mustExist: true, type: "directory" }),
        ),
      }),
      object({
        transcriptions: option(
          "--transcriptions",
          path({ mustExist: true, type: "directory" }),
        ),
      }),
    ),
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
