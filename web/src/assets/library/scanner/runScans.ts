import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { scanAudiobook } from "@/assets/library/scanner/pipelines/scanAudiobook"
import { scanEbook } from "@/assets/library/scanner/pipelines/scanEbook"
import { type ScanInput } from "@/assets/library/scanner/types"
import { logger } from "@/logging"

export async function runScans(
  inputs: ScanInput[],
  ctx: ScanCtx,
  concurrency: number,
) {
  const total = inputs.length
  if (total === 0) {
    ctx.setProgress(0, 0)
    ctx.report.info({ step: "run-scans", msg: "No scan inputs to process" })
    return
  }

  ctx.setProgress(0, total)
  ctx.report.info({
    step: "run-scans",
    msg: `Scanning ${total} input(s) with concurrency ${concurrency}`,
  })

  const workers = Math.max(1, Math.min(concurrency, total))
  let next = 0
  let processed = 0

  const worker = async () => {
    while (!ctx.signal.aborted) {
      const index = next++
      if (index >= inputs.length) return

      const input = inputs[index]
      if (!input) return

      ctx.logger.info(
        `Scanning ${input.book.title} ${input.format} [${index}/${total}]`,
      )
      try {
        switch (input.format) {
          case "ebook":
          case "readaloud": {
            await scanEbook(input, ctx)
            break
          }
          case "audiobook": {
            await scanAudiobook(input, ctx)
            break
          }
        }
      } catch (err) {
        ctx.report.failed({
          step: "scan",
          book: input.book,
          format: input.format,
          err,
        })
      }

      processed += 1
      ctx.setProgress(processed, total)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))

  const duration = ctx.report.finishedAt ?? Date.now() - ctx.report.startedAt
  ctx.report.info({
    step: "scan",
    msg: `Scan completed in ${duration}ms`,
  })

  // report errors
  const errors = ctx.report
    .outcomes()
    .filter((outcome) => outcome.kind === "failed")

  if (errors.length > 0) {
    ctx.report.warn({
      step: "scan",
      msg: `Some scans failed, see below`,
    })
    for (const error of errors) {
      logger.error({
        msg: `Scanning ${error.bookTitle} (${error.format}) failed: `,
        err: error.err,
      })
    }
  }
}
