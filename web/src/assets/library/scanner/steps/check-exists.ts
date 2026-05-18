import { stat } from "node:fs/promises"

import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import { defineStep } from "@/assets/library/scanner/step2"
import { type Existing, type ScanInput } from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "check-exists"

export type CheckExistsInput = ScanInput
export type CheckExistsOutput = Existing

function isENOENT(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

async function handleMissing(input: ScanInput, ctx: ScanCtx) {
  // Tentative inputs have no relation row yet, so there's nothing to
  // mark missing. Just drop the input — discovery will surface the file
  // again next scan if it reappears.
  if (input.formatTentative) {
    ctx.report.skipped({
      step: STEP,
      book: input.book,
      format: input.format,
      reason: "tentative-file-vanished",
    })
    return
  }

  if (input.missing) {
    ctx.report.skipped({
      step: STEP,
      book: input.book,
      format: input.format,
      reason: "already-marked-missing",
    })
    return
  }

  await updateBook(
    input.bookUuid,
    null,
    getFormatRelationPatch(input, { missing: true }),
  )

  ctx.report.recordNewlyMissing(input.bookUuid, input.book.title)
  ctx.report.info({
    step: STEP,
    msg: `File went missing: ${input.filepath}`,
    book: input.book,
    format: input.format,
  })
}

async function handleFound(input: ScanInput, ctx: ScanCtx) {
  // Tentative inputs don't have an existing relation; reconcile-metadata
  // will create one with missing: false at the end of the pipeline.
  if (input.formatTentative) return

  const isMissing = input.book[input.format]?.missing ?? false
  if (isMissing) {
    await updateBook(
      input.bookUuid,
      null,
      getFormatRelationPatch(input, { missing: false }),
    )

    ctx.report.info({
      step: STEP,
      msg: `File ${input.filepath} has been found, marking as not missing`,
    })
  }
}

export const checkExistsStep = defineStep(
  STEP,
  async (input: ScanInput, ctx) => {
    try {
      await stat(input.filepath)
    } catch (error) {
      if (!isENOENT(error)) throw error
      await handleMissing(input, ctx)
      return null
    }

    await handleFound(input, ctx)
    return { ...input, missing: false as const }
  },
)
