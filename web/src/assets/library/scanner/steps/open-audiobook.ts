import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"

import { createStep } from "@/assets/library/scanner/step"
import {
  type AudiobookHashed,
  type AudiobookOpened,
} from "@/assets/library/scanner/types"
import { isAudioFile } from "@/audio"

const STEP = "open-audiobook"

export type OpenAudiobookInput = AudiobookHashed
export type OpenAudiobookOutput = AudiobookOpened

async function getAudiobookTracks(directory: string): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((entry) => join(directory, entry))

  return tracks as AudiobookInputs
}

export const openAudiobookStep = createStep<
  OpenAudiobookInput,
  OpenAudiobookOutput
>(STEP, async (input, ctx) => {
  if (!input.changed) {
    ctx.report.skipped({
      step: STEP,
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "unchanged",
    })
    return null
  }

  const scope = ctx.scope
  if (!scope) {
    throw new Error("open-audiobook step requires ctx.scope")
  }

  const tracks = await getAudiobookTracks(input.filepath)
  if (tracks.length === 0) {
    ctx.report.skipped({
      step: STEP,
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "no-audio-tracks",
    })
    return null
  }

  const audiobook = scope.use(await Audiobook.from(...tracks))
  return { ...input, audiobook }
})
