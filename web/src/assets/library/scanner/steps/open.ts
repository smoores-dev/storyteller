import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import {
  Epub,
  type EpubMetadataReader,
  EpubVersionError,
} from "@storyteller-platform/epub"

import { defineStep } from "@/assets/library/scanner/step"
import { isAudioFile } from "@/audio"

import { type FingerPrinted } from "./check-fingerprint"

const EPUB_STEP = "open-epub" as const

export const openEpubStep = defineStep(
  EPUB_STEP,
  async (input: FingerPrinted & { format: "ebook" | "readaloud" }, ctx) => {
    try {
      const epub = ctx.scope.use(
        await Epub.from(input.filepath, { metadataOnly: true }),
      )
      return { ...input, isEpub2: false as const, epub }
    } catch (error) {
      if (!(error instanceof EpubVersionError)) throw error
      return { ...input, isEpub2: true as const, epub: null }
    }
  },
)

export type OpenedEpub = FingerPrinted & { format: "ebook" | "readaloud" } & (
    | {
        epub: EpubMetadataReader
        isEpub2: false
      }
    | {
        epub: null
        isEpub2: true
      }
  )

const AUDIOBOOK_STEP = "open-audiobook" as const

async function getAudiobookTracks(directory: string): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry))
    .map((entry) => join(directory, entry))

  return tracks as AudiobookInputs
}

export const openAudiobookStep = defineStep(
  AUDIOBOOK_STEP,
  async (input: FingerPrinted & { format: "audiobook" }, ctx) => {
    const tracks = await getAudiobookTracks(input.filepath)

    if (tracks.length === 0) {
      ctx.report.skipped({
        step: AUDIOBOOK_STEP,
        book: input.book,
        format: input.format,
        reason: "no-audio-tracks",
      })
      return null
    }

    const audiobook = ctx.scope.use(await Audiobook.fromForMetadata(...tracks))
    return { ...input, audiobook }
  },
)

export type OpenedAudiobook = FingerPrinted & { format: "audiobook" } & {
  audiobook: Audiobook
}
