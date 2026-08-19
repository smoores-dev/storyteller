import {
  type ReadiumWebPublicationManifest,
  generateReadiumManifest,
} from "@storyteller-platform/align/readium"

import { getNumericValue } from "@/assets/library/scanner/manifestValue"
import { defineStep } from "@/assets/library/scanner/step"
import { createAudiobookManifest } from "@/utils/audioManifest"
import { type UUID } from "@/uuid"

import {
  type ExtractedAudiobookMetadata,
  type ExtractedEpubMetadata,
} from "./extract-metadata"

function deriveAudiobookDuration(
  manifest: ReadiumWebPublicationManifest,
): number | null {
  let duration = 0

  for (const item of manifest.readingOrder) {
    const value = getNumericValue(item.duration)
    if (value === null) continue
    duration += value
  }

  return duration > 0 ? duration : null
}

function resolveReadaloudPageCount(
  input: ExtractedEpubMetadata & { format: "readaloud" },
  ownPageCount: number | null,
): number | null {
  const ebook = input.book.ebook
  if (ebook && !ebook.missing && ebook.pageCount) return ebook.pageCount
  return ownPageCount
}

function resolveReadaloudDuration(
  input: ExtractedEpubMetadata & { format: "readaloud" },
  manifest: ReadiumWebPublicationManifest,
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
  async (input: ExtractedEpubMetadata & { format: "ebook" }, ctx) => {
    const manifest = await generateReadiumManifest(input.epub, {
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

export type ExtractedEbookManifest = ExtractedEpubMetadata & {
  format: "ebook"
} & {
  manifest: ReadiumWebPublicationManifest
  pageCount: number | null
  duration: null
  coverImageUuid?: UUID
  coverExtractedFrom?: string | null
}

export const extractReadaloudManifestStep = defineStep(
  "extract-readaloud-manifest",
  async (input: ExtractedEpubMetadata & { format: "readaloud" }, ctx) => {
    const manifest = await generateReadiumManifest(input.epub, {
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

export type ExtractedReadaloudManifest = ExtractedEpubMetadata & {
  format: "readaloud"
} & {
  manifest: ReadiumWebPublicationManifest
  pageCount: number | null
  duration: number | null
  coverImageUuid?: UUID
  coverExtractedFrom?: string | null
}

export const extractAudiobookManifestStep = defineStep(
  "extract-audiobook-manifest",
  async (input: ExtractedAudiobookMetadata, _ctx) => {
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
    const serialized = manifest.serialize() as ReadiumWebPublicationManifest

    return {
      ...input,
      manifest: serialized,
      pageCount: null,
      duration: deriveAudiobookDuration(serialized),
    }
  },
)

export type ExtractedAudiobookManifest = ExtractedAudiobookMetadata & {
  manifest: ReadiumWebPublicationManifest
  pageCount: null
  duration: number | null
  coverImageUuid?: UUID
  coverExtractedFrom?: string | null
}
