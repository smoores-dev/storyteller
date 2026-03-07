import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"

import { isAudioFile } from "@/audio"

import { type PipelineStep } from "../types"

async function getAudiobookTracks(directory: string): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((entry) => join(directory, entry))

  return tracks as AudiobookInputs
}

export const openAudiobookStep: PipelineStep = {
  name: "open-audiobook",
  async run(ctx) {
    if (ctx.format !== "audiobook") {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    const tracks = await getAudiobookTracks(ctx.filepath)
    if (tracks.length === 0) {
      return
    }

    ctx.audiobook = await Audiobook.from(...tracks)
  },
  async cleanup(ctx) {
    if (!ctx.audiobook) {
      return
    }

    ctx.audiobook.discardAndClose()
    ctx.audiobook = null
  },
}

