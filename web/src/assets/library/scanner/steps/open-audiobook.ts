import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type Audiobook as AudiobookAsset,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"

import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { type AudiobookHashed } from "@/assets/library/scanner/types"
import { isAudioFile } from "@/audio"

const STEP = "open-audiobook"

async function getAudiobookTracks(directory: string): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((entry) => join(directory, entry))

  return tracks as AudiobookInputs
}

export async function openAudiobook<T extends AudiobookHashed>(
  input: T,
  ctx: ScanCtx,
  scope: AsyncDisposableStack,
): Promise<(T & { audiobook: AudiobookAsset }) | null> {
  if (!input.changed) {
    ctx.report.skipped({
      step: STEP,
      bookUuid: input.bookUuid,
      format: input.format,
      reason: "unchanged",
    })
    return null
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
}
