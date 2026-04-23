import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { getNumericValue } from "@/assets/library/scanner/manifestValue"
import {
  type AudiobookMetadataExtracted,
  type EpubMetadataExtracted,
} from "@/assets/library/scanner/types"
import { type SerializedManifest } from "@/components/reader/types"
import { ReadiumService } from "@/services/readiumService"
import { createAudiobookManifest } from "@/utils/audioManifest"

type EbookManifestExtras = {
  manifest: SerializedManifest
  pageCount: number | null
  duration: null
}

type ReadaloudManifestExtras = {
  manifest: SerializedManifest
  pageCount: number | null
  duration: number | null
}

type AudiobookManifestExtras = {
  manifest: SerializedManifest
  pageCount: null
  duration: number | null
}

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

export async function extractEbookManifest<
  T extends EpubMetadataExtracted & { format: "ebook" },
>(input: T, ctx: ScanCtx): Promise<T & EbookManifestExtras> {
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
}

export async function extractReadaloudManifest<
  T extends EpubMetadataExtracted & { format: "readaloud" },
>(input: T, ctx: ScanCtx): Promise<T & ReadaloudManifestExtras> {
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
}

export async function extractAudiobookManifest<
  T extends AudiobookMetadataExtracted,
>(input: T): Promise<T & AudiobookManifestExtras> {
  const manifestOptions = {
    bookId: input.book.uuid,
    title: input.book.title,
    updatedAt: new Date(input.book.updatedAt),
    ...(input.book.subtitle ? { subtitle: input.book.subtitle } : {}),
    ...(input.book.description ? { description: input.book.description } : {}),
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
}
