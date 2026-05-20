import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"

import { defineStep } from "@/assets/library/scanner/step"
import {
  type AudiobookFingerprinted,
  type AudiobookOpened,
} from "@/assets/library/scanner/types"
import { isAudioFile } from "@/audio"

const STEP = "open-audiobook"

export type OpenAudiobookInput = AudiobookFingerprinted
export type OpenAudiobookOutput = AudiobookOpened

async function getAudiobookTracks(directory: string): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((entry) => join(directory, entry))

  return tracks as AudiobookInputs
}

export const openAudiobookStep = defineStep(
  "open-audiobook",
  async (input: OpenAudiobookInput, ctx) => {
    const scope = ctx.scope
    if (!scope) {
      throw new Error("open-audiobook step requires ctx.scope")
    }

    const tracks = await getAudiobookTracks(input.filepath)
    if (tracks.length === 0) {
      ctx.report.skipped({
        step: STEP,
        book: input.book,
        format: input.format,
        reason: "no-audio-tracks",
      })
      return null
    }

    const audiobook = scope.use(await Audiobook.fromForMetadata(...tracks))
    return { ...input, audiobook }
  },
)
