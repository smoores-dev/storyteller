import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"

import { type PipelineStep } from "@/assets/autoimport/scanner/types"
import {
  suppressDirectory,
  unsuppressDirectory,
} from "@/assets/autoimport/writeIntent"
import { isAudioFile } from "@/audio"

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

    using audiobook = await Audiobook.from(...tracks)
    ctx.audiobook = audiobook
  },
  async cleanup(ctx) {
    if (!ctx.audiobook) {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      ctx.audiobook.discardAndClose()
      return
    }

    suppressDirectory(ctx.filepath)
    try {
      await ctx.audiobook.saveAndClose()
    } finally {
      unsuppressDirectory(ctx.filepath)
    }
    ctx.audiobook = null
  },
}
