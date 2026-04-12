import { stat } from "node:fs/promises"

import { type PipelineStep } from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

import { getFormatRelationPatch } from "./utils"

export const checkExistsStep: PipelineStep = {
  name: "check-exists",
  async run(ctx) {
    try {
      await stat(ctx.filepath)

      if (!ctx.missing) {
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
      return
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error
      }

      if (ctx.missing) {
        ctx.logger.debug(`File ${ctx.filepath} already missing, skipping`)
        return false
      }

      ctx.logger.debug(
        `File ${ctx.filepath} does not exist, marking as missing`,
      )
      ctx.flags.add("missing")
      await updateBook(
        ctx.bookUuid,
        null,
        getFormatRelationPatch(ctx, { missing: true }),
      )
      ctx.missing = true
      return false
    }
  },
}
