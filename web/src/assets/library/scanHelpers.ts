import { stat } from "node:fs/promises"

import { type BookWithRelations, updateBook } from "@/database/books"
import { type UUID } from "@/uuid"

import {
  type ScanContext,
  type ScanFlag,
  type ScanFormat,
  type ScanOptions,
  createScanContext,
} from "./scanner"

export function getScopedBooks(
  allBooks: BookWithRelations[],
  collectionUuid: UUID | null,
): BookWithRelations[] {
  if (!collectionUuid) {
    return allBooks
  }

  return allBooks.filter((book) =>
    book.collections.some((collection) => collection.uuid === collectionUuid),
  )
}

export function registerFormats(
  formatsByBook: Map<UUID, Set<ScanFormat>>,
  bookUuid: UUID,
  formats: ScanFormat[],
) {
  if (!formats.length) {
    return
  }

  const existing = formatsByBook.get(bookUuid) ?? new Set<ScanFormat>()
  for (const format of formats) {
    existing.add(format)
  }
  formatsByBook.set(bookUuid, existing)
}

type BuildContextOptions = {
  formatFilter?: Map<UUID, Set<ScanFormat>>
  newFormats?: Map<UUID, Set<ScanFormat>>
  scanOptions?: ScanOptions
}

export function buildScanContexts(
  books: BookWithRelations[],
  options: BuildContextOptions = {},
): ScanContext[] {
  return books.flatMap((book) => {
    const allowedFormats = options.formatFilter?.get(book.uuid)
    const newFormats = options.newFormats?.get(book.uuid) ?? new Set<ScanFormat>()
    const makeFlags = (format: ScanFormat): ScanFlag[] =>
      newFormats.has(format) ? ["new"] : []

    const contexts: ScanContext[] = []

    if (book.ebook?.filepath && (!allowedFormats || allowedFormats.has("ebook"))) {
      contexts.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "ebook",
          filepath: book.ebook.filepath,
          missing: book.ebook.missing,
          existingHash: book.ebook.contentHash ?? null,
          flags: makeFlags("ebook"),
          book,
          options: options.scanOptions,
        }),
      )
    }

    if (book.audiobook?.filepath && (!allowedFormats || allowedFormats.has("audiobook"))) {
      contexts.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "audiobook",
          filepath: book.audiobook.filepath,
          missing: book.audiobook.missing,
          existingHash: book.audiobook.contentHash ?? null,
          flags: makeFlags("audiobook"),
          book,
          options: options.scanOptions,
        }),
      )
    }

    if (book.readaloud?.filepath && (!allowedFormats || allowedFormats.has("readaloud"))) {
      contexts.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "readaloud",
          filepath: book.readaloud.filepath,
          missing: book.readaloud.missing,
          existingHash: book.readaloud.contentHash ?? null,
          flags: makeFlags("readaloud"),
          book,
          options: options.scanOptions,
        }),
      )
    }

    return contexts
  })
}

function isENOENT(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "ENOENT"
  )
}

export async function updateReadaloudMissingState(
  books: BookWithRelations[],
  signal: AbortSignal,
) {
  for (const book of books) {
    if (signal.aborted) {
      return
    }

    if (!book.readaloud?.filepath) {
      continue
    }

    try {
      await stat(book.readaloud.filepath)

      if (!book.readaloud.missing) {
        continue
      }

      await updateBook(book.uuid, null, {
        readaloud: {
          filepath: book.readaloud.filepath,
          missing: false,
          currentStage: book.readaloud.currentStage,
        },
      })
      continue
    } catch (error) {
      if (!isENOENT(error)) {
        throw error
      }
    }

    if (book.readaloud.missing) {
      continue
    }

    await updateBook(book.uuid, null, {
      readaloud: {
        filepath: book.readaloud.filepath,
        missing: true,
        currentStage: book.readaloud.currentStage,
      },
    })
  }
}
