import { stat } from "node:fs/promises"

import { type BookWithRelations, getBooks, updateBook } from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  type ScanContext,
  createScanContext,
  runBookScanPipeline,
} from "./scanner"

function buildScanContexts(books: BookWithRelations[]): ScanContext[] {
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
  bookUuids?: UUID[],
) {
  const books = await getBooks(bookUuids ?? null)
  if (signal.aborted) {
    logger.debug("Existing-book scan aborted")
    return
  }

  console.log("BOOKS", books)
  const contexts = buildScanContexts(books)
  logger.info(`Planning to scan ${contexts.length} existing books`)
  await runBookScanPipeline(contexts, signal)
  await updateReadaloudMissingState(books, signal)
  logger.info("Existing-book scan complete")
}
