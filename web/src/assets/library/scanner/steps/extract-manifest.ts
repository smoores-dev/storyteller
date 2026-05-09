import { getNumericValue } from "@/assets/library/scanner/manifestValue"
import { defineStep } from "@/assets/library/scanner/step2"
import {
  type AudiobookManifestReady,
  type AudiobookMetadataExtracted,
  type EbookManifestReady,
  type EpubMetadataExtracted,
  type ReadaloudManifestReady,
} from "@/assets/library/scanner/types"
import { type SerializedManifest } from "@/components/reader/types"
import { ReadiumService } from "@/services/readiumService"
import { createAudiobookManifest } from "@/utils/audioManifest"

export type ExtractEbookManifestInput = EpubMetadataExtracted & {
  format: "ebook"
}
export type ExtractEbookManifestOutput = EbookManifestReady

export type ExtractReadaloudManifestInput = EpubMetadataExtracted & {
  format: "readaloud"
}
export type ExtractReadaloudManifestOutput = ReadaloudManifestReady

export type ExtractAudiobookManifestInput = AudiobookMetadataExtracted
export type ExtractAudiobookManifestOutput = AudiobookManifestReady

function deriveAudiobookDuration(manifest: SerializedManifest): number | null {
  let duration = 0

  for (const item of manifest.readingOrder) {
    const value = getNumericValue(item.duration)
    if (value === null) continue
    duration += value
  }

  return duration > 0 ? duration : null
}

function resolveReadaloudPageCount(
  input: EpubMetadataExtracted & { format: "readaloud" },
  ownPageCount: number | null,
): number | null {
  const ebook = input.book.ebook
  if (ebook && !ebook.missing && ebook.pageCount) return ebook.pageCount
  return ownPageCount
}

function resolveReadaloudDuration(
  input: EpubMetadataExtracted & { format: "readaloud" },
  manifest: SerializedManifest,
): number | null {
  const audiobook = input.book.audiobook
  if (audiobook && !audiobook.missing && audiobook.duration) {
    return audiobook.duration
  }

  let duration = 0
  for (const item of manifest.resources ?? []) {
    const value = getNumericValue(item.duration)
    if (value === null) continue
    duration += value
  }

  return duration > 0 ? duration : null
}

export const extractEbookManifestStep = defineStep(
  "extract-ebook-manifest",
  async (input: ExtractEbookManifestInput, ctx) => {
    const manifest = await ReadiumService.getManifest(input.filepath, {
      inferPageCount: true,
      signal: ctx.signal,
    })

    return {
      ...input,
      manifest,
      pageCount: manifest.metadata.numberOfPages ?? null,
      duration: null,
    }
  },
)

export const extractReadaloudManifestStep = defineStep(
  "extract-readaloud-manifest",
  async (input: ExtractReadaloudManifestInput, ctx) => {
    const manifest = await ReadiumService.getManifest(input.filepath, {
      inferPageCount: true,
      signal: ctx.signal,
    })

    return {
      ...input,
      manifest,
      pageCount: resolveReadaloudPageCount(
        input,
        manifest.metadata.numberOfPages ?? null,
      ),
      duration: resolveReadaloudDuration(input, manifest),
    }
  },
)

export const extractAudiobookManifestStep = defineStep(
  "extract-audiobook-manifest",
  async (input: ExtractAudiobookManifestInput, _ctx) => {
    const manifestOptions = {
      bookId: input.book.uuid,
      title: input.book.title,
      updatedAt: new Date(input.book.updatedAt),
      ...(input.book.subtitle ? { subtitle: input.book.subtitle } : {}),
      ...(input.book.description
        ? { description: input.book.description }
        : {}),
      ...(input.book.language ? { language: input.book.language } : {}),
    }

    const manifest = await createAudiobookManifest(
      input.filepath,
      manifestOptions,
    )
    const serialized = manifest.serialize() as SerializedManifest

    return {
      ...input,
      manifest: serialized,
      pageCount: null,
      duration: deriveAudiobookDuration(serialized),
    }
  },
)
