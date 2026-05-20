import { readdir } from "node:fs/promises"
import { basename, extname, join } from "node:path"

import {
  Audiobook,
  type AudiobookInputs,
} from "@storyteller-platform/audiobook"
import { Epub, type EpubMetadataReader } from "@storyteller-platform/epub"

import { move } from "@/assets/fs"
import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { type Candidate, type ScanFormat } from "@/assets/library/scanner/types"
import { isAudioFile } from "@/audio"
import {
  type BookWithRelations,
  createBookFromAudiobook,
  createBookFromEpub,
} from "@/database/books"
import { addBooksToCollections } from "@/database/collections"
import { addIgnoreRule } from "@/database/importRules"
import { getSetting } from "@/database/settings"
import { isEpubVersionError } from "@/epub"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

export async function isReadaloudEpub(
  epub: EpubMetadataReader,
): Promise<boolean> {
  const manifest = await epub.getManifest()
  return Object.values(manifest).some((item) => item.mediaOverlay)
}
/**
 * Always returns a reader for an EPUB 3 file at `filepath`.
 */
export async function openOrUpgradeEpub(
  filepath: string,
): Promise<EpubMetadataReader> {
  try {
    return await Epub.from(filepath, { metadataOnly: true })
  } catch (error) {
    if (!isEpubVersionError(error)) throw error

    const [strategy, backupSuffix] = await Promise.all([
      getSetting("epub2ImportStrategy"),
      getSetting("epub2BackupSuffix"),
    ])

    if (strategy === "skip") throw error

    if (strategy === "backup-and-convert") {
      const backupPath = filepath.replace(/\.epub$/i, `${backupSuffix}.epub`)
      await addIgnoreRule(backupPath)
      await move(filepath, backupPath)
      using upgraded = await Epub.upgrade(backupPath, { outputPath: filepath })
      await upgraded.saveAndClose()
    } else {
      using upgraded = await Epub.upgrade(filepath)
      await upgraded.saveAndClose()
    }

    return await Epub.from(filepath, { metadataOnly: true })
  }
}

export type OpenedEpubResult = {
  epub: EpubMetadataReader
  format: Extract<ScanFormat, "ebook" | "readaloud">
}

export async function openAndClassifyEpub(
  candidate: Candidate,
  ctx: ScanCtx,
): Promise<OpenedEpubResult | null> {
  let epub: EpubMetadataReader
  try {
    epub = await openOrUpgradeEpub(candidate.filepath)
  } catch (error) {
    ctx.report.warn({
      step: "open-epub",
      msg: `Failed to open epub at ${candidate.filepath}; skipping`,
      err: error,
    })
    return null
  }

  ctx.scope?.use(epub)

  const isReadaloud =
    candidate.isReadaloud ??
    (candidate.format === "readaloud" || (await isReadaloudEpub(epub)))
  return { epub, format: isReadaloud ? "readaloud" : "ebook" }
}

export type OpenedAudiobookResult = {
  audiobook: Audiobook
}

export async function openAudiobookDir(
  candidate: Candidate,
  ctx: ScanCtx,
): Promise<OpenedAudiobookResult | null> {
  let tracks: AudiobookInputs
  try {
    const entries = await readdir(candidate.filepath, { recursive: true })
    tracks = entries
      .filter((entry) => isAudioFile(entry))
      .map((entry) => join(candidate.filepath, entry)) as AudiobookInputs
  } catch (error) {
    ctx.report.warn({
      step: "open-audiobook",
      msg: `Failed to read audiobook directory ${candidate.filepath}; skipping`,
      err: error,
    })
    return null
  }

  if (tracks.length === 0) return null

  let audiobook: Audiobook
  try {
    audiobook = await Audiobook.fromForMetadata(...tracks)
  } catch (error) {
    ctx.report.warn({
      step: "open-audiobook",
      msg: `Failed to open audiobook at ${candidate.filepath}; skipping`,
      err: error,
    })
    return null
  }

  ctx.scope?.use(audiobook)
  return { audiobook }
}

export async function createBookFromOpenedEpub(
  candidate: Candidate,
  opened: OpenedEpubResult,
  ctx: ScanCtx,
): Promise<BookWithRelations | null> {
  const fallbackTitle = basename(candidate.filepath, ".epub")

  let book: BookWithRelations
  try {
    book = await createBookFromEpub(
      opened.epub,
      {
        ...(candidate.bookUuidHint && { uuid: candidate.bookUuidHint }),
        title: fallbackTitle,
      },
      opened.format === "readaloud"
        ? {
            readaloud: {
              filepath: candidate.filepath,
              status: "ALIGNED",
              currentStage: "SPLIT_TRACKS",
            },
            ...(candidate.collections?.length && {
              collections: candidate.collections,
            }),
          }
        : {
            ebook: { filepath: candidate.filepath },
            ...(candidate.collections?.length && {
              collections: candidate.collections,
            }),
          },
    )
  } catch (error) {
    ctx.report.warn({
      step: "create-book",
      msg: `Failed to create book for ${candidate.filepath}`,
      err: error,
    })
    return null
  }

  ctx.report.recordAdded(book.uuid, book.title)
  logger.info({
    msg: `Created book ${book.title} (${book.uuid}) from ${candidate.filepath}`,
  })
  return book
}

export async function createBookFromOpenedAudiobook(
  candidate: Candidate,
  opened: OpenedAudiobookResult,
  ctx: ScanCtx,
): Promise<BookWithRelations | null> {
  const fallbackTitle = basename(
    candidate.filepath,
    extname(candidate.filepath),
  )

  let book: BookWithRelations
  try {
    book = await createBookFromAudiobook(
      opened.audiobook,
      {
        ...(candidate.bookUuidHint && { uuid: candidate.bookUuidHint }),
        title: fallbackTitle,
      },
      {
        audiobook: { filepath: candidate.filepath },
        ...(candidate.collections?.length && {
          collections: candidate.collections,
        }),
      },
    )
  } catch (error) {
    ctx.report.warn({
      step: "create-book",
      msg: `Failed to create book for ${candidate.filepath}`,
      err: error,
    })
    return null
  }

  ctx.report.recordAdded(book.uuid, book.title)
  logger.info({
    msg: `Created book ${book.title} (${book.uuid}) from ${candidate.filepath}`,
  })
  return book
}

/**
 * Add the book to any candidate collections it isn't already in. Used when
 * find-book returns an existing book that came from outside the current
 * scope (overlapping watch roots).
 */
export async function ensureCollections(
  book: BookWithRelations,
  collectionUuids: UUID[] | undefined,
): Promise<void> {
  if (!collectionUuids?.length) return
  const missing = collectionUuids.filter(
    (uuid) => !book.collections.some((c) => c.uuid === uuid),
  )
  if (!missing.length) return
  await addBooksToCollections(missing, [book.uuid])
}
