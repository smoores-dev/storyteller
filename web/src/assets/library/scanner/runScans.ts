import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { scanAudiobook } from "@/assets/library/scanner/pipelines/scanAudiobook"
import { scanEbook } from "@/assets/library/scanner/pipelines/scanEbook"
import { ScanAbortedError } from "@/assets/library/scanner/step2"
import { type ScanInput } from "@/assets/library/scanner/types"

export async function runScans(
  inputs: ScanInput[],
  ctx: ScanCtx,
  concurrency: number,
) {
  const total = inputs.length
  if (total === 0) {
    ctx.setProgress(0, 0)
    return
  }

  ctx.setProgress(0, total)
  ctx.logger.debug(`Scanning ${total} input(s) with concurrency ${concurrency}`)

  const workers = Math.max(1, Math.min(concurrency, total))
  let next = 0
  let processed = 0

  const worker = async () => {
    while (!ctx.signal.aborted) {
      const index = next++
      if (index >= inputs.length) return

      const input = inputs[index]
      if (!input) return

      ctx.logger.debug(
        `Scanning ${input.book.title} ${input.format} [${index + 1}/${total}]`,
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
        if (err instanceof ScanAbortedError) {
          ctx.logger.debug(
            `Scan aborted for ${input.book.title} (${input.format})`,
          )
          return
        }

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
}
