import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { scanAudiobook } from "@/assets/library/scanner/pipelines/scanAudiobook"
import { scanEbook } from "@/assets/library/scanner/pipelines/scanEbook"
import { scanReadaloud } from "@/assets/library/scanner/pipelines/scanReadaloud"
import { scanUnknownEpub } from "@/assets/library/scanner/pipelines/scanUnknownEpub"
import { type ScanInput } from "@/assets/library/scanner/types"

async function scanOne(input: ScanInput, ctx: ScanCtx) {
  try {
    switch (input.format) {
      case "ebook":
        await scanEbook(input, ctx)
        return
      case "readaloud":
        await scanReadaloud(input, ctx)
        return
      case "audiobook":
        await scanAudiobook(input, ctx)
        return
      case "epub-unknown":
        await scanUnknownEpub(input, ctx)
        return
    }
  } catch (err) {
    if (
      input.format === "ebook" ||
      input.format === "audiobook" ||
      input.format === "readaloud"
    ) {
      ctx.report.failed({
        step: "scan",
        bookUuid: input.bookUuid,
        format: input.format,
        err,
      })
      return
    }

    ctx.report.warn({
      step: "scan",
      msg: "scan failed before format was resolved",
      bookUuid: input.bookUuid,
      err,
    })
  }
}

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

      await scanOne(input, ctx)

      processed += 1
      ctx.setProgress(processed, total)
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
}
