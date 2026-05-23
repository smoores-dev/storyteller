import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"

import { move } from "@/assets/fs"
import {
  getInternalAudioDirectory,
  getInternalEpubFilepath,
  getInternalOriginalAudioFilepath,
  getInternalReadaloudFilepath,
} from "@/assets/paths"
import { type BookWithRelations, getBook, updateBook } from "@/database/books"
import { getSetting } from "@/database/settings"
import {
  type ImportMode,
  type MetadataFieldOverrides,
} from "@/database/settingsTypes"
import { BookEvents } from "@/events"
import { type UUID } from "@/uuid"

import { relocateIfNeeded } from "./relocate"
import { scanBooks } from "./scan"
import { type ScanFormat } from "./types"

export type ReplaceAssetOpts = {
  book: BookWithRelations
  filepath: string
  format: ScanFormat
  importMode?: ImportMode
  metadataFieldOverrides?: MetadataFieldOverrides
  signal: AbortSignal
  userId?: UUID
}

/**
 * replace (or add) a format on an existing book from a server-local path.
 */
export async function replaceBookAsset(
  opts: ReplaceAssetOpts,
): Promise<BookWithRelations> {
  const { book, filepath, format, metadataFieldOverrides, signal, userId } =
    opts

  const importMode = opts.importMode ?? (await getSetting("importMode"))

  await relocateIfNeeded(book, filepath, format, importMode)

  if (importMode === "reference") {
    await updateBook(book.uuid, null, {
      [format]: {
        filepath,
        missing: false,
        ...(format === "readaloud" && {
          status: book.readaloud?.status ?? "ALIGNED",
          currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        }),
      },
    })
  }

  await scanBooks({
    source: "api",
    bookUuids: [book.uuid],
    options: {
      force: true,
      importMode,
      ...(metadataFieldOverrides && { metadataFieldOverrides }),
    },
    signal,
  })

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
 * replace (or add) a format on an existing book from an uploaded file.
 * always moves the uploaded file into internal storage
 */
export async function replaceBookAssetFromUpload(
  opts: ReplaceAssetFromUploadOpts,
): Promise<BookWithRelations> {
  const {
    book,
    uploadPath,
    format,
    relativePath,
    metadataFieldOverrides,
    signal,
  } = opts

  if (format === "ebook" || format === "readaloud") {
    const dest =
      format === "ebook"
        ? getInternalEpubFilepath(book)
        : getInternalReadaloudFilepath(book)

    await mkdir(dirname(dest), { recursive: true })
    await move(uploadPath, dest)

    await updateBook(book.uuid, null, {
      [format]: {
        filepath: dest,
        missing: false,
        ...(format === "readaloud" && {
          status: book.readaloud?.status ?? "ALIGNED",
          currentStage: book.readaloud?.currentStage ?? "SPLIT_TRACKS",
        }),
      },
    })
  } else {
    const filename = relativePath ?? "uploaded-audio"
    const dest = getInternalOriginalAudioFilepath(book, filename)

    await mkdir(dirname(dest), { recursive: true })
    await move(uploadPath, dest)

    if (!book.audiobook) {
      await updateBook(book.uuid, null, {
        audiobook: {
          filepath: getInternalAudioDirectory(book),
          missing: false,
        },
      })
    }
  }

  await scanBooks({
    source: "upload",
    bookUuids: [book.uuid],
    options: {
      force: true,
      ...(metadataFieldOverrides && { metadataFieldOverrides }),
    },
    signal,
  })

  const updated = await getBook(book.uuid)

  if (updated) {
    BookEvents.emit("message", {
      type: "bookUpdated",
      bookUuid: book.uuid,
      payload: updated,
    })
  }

  return updated ?? book
}
