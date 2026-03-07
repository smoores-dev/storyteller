import { logger } from "@/logging"

import {
  type PipelineRunnerOptions,
  type PipelineStep,
  type ScanContext,
} from "./types"

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

async function runSingleContext(
  ctx: ScanContext,
  steps: PipelineStep[],
  signal: AbortSignal,
) {
  const executedSteps: PipelineStep[] = []

  for (const step of steps) {
    const childLogger = logger.child({
      step: step.name,
      bookTitle: ctx.book?.title,
      format: ctx.format,
      bookUuid: ctx.bookUuid,
      filepath: ctx.filepath,
    })
    ctx.logger = childLogger
    if (signal.aborted) {
      childLogger.error("Scan pipeline aborted, stopping step")
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

export async function runPipeline(
  contexts: ScanContext[],
  steps: PipelineStep[],
  options: PipelineRunnerOptions,
) {
  const total = contexts.length
  if (total === 0) {
    logger.info("No books to scan")
    return
  }

  const concurrency = Math.max(1, options.concurrency)
  let nextIndex = 0
  let processed = 0

  const runWorker = async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
    while (true) {
      if (options.signal.aborted) {
        logger.error("Scan pipeline aborted, stopping workers")
        return
      }

      const index = nextIndex
      nextIndex += 1

      if (index >= contexts.length) {
        logger.info("Scan pipeline completed, stopping workers")
        return
      }

      const ctx = contexts[index]
      if (!ctx) {
        logger.error("Scan pipeline context is undefined, stopping workers")
        continue
      }

      logger.info(`Scan pipeline running context ${index} of ${total}`)
      await runSingleContext(ctx, steps, options.signal)
      processed += 1
      options.onProgress?.(processed, total)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()))
}
