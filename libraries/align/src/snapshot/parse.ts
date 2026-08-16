import {
  argument,
  command,
  constant,
  flag,
  merge,
  message,
  object,
  option,
  or,
} from "@optique/core"
import { path } from "@optique/run"

import { loggingParser } from "../common/parse.ts"

export const snapshotParser = merge(
  object("Snapshot", {
    epub: option(
      "--epub",
      path({ mustExist: true, type: "file", extensions: [".epub"] }),
      {
        description: message`Path to an EPUB file to snapshot. This EPUB must have Media Overlays and audio files corresponding to the transcription files passed to --transcriptions.`,
      },
    ),
    output: argument(path({ type: "file", metavar: "OUTPUT_PATH" }), {
      description: message`Path to save the snapshot.`,
    }),
  }),
  or(
    object({
      transcriptions: option(
        "--transcriptions",
        path({ mustExist: true, type: "directory" }),
      ),
    }),
    object({
      ctc: flag("--ctc"),
      emissions: option(
        "--emissions",
        path({ mustExist: true, type: "directory" }),
      ),
    }),
  ),
)

export const snapshotCommand = command(
  "snapshot",
  merge(
    object({
      action: constant("snapshot"),
    }),
    snapshotParser,
    loggingParser,
  ),
  {
    description: message`Print a human-readable snapshot of the EPUB’s alignment to a text file.`,
  },
)
