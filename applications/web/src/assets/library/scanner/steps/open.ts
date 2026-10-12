import { readdir } from "node:fs/promises"
import { join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { type InMemoryEpubReader } from "@storyteller-platform/epub"
import { isHiddenFile } from "@storyteller-platform/fs"

import { openOrUpgradeEpub } from "@/assets/library/scanner/create-book"
import { defineStep } from "@/assets/library/scanner/step"
import { isAudioFile } from "@/audio"
import { updateBook } from "@/database/books"

import { type FingerPrinted } from "./check-fingerprint"

const EPUB_STEP = "open-epub" as const

export const openEpubStep = defineStep(
  EPUB_STEP,
  async (input: FingerPrinted & { format: "ebook" | "readaloud" }, ctx) => {
    // upgrade EPUB 2 in place using the user's strategy. existing books that
    // never went through openAndClassifyEpub (rescans) get the same treatment
    // as fresh ingests, so downstream steps always see an EPUB 3 reader.
    const { reader, effectivePath } = await openOrUpgradeEpub(input.filepath)
    const epub = ctx.scope.use(reader)

    if (effectivePath === input.filepath) {
      return { ...input, isEpub2: false as const, epub }
    }

    const book = await updateBook(
      input.book.uuid,
      null,
      input.format === "readaloud"
        ? {
            readaloud: {
              filepath: effectivePath,
              missing: false,
              status: input.book.readaloud?.status ?? "ALIGNED",
              currentStage:
                input.book.readaloud?.currentStage ?? "SPLIT_TRACKS",
            },
          }
        : { ebook: { filepath: effectivePath, missing: false } },
    )

    return {
      ...input,
      book,
      filepath: effectivePath,
      isEpub2: false as const,
      epub,
    }
  },
)

export type OpenedEpub = FingerPrinted & {
  format: "ebook" | "readaloud"
  epub: InMemoryEpubReader
  isEpub2: false
}

const AUDIOBOOK_STEP = "open-audiobook" as const

async function getAudiobookTracks(directory: string): Promise<AudiobookInputs> {
  const entries = await readdir(directory, { recursive: true })
  const tracks = entries
    .filter((entry) => isAudioFile(entry) && !isHiddenFile(entry))
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

    const audiobook = ctx.scope.use(await Audiobook.from(...tracks))
    return { ...input, audiobook }
  },
)

export type OpenedAudiobook = FingerPrinted & { format: "audiobook" } & {
  audiobook: Audiobook
}
