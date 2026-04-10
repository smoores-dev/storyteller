import { stat } from "node:fs/promises"

import { type BookWithRelations, getBooks, updateBook } from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  type ScanContext,
  type ScanOptions,
  createScanContext,
  runBookScanPipeline,
} from "./scanner"

function buildScanContexts(
  books: BookWithRelations[],
  options: ScanOptions = {},
): ScanContext[] {
  return books.flatMap((book) => {
    const contexts: ScanContext[] = []

    if (book.ebook?.filepath) {
      contexts.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "ebook",
          filepath: book.ebook.filepath,
          missing: book.ebook.missing,
          existingHash: book.ebook.contentHash ?? null,
          book,
          options,
        }),
      )
    }

    if (book.audiobook?.filepath) {
      contexts.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "audiobook",
          filepath: book.audiobook.filepath,
          missing: book.audiobook.missing,
          existingHash: book.audiobook.contentHash ?? null,
          book,
          options,
        }),
      )
    }

    if (book.readaloud?.filepath) {
      contexts.push(
        createScanContext({
          bookUuid: book.uuid,
          format: "readaloud",
          filepath: book.readaloud.filepath,
          missing: book.readaloud.missing,
          existingHash: book.readaloud.contentHash ?? null,
          book,
          options,
        }),
      )
    }

    return contexts
  })
}

async function updateReadaloudMissingState(
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
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
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

export async function scanExistingBooks(
  signal: AbortSignal,
  options?: {
    bookUuids?: UUID[]
    scanOptions?: ScanOptions
    excludeBookUuids?: Set<UUID>
  },
) {
  const books = await getBooks(options?.bookUuids ?? null)
  if (signal.aborted) {
    logger.debug("Library scan aborted")
    return
  }

  const excludeUuids = options?.excludeBookUuids
  const filteredBooks = excludeUuids
    ? books.filter((book) => !excludeUuids.has(book.uuid))
    : books

  const contexts = buildScanContexts(filteredBooks, options?.scanOptions)
  logger.info(`Scanning ${contexts.length} tracked book format(s)`)
  await runBookScanPipeline(contexts, {
    concurrency: 2,
    onProgress: (processed, total) => {
      logger.debug(`Scanning existing books: (${processed}/${total})`)
    },
    signal,
  })
  await updateReadaloudMissingState(filteredBooks, signal)
  logger.info("Library scan complete")
}
