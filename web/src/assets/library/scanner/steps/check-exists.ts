import { stat } from "node:fs/promises"

import {
  type PipelineStep,
  isResolvedFormat,
} from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

import { getFormatRelationPatch } from "./utils"

function isENOENT(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}

async function handleMissingFile(
  ctx: Parameters<typeof getFormatRelationPatch>[0],
) {
  if (!isResolvedFormat(ctx.format)) {
    ctx.logger.warn(
      `Discovered file at ${ctx.filepath} no longer exists, skipping`,
    )
    return
  }

  if (ctx.missing) {
    ctx.logger.debug(`File ${ctx.filepath} already missing, skipping`)
    return
  }

  ctx.logger.debug(`File ${ctx.filepath} does not exist, marking as missing`)
  ctx.flags.add("missing")
  await updateBook(
    ctx.bookUuid,
    null,
    getFormatRelationPatch(ctx, { missing: true }),
  )
  ctx.missing = true
}

async function handleFoundFile(
  ctx: Parameters<typeof getFormatRelationPatch>[0],
) {
  if (!isResolvedFormat(ctx.format) || !ctx.missing) {
    return
  }

  ctx.logger.debug(
    `File ${ctx.filepath} has been found, marking as not missing`,
  )
  await updateBook(
    ctx.bookUuid,
    null,
    getFormatRelationPatch(ctx, { missing: false }),
  )
  ctx.missing = false
}

export const checkExistsStep: PipelineStep = {
  name: "check-exists",

  async run(ctx) {
    try {
      await stat(ctx.filepath)
    } catch (error) {
      if (!isENOENT(error)) {
        throw error
      }

      await handleMissingFile(ctx)
      return false
    }

    await handleFoundFile(ctx)
    return undefined
  },
}
