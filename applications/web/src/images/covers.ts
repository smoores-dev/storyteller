import {
  type AudiobookCoverSource,
  type CoverData,
  type EpubCoverSource,
  extractAudioCoverFromReadaloud,
  extractAudioCoverFromReadaloudAudio,
  extractCoverFileFromAudioDir,
  extractCoverFromAudioFiles,
  extractCoverFromEpub,
} from "@/assets/covers"
import { type BookWithRelations, touchBook } from "@/database/books"
import {
  type CoverFormat,
  type CoverOrigin,
  type FormatCover,
  type Image,
  setFormatCover,
} from "@/database/images"
import { type UUID } from "@/uuid"

import { ingestImage } from "./ingest"

export type TextCoverSources = {
  ebook?: EpubCoverSource | null
  readaloud?: EpubCoverSource | null
}

export type AudioCoverSources = {
  audiobook?: AudiobookCoverSource | null
  readaloud?: EpubCoverSource | null
  audiobookDir?: string | null
}

export async function extractTextCover({
  ebook = null,
  readaloud = null,
}: TextCoverSources): Promise<CoverData | null> {
  const primary = readaloud ?? ebook
  if (!primary) return null

  const cover = await extractCoverFromEpub(primary)
  if (cover) return cover

  if (readaloud && ebook && readaloud !== ebook) {
    return await extractCoverFromEpub(ebook)
  }

  return null
}

export async function extractAudioCover({
  audiobook = null,
  readaloud = null,
  audiobookDir = null,
}: AudioCoverSources): Promise<CoverData | null> {
  const strategies: (() => Promise<CoverData | null>)[] = []

  if (readaloud) {
    strategies.push(() => extractAudioCoverFromReadaloud(readaloud))
    strategies.push(() => extractAudioCoverFromReadaloudAudio(readaloud))
  }

  const looseCoverDir =
    audiobookDir ?? (typeof audiobook === "string" ? audiobook : null)
  if (looseCoverDir) {
    strategies.push(() => extractCoverFileFromAudioDir(looseCoverDir))
  }

  if (audiobook) {
    strategies.push(() => extractCoverFromAudioFiles(audiobook))
  }

  for (const strategy of strategies) {
    const cover = await strategy()
    if (cover) return cover
  }

  return null
}

export async function ingestCover(cover: CoverData): Promise<Image | null> {
  return await ingestImage(cover.data, { sourceName: cover.filename })
}

export type CoverTarget = {
  format: CoverFormat
  fingerprint?: string | null
}

export function textCoverTargets(book: BookWithRelations): CoverTarget[] {
  const targets: CoverTarget[] = []

  if (book.ebook) {
    targets.push({ format: "ebook", fingerprint: book.ebook.fingerprint })
  }
  if (book.readaloud) {
    targets.push({
      format: "readaloud",
      fingerprint: book.readaloud.fingerprint,
    })
  }

  return targets
}

export function audioCoverTargets(book: BookWithRelations): CoverTarget[] {
  if (!book.audiobook) return []
  return [{ format: "audiobook", fingerprint: book.audiobook.fingerprint }]
}

export async function attachCover(
  bookUuid: UUID,
  targets: CoverTarget[],
  image: Image | null,
  origin: CoverOrigin,
): Promise<void> {
  for (const target of targets) {
    await setFormatCover(target.format, bookUuid, {
      imageUuid: image?.uuid ?? null,
      origin,
      ...(origin === "extracted" && { extractedFrom: target.fingerprint }),
    })
  }

  await touchBook(bookUuid)
}

export function shouldExtractCover(
  mode: "skip" | "merge" | "always",
  current: FormatCover | null | undefined,
  fingerprint: string | null,
): boolean {
  if (mode === "skip") return false
  if (mode === "always") return true
  if (!current) return true

  if (current.coverOrigin === "user" || current.coverOrigin === "cleared") {
    return false
  }

  if (
    current.coverExtractedFrom !== null &&
    current.coverExtractedFrom === fingerprint
  ) {
    return false
  }

  return true
}
