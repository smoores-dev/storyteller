import { rm } from "node:fs/promises"

import {
  getInternalAudioDirectory,
  getInternalBookDirectory,
  getInternalEpubFilepath,
  getInternalReadaloudFilepath,
} from "@/assets/paths"
import { type Book, type BookWithRelations, getBook } from "@/database/books"
import { getSetting } from "@/database/settings"
import {
  type ImportMode,
  type MetadataFieldOverrides,
} from "@/database/settingsTypes"
import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { pathBelongsTo } from "./folder"
import { filepathFolder, scan } from "./scan"
import { type Candidate, type ScanFormat } from "./types"
import { releasePrefixAfterSettle, suppressPrefix } from "./write-intent"

async function clearInternalAssetForFormat(book: Book, format: ScanFormat) {
  const assetDir = getInternalBookDirectory(book)
  suppressPrefix(assetDir)
  try {
    if (format === "audiobook") {
      const audioDir = getInternalAudioDirectory(book)
      await rm(audioDir, {
        recursive: true,
        force: true,
      })
      return
    }

    const filepath =
      format === "ebook"
        ? getInternalEpubFilepath(book)
        : getInternalReadaloudFilepath(book)
    await rm(filepath, { force: true })
  } finally {
    releasePrefixAfterSettle(assetDir)
  }
}

export class ReplaceAssetInsideBookDirError extends Error {
  constructor() {
    super(
      "Cannot replace from a path inside the book's asset folder. " +
        "Pick a source outside the library, or remove the format first.",
    )
    this.name = "ReplaceAssetInsideBookDirError"
  }
}

function assertSourceOutsideAssetDir(book: Book, filepath: string) {
  const internalDir = getInternalBookDirectory(book)
  if (pathBelongsTo(internalDir, filepath)) {
    throw new ReplaceAssetInsideBookDirError()
  }
}

export type ReplaceAssetOpts = {
  book: BookWithRelations
  filepath: string
  format: ScanFormat
  importMode?: ImportMode
  metadataFieldOverrides?: MetadataFieldOverrides
  signal: AbortSignal
  userId?: UUID
}

function buildReplaceCandidate(
  book: BookWithRelations,
  filepath: string,
  format: ScanFormat,
  importMode: ImportMode,
): Candidate {
  return {
    folder: filepathFolder(filepath),
    format,
    filepath,
    existingBook: book,
    importMode,
  }
}

async function emitBookUpdated(
  book: BookWithRelations,
  userId: UUID | undefined,
): Promise<BookWithRelations> {
  const updated = await getBook(book.uuid, userId)
  if (updated) {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: updated,
    })
  }
  return updated ?? book
}

/**
 * replace (or add) a format on an existing book from a server-local path.
 * idea: build a Candidate with existingBook set
 * and let ingest+pipeline do the rest.
 */
export async function replaceBookAsset(
  opts: ReplaceAssetOpts,
): Promise<BookWithRelations> {
  const { book, filepath, format, metadataFieldOverrides, signal, userId } =
    opts
  const importMode = opts.importMode ?? (await getSetting("importMode"))

  assertSourceOutsideAssetDir(book, filepath)

  // when replacing an existing format, wipe what's on disk first
  if (book[format]) {
    const assetDir = getInternalBookDirectory(book)
    suppressPrefix(assetDir)
    await clearInternalAssetForFormat(book, format)
  }

  await scan({
    source: "api",
    request: {
      kind: "candidates",
      candidates: [buildReplaceCandidate(book, filepath, format, importMode)],
    },
    options: {
      force: true,
      importMode,
      ...(metadataFieldOverrides && { metadataFieldOverrides }),
    },
    signal,
  })

  return emitBookUpdated(book, userId)
}

export type ReplaceAssetFromUploadOpts = {
  book: BookWithRelations
  uploadPath: string
  format: ScanFormat
  /** only used for audiobook uploads: the relative path within the audiobook directory */
  relativePath?: string
  metadataFieldOverrides?: MetadataFieldOverrides
  signal: AbortSignal
}

/**
 * scan an existing audiobook directory after one or more new tracks have been
 * staged. used by both `replaceBookAssetFromUpload` (single-shot path) and
 * the finalize endpoint that drains a partially-failed batch.
 */
export async function scanReplacedAudiobook(opts: {
  book: BookWithRelations
  metadataFieldOverrides?: MetadataFieldOverrides
  signal: AbortSignal
}): Promise<BookWithRelations> {
  const audioDir = getInternalAudioDirectory(opts.book)

  await scan({
    source: "upload",
    request: {
      kind: "candidates",
      candidates: [
        {
          folder: audioDir,
          format: "audiobook",
          filepath: audioDir,
          existingBook: opts.book,
        },
      ],
    },
    options: {
      force: true,
      ...(opts.metadataFieldOverrides && {
        metadataFieldOverrides: opts.metadataFieldOverrides,
      }),
    },
    signal: opts.signal,
  })
  return emitBookUpdated(opts.book, undefined)
}

// TODO: this could likely be replaced by just scanning the upload batch directory
// and updating the move mode to work with a bookUuidHint
export async function replaceBookAssetFromUpload(
  opts: ReplaceAssetFromUploadOpts,
): Promise<BookWithRelations | null> {
  const { book, uploadPath, format, metadataFieldOverrides, signal } = opts

  await clearInternalAssetForFormat(book, format)

  // ebook/readaloud: relocateIfNeeded overwrites the dest file, so the
  // single-file case is fine without an explicit clear.
  await scan({
    source: "upload",
    request: {
      kind: "candidates",
      candidates: [buildReplaceCandidate(book, uploadPath, format, "move")],
    },
    options: {
      force: true,
      importMode: "move",
      ...(metadataFieldOverrides && { metadataFieldOverrides }),
    },
    signal,
  })

  return emitBookUpdated(book, undefined)
}
