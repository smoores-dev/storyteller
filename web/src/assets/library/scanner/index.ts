import { logger } from "@/logging"

import { checkExistsStep } from "./steps/check-exists"
import { computeHashStep } from "./steps/compute-hash"
import { determineFormatStep } from "./steps/determine-format"
import { extractCoversStep } from "./steps/extract-covers"
import { extractManifestStep } from "./steps/extract-manifest"
import { extractMetadataStep } from "./steps/extract-metadata"
import { openAudiobookStep } from "./steps/open-audiobook"
import { openEpubStep } from "./steps/open-epub"
import { reconcileMetadataStep } from "./steps/reconcile-metadata"
import { upgradeEpubStep } from "./steps/upgrade-epub"
import type {
  PipelineStep,
  ScanContext,
  ScanFlag,
  ScanFormat,
  ScanOptions,
} from "./types"

const steps: PipelineStep[] = [
  checkExistsStep,
  computeHashStep,
  openEpubStep,
  upgradeEpubStep,
  determineFormatStep,
  openAudiobookStep,
  extractMetadataStep,
  extractManifestStep,
  reconcileMetadataStep,
  extractCoversStep,
]

export function createScanContext(input: {
  bookUuid: ScanContext["bookUuid"]
  filepath: string
  format: ScanFormat
  missing: boolean
  existingHash: string | null
  flags?: ScanFlag[]
  book: ScanContext["book"]
  options?: ScanOptions
}): ScanContext {
  return {
    logger,
    bookUuid: input.bookUuid,
    filepath: input.filepath,
    format: input.format,
    flags: new Set(input.flags ?? []),
    missing: input.missing,
    existingHash: input.existingHash,
    fileHash: null,
    epub: null,
    audiobook: null,
    extractedMetadata: null,
    extractedRelations: {},
    book: input.book,
    manifest: null,
    isEpub2: false,
    pageCount: null,
    duration: null,
    fileSize: null,
    options: input.options ?? {},
  }
}

// -- pipeline runner ----------------------------------------------------------

async function cleanupExecutedSteps(
  ctx: ScanContext,
  executedSteps: PipelineStep[],
) {
  for (let i = executedSteps.length - 1; i >= 0; i--) {
    const step = executedSteps[i]
    if (!step?.cleanup) {
      continue
    }

    try {
      await step.cleanup(ctx)
    } catch (error) {
      logger.error({
        msg: "pipeline step cleanup failed",
        step: step.name,
        bookUuid: ctx.bookUuid,
        err: error,
      })
    }
  }
}

async function runSingleContext(ctx: ScanContext, signal: AbortSignal) {
  const executedSteps: PipelineStep[] = []

  for (const step of steps) {
    ctx.logger = logger.child({
      ctx: `[SCAN (${step.name})] '${ctx.book?.title}' {${ctx.format.toUpperCase()}} [${ctx.filepath}] (${ctx.bookUuid})`,
    })

    if (signal.aborted) {
      ctx.logger.debug("Scan aborted, stopping")
      break
    }

    try {
      const result = await step.run(ctx, signal)
      executedSteps.push(step)

      if (result === false) {
        break
      }
    } catch (error) {
      logger.error({
        msg: "pipeline step failed",
        step: step.name,
        bookUuid: ctx.bookUuid,
        filepath: ctx.filepath,
        format: ctx.format,
        err: error,
      })
      break
    }
  }

  await cleanupExecutedSteps(ctx, executedSteps)
}

type PipelineOptions = {
  concurrency: number
  signal: AbortSignal
  onProgress?: (processed: number, total: number) => void
}

export async function runBookScanPipeline(
  contexts: ScanContext[],
  options: PipelineOptions,
) {
  const total = contexts.length
  if (total === 0) {
    logger.debug("No books to scan")
    return
  }

  const concurrency = Math.max(1, options.concurrency)
  let nextIndex = 0
  let processed = 0

  logger.info(`Scanning ${total} book(s) with concurrency ${concurrency}`)

  const runWorker = async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      if (options.signal.aborted) {
        return
      }

      const index = nextIndex
      nextIndex += 1

      if (index >= contexts.length) {
        return
      }

      const ctx = contexts[index]
      if (!ctx) {
        continue
      }

      logger.debug(
        `Scanning ${index + 1}/${total}: ${ctx.book?.title ?? ctx.filepath}`,
      )
      await runSingleContext(ctx, options.signal)

      processed += 1
      options.onProgress?.(processed, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()))

  logger.info(`Scan pipeline finished: ${processed}/${total} book(s) processed`)
}

export type { ScanContext, ScanFlag, ScanFormat, ScanOptions } from "./types"
