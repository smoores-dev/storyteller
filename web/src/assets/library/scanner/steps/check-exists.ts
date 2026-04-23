import { stat } from "node:fs/promises"

import { type ScanCtx } from "@/assets/library/scanner/ctx"
import { getFormatRelationPatch } from "@/assets/library/scanner/formatRelations"
import {
  type ScanInput,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

const STEP = "check-exists"

function isENOENT(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

export async function checkExists<T extends ScanInput>(
  input: T,
  ctx: ScanCtx,
): Promise<(T & { missing: false }) | null> {
  try {
    await stat(input.filepath)
  } catch (error) {
    if (!isENOENT(error)) throw error
    await handleMissing(input, ctx)
    return null
  }

  await handleFound(input, ctx)
  return { ...input, missing: false }
}

async function handleMissing(input: ScanInput, ctx: ScanCtx) {
  if (!isResolvedFormat(input.format)) {
    ctx.report.warn({
      step: STEP,
      msg: `Discovered file at ${input.filepath} no longer exists, skipping`,
      bookUuid: input.bookUuid,
    })
    return
  }

  if (input.missing) {
    ctx.report.skipped({
      step: STEP,
      bookUuid: input.bookUuid,
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

  ctx.report.skipped({
    step: STEP,
    bookUuid: input.bookUuid,
    format: input.format,
    reason: "missing-on-disk",
  })
}

async function handleFound(input: ScanInput, ctx: ScanCtx) {
  if (!isResolvedFormat(input.format) || !input.missing) {
    return
  }

  await updateBook(
    input.bookUuid,
    null,
    getFormatRelationPatch(input, { missing: false }),
  )

  ctx.report.info({
    step: STEP,
    bookUuid: input.bookUuid,
    format: input.format,
    msg: `File ${input.filepath} has been found, marking as not missing`,
  })
}
