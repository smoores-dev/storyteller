import { Epub, UnsupportedEpubVersionError } from "@storyteller-platform/epub"

import { type PipelineStep } from "@/assets/autoimport/scanner/types"
import { suppressPath, unsuppressPath } from "@/assets/autoimport/writeIntent"
import { updateBook } from "@/database/books"

import { getFormatRelationPatch } from "./utils"

export const openEpubStep: PipelineStep = {
  name: "open-epub",
  async run(ctx) {
    if (ctx.format === "audiobook") {
      return
    }

    if (!ctx.flags.has("changed") && !ctx.flags.has("new")) {
      return
    }

    try {
      ctx.epub = await Epub.from(ctx.filepath)
      return
    } catch (error) {
      if (!(error instanceof UnsupportedEpubVersionError)) {
        throw error
      }

      ctx.isEpub2 = true

      if (!ctx.book) {
        ctx.logger.warn(
          `EPUB 2 file at ${ctx.filepath} cannot be imported (only EPUB 3 is supported)`,
        )
        return false
      }

      ctx.logger.info(`Flagging ${ctx.book.title} as EPUB 2`)
      await updateBook(
        ctx.bookUuid,
        null,
        getFormatRelationPatch(ctx, { isEpub2: true }),
      )

      return false
    }
  },

  async cleanup(ctx) {
    if (!ctx.epub) {
      return
    }

    if (ctx.isEpub2 || (!ctx.flags.has("changed") && !ctx.flags.has("new"))) {
      ctx.epub.discardAndClose()
      ctx.epub = null
      return
    }

    suppressPath(ctx.filepath)
    try {
      await ctx.epub.saveAndClose()
    } finally {
      unsuppressPath(ctx.filepath)
    }
    ctx.epub = null
  },
}
