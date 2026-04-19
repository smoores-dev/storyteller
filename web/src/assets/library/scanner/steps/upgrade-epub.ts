import { type PipelineStep } from "@/assets/library/scanner/types"
import { updateBook } from "@/database/books"

import { getFormatRelationPatch } from "./utils"

export const upgradeEpubStep: PipelineStep = {
  name: "upgrade-epub",

  async run(ctx) {
    if (!ctx.isEpub2) {
      return
    }

    // TODO: implement epub 2 -> epub 3 upgrade.
    // once implemented, this step should upgrade the file on disk,
    // then open the upgraded epub into ctx.epub so the rest of the
    // pipeline can proceed.

    if (!ctx.book) {
      ctx.logger.warn(
        `EPUB 2 file at ${ctx.filepath} cannot be imported (only EPUB 3 is supported)`,
      )
      return false
    }

    ctx.logger.info(`EPUB 2 detected, upgrade not yet implemented`)

    if (ctx.format !== "epub-unknown") {
      await updateBook(
        ctx.bookUuid,
        null,
        getFormatRelationPatch(ctx, { isEpub2: true }),
      )
    }

    return false
  },
}
