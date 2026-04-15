import { getBooks } from "@/database/books"
import { logger } from "@/logging"
import { type UUID } from "@/uuid"

import {
  buildScanContexts,
  updateReadaloudMissingState,
} from "./scanHelpers"
import { type ScanOptions, runBookScanPipeline } from "./scanner"

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

  const contexts = buildScanContexts(filteredBooks, {
    ...(options?.scanOptions && { scanOptions: options.scanOptions }),
  })

  logger.info(`Scanning ${contexts.length} tracked book format(s)`)
  await runBookScanPipeline(contexts, { concurrency: 2, signal })
  await updateReadaloudMissingState(filteredBooks, signal)
  logger.info("Library scan complete")
}
